# Dot-source this to build Miro on Windows without Visual Studio Build Tools:
#   . .\scripts\toolchain\env.ps1
#
# What it fixes, in order:
#   1. puts cargo/rustc on PATH for this session;
#   2. puts the Rust GNU toolchain's own binutils first on PATH. Without this,
#      an unrelated 32-bit MinGW on the machine (C:\MinGW is a common one) is
#      picked up as `dlltool`/`ar`, and the build dies with
#      "dlltool ... Invalid bfd target" or a linking error;
#   3. points CC/CXX/AR and CMake at Zig, which is what compiles whisper.cpp
#      without Visual Studio;
#   4. points bindgen at the pip `libclang` wheel.
#
# On a machine with the MSVC build tools you do not need this file at all.
#
# Note: this file is meant to be dot-sourced, so it leaves the caller's
# $ErrorActionPreference alone.

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$toolchain = Join-Path $repoRoot 'scripts\toolchain'

# --- 1. cargo on PATH -------------------------------------------------------
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if ($env:Path -notlike "*$cargoBin*") { $env:Path = "$cargoBin;$env:Path" }

$rustc = & rustc --version 2>$null
$cargo = & cargo --version 2>$null

# --- 2. binutils that can actually build pe-x86-64 import libraries --------
# rustc shells out to `dlltool` for import libraries on the GNU target and takes
# whatever PATH hands it first. Two traps are handled here:
#   * an unrelated 32-bit MinGW on the machine (C:\MinGW is a common one) fails
#     with "Invalid bfd target";
#   * rustup's own bundled dlltool cannot run on its own (it has no assembler
#     beside it) and fails with a bare "CreateProcess".
# `scripts/setup-toolchain.ps1` installs the portable LLVM-MinGW build whose
# llvm-dlltool/llvm-as do work; if it is present it wins.
$llvmMingwBin = $null
$llvmMingwRoot = Join-Path $env:USERPROFILE '.miro-toolchain'
$llvmMingwDir = Get-ChildItem $llvmMingwRoot -Directory -Filter 'llvm-mingw*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($llvmMingwDir) {
    $candidateBin = Join-Path $llvmMingwDir.FullName 'bin'
    if (Test-Path (Join-Path $candidateBin 'dlltool.exe')) { $llvmMingwBin = $candidateBin }
}
$rustBinutils = $null
$sysroot = (& rustc --print sysroot 2>$null)
$hostLine = (& rustc -vV 2>$null | Select-String -Pattern '^host:' | Select-Object -First 1)
if ($sysroot -and $hostLine) {
    $hostTriple = ($hostLine.ToString() -split ':', 2)[1].Trim()
    foreach ($dir in @(
        (Join-Path $sysroot "lib\rustlib\$hostTriple\bin\self-contained"),
        (Join-Path $sysroot "lib\rustlib\$hostTriple\bin"),
        (Join-Path $sysroot 'bin')
    )) {
        if (Test-Path (Join-Path $dir 'x86_64-w64-mingw32-gcc.exe')) { $rustBinutils = $dir; break }
    }
}

if ($llvmMingwBin) {
    # Prefer the curated override directory: llvm-dlltool/llvm-as plus the DLLs
    # they need, without llvm-mingw's gcc, which must not shadow the Rust
    # toolchain's own linker driver.
    $override = Join-Path $env:USERPROFILE '.miro-toolchain\binutils'
    $env:MIRO_RUST_BINUTILS = if (Test-Path (Join-Path $override 'dlltool.exe')) { $override } else { $llvmMingwBin }
} elseif ($rustBinutils) {
    $env:MIRO_RUST_BINUTILS = $rustBinutils
}

if ($env:MIRO_RUST_BINUTILS) {
    # llvm-mingw's bin comes first (dlltool/as/nm and the DLLs they need live
    # there), then the Rust toolchain's own gcc/ld. Any foreign MinGW is dropped
    # from this session's PATH.
    $kept = ($env:Path -split ';') | Where-Object {
        $_ -ne '' -and $_ -notmatch '(?i)MinGW(32|64)?\\bin'
    }
    $prefix = @($env:MIRO_RUST_BINUTILS)
    if ($rustBinutils -and $rustBinutils -ne $env:MIRO_RUST_BINUTILS) { $prefix += $rustBinutils }
    $env:Path = "$($prefix -join ';');$($kept -join ';')"
}

