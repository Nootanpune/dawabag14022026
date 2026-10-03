# Set-DawabagConnectorKey - asks for the API key once (hidden typing) and stores it in
# Windows Credential Manager for the CURRENT Windows account. Run it AS the account the
# scheduled task uses (the installer does this for you). The key is never shown,
# written to a file or logged; only its public prefix (dwbk_xxxxxxxxxx) is mentioned.

function Set-DawabagConnectorKey {
    [CmdletBinding()]
    param([System.Security.SecureString]$Key)
    if (-not $Key) {
        Write-Host 'Paste the Dawabag API key for this partner (it starts with dwbk_). Typing is hidden.'
        $Key = Read-Host -AsSecureString -Prompt 'API key'
    }
    $prefix = Set-ConnectorSecret -Key $Key
    $who = Get-CurrentAccountName
    Write-ConnectorLog -Level Information -EventId $script:EventIds.KeyStored -Message ("API key {0} stored in Windows Credential Manager for the account '{1}'." -f $prefix, $who)
    return [pscustomobject]@{ Account = $who; KeyPrefix = $prefix }
}

function Remove-DawabagConnectorKey {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param()
    if ($PSCmdlet.ShouldProcess((Get-CurrentAccountName), 'Remove the Dawabag API key from Credential Manager')) {
        return (Remove-ConnectorSecret)
    }
}
