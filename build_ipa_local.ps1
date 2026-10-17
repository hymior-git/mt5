# Local IPA Packaging Script for Windows
Write-Host "=========================================="
Write-Host "Packaging MetaTrader 5 Local Demo IPA..."
Write-Host "=========================================="

$root = $PSScriptRoot
$payloadDir = Join-Path $root "Payload"
$outputIpa = Join-Path $root "MetaTrader5_LocalDemo.ipa"
$tempZip = Join-Path $root "temp_payload.zip"

if (Test-Path $payloadDir) {
    if (Test-Path $tempZip) { Remove-Item $tempZip -Force }
    if (Test-Path $outputIpa) { Remove-Item $outputIpa -Force }

    Write-Host "Compressing Payload directory..."
    Compress-Archive -Path $payloadDir -DestinationPath $tempZip -Force
    Move-Item $tempZip $outputIpa -Force

    $item = Get-Item $outputIpa
    Write-Host "SUCCESS: Generated $outputIpa ($([math]::Round($item.Length / 1MB, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "ERROR: Payload directory not found at $payloadDir" -ForegroundColor Red
}