# --- 3. Zig as the C/C++ compiler ------------------------------------------
function Find-Zig {
    if ($env:ZIG -and (Test-Path $env:ZIG)) { return $env:ZIG }

    $onPath = Get-Command zig -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }

    try {
        $fromWheel = & python -c "import os,ziglang;print(os.path.join(os.path.dirname(ziglang.__file__),'zig.exe'))" 2>$null
        if ($fromWheel -and (Test-Path $fromWheel)) { return $fromWheel.Trim() }
    } catch { }

    $patterns = @(
        "$env:APPDATA\Python\Python3*\Scripts\zig.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python3*\Scripts\zig.exe",
        "$env:USERPROFILE\scoop\shims\zig.exe",
        "C:\zig\zig.exe"
    )
    foreach ($pattern in $patterns) {
        $hit = Get-ChildItem $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    return $null
}

$zig = Find-Zig
if (-not $zig) {
    Write-Warning "Zig not found, so no C/C++ compiler was configured. Install it with 'python -m pip install --user ziglang', or build with the MSVC build tools instead."
} else {
    $env:ZIG = $zig
    $env:CC = Join-Path $toolchain 'zigcc.cmd'
    $env:CXX = Join-Path $toolchain 'zigcxx.cmd'
    $env:AR = Join-Path $toolchain 'zigar.cmd'
    $env:CMAKE_TOOLCHAIN_FILE = Join-Path $toolchain 'zig-toolchain.cmake'
    $env:CMAKE_GENERATOR = 'Ninja'
    $env:ZIG_GLOBAL_CACHE_DIR = Join-Path $env:TEMP 'miro-zig-cache\global'
    $env:ZIG_LOCAL_CACHE_DIR = Join-Path $env:TEMP 'miro-zig-cache\local'
    New-Item -ItemType Directory -Force -Path $env:ZIG_GLOBAL_CACHE_DIR, $env:ZIG_LOCAL_CACHE_DIR | Out-Null
}

# --- 4. whisper.cpp build inputs --------------------------------------------
# whisper-rs-sys ships pre-generated bindings, but those were generated from
# Linux headers: on Windows they fail to compile with
#   E0080: attempt to compute `12_usize - 16_usize` (size_of "G_fpos_t" - 16)
# inside the generated bindings. Windows builds therefore must run bindgen,
# which is why WHISPER_DONT_GENERATE_BINDINGS is deliberately NOT set here;
# a libclang.dll is required for that (see step 4b).
#
# Only needed if you re-enable bindgen above.
if (-not $env:LIBCLANG_PATH) {
    # The pip `clang` wheel is the preferred source; clang-sys itself can also
    # pick up a standard LLVM install, so leave it when one is present.
    try {
        $clangNative = & python -c "import os,clang;print(os.path.join(os.path.dirname(clang.__file__),'native'))" 2>$null
        if ($clangNative -and (Test-Path (Join-Path $clangNative.Trim() 'libclang.dll'))) {
            $env:LIBCLANG_PATH = $clangNative.Trim()
        }
    } catch { }
    if (-not $env:LIBCLANG_PATH) {
        $standardLlvm = 'C:\Program Files\LLVM\bin'
        if (Test-Path (Join-Path $standardLlvm 'libclang.dll')) {
            $env:LIBCLANG_PATH = $standardLlvm
        }
    }
}

Write-Host "Miro build environment"
Write-Host "  rustc    : $rustc"
Write-Host "  cargo    : $cargo"
Write-Host "  binutils : $(if ($env:MIRO_RUST_BINUTILS) { $env:MIRO_RUST_BINUTILS } else { 'not found (falling back to PATH)' })"
if ($zig) {
    Write-Host "  zig      : $zig"
    Write-Host "  cc/cxx   : $env:CC"
    Write-Host "  cmake    : $env:CMAKE_TOOLCHAIN_FILE"
} else {
    Write-Host "  cc/cxx   : (existing toolchain, e.g. MSVC)"
}
Write-Host "  libclang : $(if ($env:LIBCLANG_PATH) { $env:LIBCLANG_PATH } else { 'not found' })"
