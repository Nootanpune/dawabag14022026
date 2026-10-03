@{
    RootModule           = 'DawabagStockConnector.psm1'
    ModuleVersion        = '1.0.0'
    GUID                 = '6f0f3c2e-8a51-4c47-9d0e-3b7f2d6a1c55'
    Author               = 'Dawabag'
    CompanyName          = 'Dawabag'
    Description          = 'Uploads each new stock export of a partner''s billing software (MediVision Platinum) to the Dawabag partner feed API. Stateless; read-only on the export folder; key in Windows Credential Manager; logs to the Windows Event Log.'
    PowerShellVersion    = '5.1'
    CompatiblePSEditions = @('Desktop', 'Core')
    FunctionsToExport    = @('Invoke-DawabagStockSync', 'Send-DawabagStock', 'Test-DawabagConnector', 'Set-DawabagConnectorKey',
        'Remove-DawabagConnectorKey', 'Install-DawabagConnector', 'Uninstall-DawabagConnector')
    CmdletsToExport      = @()
    VariablesToExport    = @()
    AliasesToExport      = @()
}
