# Miro - fallback toolchain installer
#
# Builds Miro on Windows without administrator rights by installing portable,
# user-scope tools only. Idempotent: run it again and it will skip what exists.
#
#   .\scripts\setup-toolchain.ps1
#
# See docs/SETUP.md for what each piece is for.

[CmdletBinding()]
param(
    # Skip the ~180 MB LLVM-MinGW download if you already have it elsewhere.
    [switch]$SkipLlvmMingw
)

$ErrorActionPreference = 'Stop'
$toolchainRoot = Join-Path $env:USERPROFILE '.miro-toolchain'
New-Item -ItemType Directory -Force -Path $toolchainRoot | Out-Null

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "== $Message" -ForegroundColor Cyan
}

# --- Rust ------------------------------------------------------------------
Write-Step 'Rust (gnu target)'
$cargo = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
if (Test-Path $cargo) {
    Write-Host "already installed: $(& $cargo --version)"
    $targets = & (Join-Path $env:USERPROFILE '.cargo\bin\rustup.exe') target list --installed
    if ($targets -notcontains 'x86_64-pc-windows-gnu') {
        & (Join-Path $env:USERPROFILE '.cargo\bin\rustup.exe') target add x86_64-pc-windows-gnu
    }
} else {
    Write-Host 'installing rustup (user scope)...'
    $init = Join-Path $env:TEMP 'miro-rustup-init.exe'
    Invoke-WebRequest -Uri 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-gnu/rustup-init.exe' -OutFile $init -UseBasicParsing
    & $init -y --default-host x86_64-pc-windows-gnu --profile minimal
    & (Join-Path $env:USERPROFILE '.cargo\bin\rustup.exe') component add clippy rustfmt
}

# --- Python packages -------------------------------------------------------
Write-Step 'CMake, Ninja, libclang, Zig (pip, user scope)'
python -m pip install --user --quiet --upgrade cmake ninja libclang ziglang
python -c "import shutil; print('  cmake   :', shutil.which('cmake'))"
python -c "import shutil; print('  zig     :', shutil.which('zig'))"
python -c "import os, clang; p=os.path.join(os.path.dirname(clang.__file__),'native'); print('  libclang:', p if os.path.exists(os.path.join(p,'libclang.dll')) else 'MISSING')"

# --- LLVM-MinGW ------------------------------------------------------------
Write-Step 'LLVM-MinGW (portable binutils for the GNU target)'
$existing = Get-ChildItem $toolchainRoot -Directory -Filter 'llvm-mingw*' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $SkipLlvmMingw) {
    if ($existing) {
        Write-Host "already installed: $($existing.Name)"
    } else {
        Write-Host 'downloading the latest release (about 180 MB)...'
        $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/mstorsjo/llvm-mingw/releases/latest' -Headers @{ 'User-Agent' = 'miro-setup' }
        $asset = $release.assets | Where-Object { $_.name -like '*msvcrt-x86_64.zip' } | Select-Object -First 1
        if (-not $asset) { throw 'no x86_64 msvcrt asset found in the latest llvm-mingw release' }
        $zip = Join-Path $toolchainRoot 'llvm-mingw.zip'
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -UseBasicParsing
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $toolchainRoot)
        Remove-Item $zip -Force
        $existing = Get-ChildItem $toolchainRoot -Directory -Filter 'llvm-mingw*' | Select-Object -First 1
        Write-Host "installed: $($existing.Name)"
    }
}

if ($existing) {
    # rustc calls `dlltool` by name; the curated directory below gives it a copy
    # that runs standalone, without llvm-mingw's gcc shadowing Rust's linker.
    $source = Join-Path $existing.FullName 'bin'
    $target = Join-Path $toolchainRoot 'binutils'
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    foreach ($tool in 'dlltool', 'as', 'nm', 'windres', 'ranlib', 'strip', 'objcopy') {
        foreach ($name in @("$tool.exe", "x86_64-w64-mingw32-$tool.exe")) {
            $candidate = Join-Path $source $name
            if (Test-Path $candidate) {
                Copy-Item $candidate (Join-Path $target "$tool.exe") -Force
                break
            }
        }
    }
    Copy-Item (Join-Path $source '*.dll') $target -Force
    Write-Host "binutils copied to $target"
}

# --- Report ----------------------------------------------------------------
Write-Step 'Checking the environment'
. (Join-Path $PSScriptRoot 'toolchain\env.ps1')

Write-Host ""
Write-Host 'Next steps:' -ForegroundColor Green
Write-Host '  npm install'
Write-Host '  npm run app:dev'
