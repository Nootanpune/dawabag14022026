# Set-StockConnectorKey.ps1 - stores the API key in Windows Credential Manager for the
# Windows account that RUNS this script, then tests the set-up as that account.
# The installer opens it as the task's account; run it yourself to replace a key, e.g.
#   runas /user:<task account> "powershell -ExecutionPolicy Bypass -File \"C:\Program Files\Dawabag\StockConnector\Set-StockConnectorKey.ps1\""
# (for the dedicated account, simply run the installer again instead).
# Exit code: 0 stored and checks passed; 1 stored but a check failed; 2 not stored.
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path (Join-Path $PSScriptRoot 'DawabagStockConnector') 'DawabagStockConnector.psd1') -Force
$code = 0
try {
    Set-DawabagConnectorKey | Out-Null
    Write-Host ''
    Write-Host 'Checking the set-up as this account (nothing is uploaded):'
    $checks = Test-DawabagConnector -PassThru
    if (@($checks | Where-Object { $_.Status -eq 'FAIL' }).Count) { $code = 1 }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    $code = 2
}
Read-Host 'Press Enter to close this window' | Out-Null
exit $code
