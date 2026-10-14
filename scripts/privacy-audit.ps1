# Miro - privacy audit
#
# Answers one question with evidence: after a dictation session, is there any
# audio or transcript left on disk?
#
# It looks where Miro is allowed to write (its own app data directory and the
# OS temp directory), and it reports file names, sizes and timestamps only. It
# never reads the contents of anything, so running it cannot itself expose a
# transcript.
#
# Usage:
#   .\scripts\privacy-audit.ps1              # audit now
#   .\scripts\privacy-audit.ps1 -Since '2026-10-12T05:00:00'   # only newer files
#   .\scripts\privacy-audit.ps1 -Json        # machine-readable output

[CmdletBinding()]
param(
    [string]$Since,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'

$appData = if ($env:APPDATA) { Join-Path $env:APPDATA 'app.miro.dictation' } else { $null }
$appLocal = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'app.miro.dictation' } else { $null }
$tempDir = [System.IO.Path]::GetTempPath()

$sinceTime = $null
if ($Since) {
    $sinceTime = [datetime]::Parse($Since)
}

# Extensions that would mean audio or text had been persisted.
$audioExtensions = @('.wav', '.pcm', '.raw', '.flac', '.mp3', '.m4a', '.ogg', '.webm')
$textExtensions = @('.txt', '.md', '.jsonl', '.log', '.srt', '.vtt', '.transcript')

# Files Miro is explicitly allowed to keep.
$allowedNames = @('config.json', 'config.invalid.json')
$allowedExtensions = @('.bin')   # model files the user asked for

function Get-ScannedFiles {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return @() }
    Get-ChildItem -Path $Path -Recurse -File -ErrorAction SilentlyContinue
}

$findings = New-Object System.Collections.Generic.List[object]
$scanned = 0
$allowed = New-Object System.Collections.Generic.List[object]

foreach ($root in @($appData, $appLocal, $tempDir)) {
    if (-not $root) { continue }
    foreach ($file in Get-ScannedFiles -Path $root) {
        if ($sinceTime -and $file.LastWriteTime -lt $sinceTime) { continue }
        $scanned++

        $name = $file.Name
        $extension = $file.Extension.ToLowerInvariant()

        if ($allowedNames -contains $name -or $allowedExtensions -contains $extension) {
            $allowed.Add([pscustomobject]@{ Path = $file.FullName; Size = $file.Length; Reason = 'permitted' })
            continue
        }

        # Anything Miro created itself is named with this prefix.
        $isMiroNamed = $name.StartsWith('miro-')

        if ($audioExtensions -contains $extension) {
            $findings.Add([pscustomobject]@{
                Path   = $file.FullName
                Size   = $file.Length
                Kind   = if ($isMiroNamed) { 'audio (miro-named)' } else { 'audio' }
                Created = $file.LastWriteTime
            })
        } elseif ($textExtensions -contains $extension -and $isMiroNamed) {
            $findings.Add([pscustomobject]@{
                Path   = $file.FullName
                Size   = $file.Length
                Kind   = 'text (miro-named)'
                Created = $file.LastWriteTime
            })
        } elseif ($isMiroNamed) {
            $findings.Add([pscustomobject]@{
                Path   = $file.FullName
                Size   = $file.Length
                Kind   = 'miro-named leftover'
                Created = $file.LastWriteTime
            })
        }
    }
}

$result = [pscustomobject]@{
    AuditedAt   = (Get-Date).ToString('o')
    Since       = $Since
    ScannedFiles = $scanned
    Findings    = $findings
    Allowed     = $allowed
    AppData     = $appData
    AppLocal    = $appLocal
    Temp        = $tempDir
}

if ($scanned -eq 0 -and -not (Test-Path $tempDir)) {
    Write-Host 'Miro privacy audit: nothing to scan (no app data or temp directory)' -ForegroundColor Yellow
    exit 1
}

if ($Json) {
    $result | ConvertTo-Json -Depth 4
} else {
    Write-Host "Miro privacy audit"
    Write-Host "  scanned : $scanned files (app data + local app data + temp)"
    Write-Host "  allowed : $($allowed.Count) (settings and model files)"
    if ($findings.Count -eq 0) {
        Write-Host "  findings: none - no audio or transcript files found" -ForegroundColor Green
    } else {
        Write-Host "  findings: $($findings.Count)" -ForegroundColor Red
        $findings | Format-Table -AutoSize | Out-String | Write-Host
    }
}

if ($findings.Count -gt 0) { exit 1 }
exit 0
