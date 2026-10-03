# DawabagStockConnector.psm1 - loads the module's parts. Each file has one responsibility:
#   Private/Constants.ps1     names, defaults, event IDs
#   Private/Logging.ps1       Windows Event Log (no log files), key redaction
#   Private/Config.ps1        non-secret settings in HKLM\SOFTWARE\Dawabag\StockConnector
#   Private/Secret.ps1        the API key in Windows Credential Manager (CredWrite/CredRead)
#   Private/Time.ps1          export times (+05:30) and the server's times
#   Private/ExportFinder.ps1  the newest complete export (read-only on the folder)
#   Private/Http.ps1          HttpClient + multipart, TLS 1.2+
#   Private/Api.ps1           whoami / stock-snapshot / stock-files, retries, outcomes
#   Private/Install.ps1       account, key-as-account, scheduled task helpers
#   Public/*.ps1              the commands
$script:ModuleRoot = $PSScriptRoot

foreach ($part in @('Constants', 'Logging', 'Config', 'Secret', 'Time', 'ExportFinder', 'Http', 'Api', 'Install')) {
    . (Join-Path (Join-Path $PSScriptRoot 'Private') "$part.ps1")
}
foreach ($part in @('Invoke-DawabagStockSync', 'Send-DawabagStock', 'Set-DawabagConnectorKey', 'Test-DawabagConnector', 'Install-DawabagConnector')) {
    . (Join-Path (Join-Path $PSScriptRoot 'Public') "$part.ps1")
}

Export-ModuleMember -Function @(
    'Invoke-DawabagStockSync', 'Send-DawabagStock', 'Test-DawabagConnector',
    'Set-DawabagConnectorKey', 'Remove-DawabagConnectorKey',
    'Install-DawabagConnector', 'Uninstall-DawabagConnector'
)
