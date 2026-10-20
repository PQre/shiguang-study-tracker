param([switch]$Demo)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = $PSScriptRoot
$taskPython = Join-Path $taskProjectRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
    $taskBundledPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    if (Test-Path -LiteralPath $taskBundledPython) { $taskPython = $taskBundledPython }
    else { $taskPython = 'python' }
}
Push-Location -LiteralPath $taskProjectRoot
try {
    if ($Demo) { & $taskPython -X utf8 run.py --demo }
    else { & $taskPython -X utf8 run.py }
} finally { Pop-Location }
