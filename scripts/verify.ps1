# Miro - verification runner
#
# Runs every check the project promises, in the order a reviewer would want
# them, and stops the summary from implying more than was run.
#
# Usage:
#   .\scripts\verify.ps1              # everything that is available
#   .\scripts\verify.ps1 -Fast        # skip the release build
#   .\scripts\verify.ps1 -RustOnly
#   .\scripts\verify.ps1 -FrontendOnly

[CmdletBinding()]
param(
    [switch]$Fast,
    [switch]$RustOnly,
    [switch]$FrontendOnly
)

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

$results = New-Object System.Collections.Generic.List[object]

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Body,
        [switch]$Optional
    )
    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    $started = Get-Date
    $output = & $Body 2>&1 | Out-String
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 0 }
    $seconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)

    $output.Trim() | Write-Host
    $status = if ($code -eq 0) { 'pass' } elseif ($Optional) { 'skipped/failed' } else { 'FAIL' }
    if ($code -ne 0) { Write-Host "$Name -> $status (exit $code)" -ForegroundColor Red }
    else { Write-Host "$Name -> ok ($seconds s)" -ForegroundColor Green }

    $results.Add([pscustomobject]@{ Step = $Name; Exit = $code; Seconds = $seconds; Status = $status })
}

$env:npm_config_cache = Join-Path $env:TEMP 'npm-cache'
. (Join-Path $PSScriptRoot 'toolchain\env.ps1') | Out-Null

if (-not $RustOnly) {
    Invoke-Step 'frontend: typecheck' { npx tsc --noEmit }
    Invoke-Step 'frontend: lint' { npx eslint . }
    Invoke-Step 'frontend: unit tests' { npx vitest run }
    Invoke-Step 'frontend: production build' { npx vite build }
}

if (-not $FrontendOnly) {
    Invoke-Step 'rust: format check' { cargo fmt --manifest-path src-tauri/Cargo.toml -- --check }
    Invoke-Step 'rust: clippy' { cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings }
    Invoke-Step 'rust: unit tests' { cargo test --manifest-path src-tauri/Cargo.toml --lib }
    Invoke-Step 'rust: check' { cargo check --manifest-path src-tauri/Cargo.toml }
    if (-not $Fast) {
        Invoke-Step 'rust: release build' { cargo build --manifest-path src-tauri/Cargo.toml --release }
    }
}

Invoke-Step 'privacy: no audio or transcript files' { & (Join-Path $PSScriptRoot 'privacy-audit.ps1') }

Write-Host ""
Write-Host "=== summary ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize | Out-String | Write-Host

$failed = @($results | Where-Object { $_.Status -eq 'FAIL' })
if ($failed.Count -gt 0) {
    Write-Host "$($failed.Count) step(s) failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "all steps passed" -ForegroundColor Green
Pop-Location
exit 0
