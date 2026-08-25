$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectDir

python -m PyInstaller --clean --noconfirm rancho_portable.spec

$SmokeDir = Join-Path ([System.IO.Path]::GetTempPath()) ("rancho-smoke-" + [guid]::NewGuid().ToString())
try {
    & "dist\Rancho Project Search\Rancho Project Search.exe" --smoke-test --data-dir $SmokeDir
    if ($LASTEXITCODE -ne 0) {
        throw "Frozen application smoke test failed with exit code $LASTEXITCODE"
    }
}
finally {
    if (Test-Path $SmokeDir) {
        Remove-Item -Recurse -Force $SmokeDir
    }
}

$ReleaseDir = Join-Path $ProjectDir "release\Rancho Project Search Windows"
if (Test-Path $ReleaseDir) {
    Remove-Item -Recurse -Force $ReleaseDir
}
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

Copy-Item -Recurse -Force "dist\Rancho Project Search\*" $ReleaseDir
Copy-Item -Recurse -Force "data" (Join-Path $ReleaseDir "data")
Copy-Item -Force "packaging\windows\*.cmd" $ReleaseDir

$Archive = Join-Path $ProjectDir "release\Rancho-Project-Search-Windows-x64.zip"
if (Test-Path $Archive) {
    Remove-Item -Force $Archive
}
Compress-Archive -Path $ReleaseDir -DestinationPath $Archive -CompressionLevel Optimal
Write-Output $Archive
