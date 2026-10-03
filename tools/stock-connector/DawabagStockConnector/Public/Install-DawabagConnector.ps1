# Install-DawabagConnector / Uninstall-DawabagConnector (run as administrator).
#
# Install: copies the scripts to Program Files, writes the non-secret settings to
# HKLM\SOFTWARE\Dawabag\StockConnector, registers the event-log source, chooses the
# task's Windows account, stores the API key in THAT account's Credential Manager
# (typed once, hidden), and registers the Scheduled Task (every 5 minutes, whether or
# not anyone is signed in). Running it again updates everything (and asks for the key again).
#
# Task account (-TaskAccount):
#   Dedicated (default) - a local account "DawabagConnector", member of no group, random
#                         password never shown; least privilege.
#   Installer           - the administrator running the installer (asks for its password,
#                         which Task Scheduler needs to run while nobody is signed in).
#   Existing            - another account you give with -Credential (e.g. a domain account
#                         that can read the export folder over the network).

function Install-DawabagConnector {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$PartnerId,
        [Parameter(Mandatory)][string]$ExportFolder,
        [string]$ApiBaseUrl = $script:Defaults.ApiBaseUrl,
        [string[]]$FilePatterns = $script:Defaults.FilePatterns,
        [ValidateRange(0, 3600)][int]$MinFileAgeSeconds = $script:Defaults.MinFileAgeSeconds,
        [ValidateRange(0, 120)][int]$StableSeconds = $script:Defaults.StableSeconds,
        [ValidateRange(5, 60)][int]$IntervalMinutes = $script:Defaults.IntervalMinutes,
        [ValidateSet('Dedicated', 'Installer', 'Existing')][string]$TaskAccount = 'Dedicated',
        [pscredential]$Credential,
        [string]$InstallRoot = $script:DefaultInstallRoot,
        # Add a read-only permission for the task's account on the export folder
        [switch]$GrantFolderRead,
        # Keep the key already stored (Installer / Existing accounts only)
        [switch]$KeepKey,
        [switch]$NoStart
    )
    Assert-Administrator

    # 1. Settings (validated before anything is changed)
    $config = ConvertTo-ConnectorConfig -Values @{
        ApiBaseUrl = $ApiBaseUrl; PartnerId = $PartnerId; ExportFolder = $ExportFolder; FilePatterns = $FilePatterns
        MinFileAgeSeconds = $MinFileAgeSeconds; StableSeconds = $StableSeconds
    }
    if (-not (Test-Path -LiteralPath $config.ExportFolder -PathType Container)) {
        throw "The export folder '$($config.ExportFolder)' was not found. Create it (or ask Allied Softtech which folder MediVision exports to) and run the installer again."
    }
    if ($KeepKey -and $TaskAccount -eq 'Dedicated') {
        throw '-KeepKey cannot be used with the dedicated account: its password is renewed on every install, which makes the stored key unreadable; the key is asked for again.'
    }

    Write-Host "1/6 Copying the connector to $InstallRoot"
    Copy-ConnectorProgram -InstallRoot $InstallRoot
    Write-Host "2/6 Saving settings in $($script:RegistryPath) (no secrets)"
    Set-ConnectorConfig -Config $config
    Write-Host "3/6 Registering the Windows Event Log source '$($script:EventSource)'"
    Register-ConnectorEventSource

    # 4. The task's account
    Write-Host "4/6 Preparing the task's Windows account ($TaskAccount)"
    switch ($TaskAccount) {
        'Dedicated' { $cred = Set-DedicatedAccount }
        'Installer' {
            $me = Get-CurrentAccountName
            $cred = Get-Credential -UserName $me -Message 'Your Windows password (Task Scheduler needs it to run the task while nobody is signed in; it is kept by Windows, not by the connector)'
        }
        'Existing' {
            $cred = if ($Credential) { $Credential } else { Get-Credential -Message 'The Windows account the task runs as (DOMAIN\name or PC\name)' }
        }
    }
    if (-not $cred) { throw 'No account was given; nothing more was changed.' }
    if ($GrantFolderRead) {
        Grant-FolderRead -Folder $config.ExportFolder -UserName $cred.UserName
        Write-Host "     Read-only access to $($config.ExportFolder) granted to $($cred.UserName)"
    }

    # 5. The key, stored in that account's own Credential Manager
    Write-Host "5/6 Storing the API key for $($cred.UserName)"
    if (-not $KeepKey) {
        if (Test-SameAccount $cred.UserName) {
            Set-DawabagConnectorKey | Out-Null
            Test-DawabagConnector | Out-Null
        } else {
            Write-Host '     A new window opens AS that account: paste the key there. It then tests the set-up as that account.' -ForegroundColor Cyan
            $code = Invoke-AsAccount -Credential $cred -InstallRoot $InstallRoot -Script 'Set-StockConnectorKey.ps1'
            if ($code -eq 2) { throw 'The key was not stored (see the other window / the Event Log). Run the installer again.' }
            if ($code -ne 0) { Write-Warning 'The key is stored, but a check failed in the other window (folder access or Dawabag). See the Event Log, fix it, then run Test-StockConnector.ps1.' }
        }
    }

    # 6. The schedule
    Write-Host "6/6 Registering the scheduled task '$($script:TaskPath)$($script:TaskName)' every $IntervalMinutes minutes as $($cred.UserName)"
    Register-ConnectorTask -Credential $cred -InstallRoot $InstallRoot -IntervalMinutes $IntervalMinutes
    $cred = $null
    if (-not $NoStart) { Start-ScheduledTask -TaskName $script:TaskName -TaskPath $script:TaskPath }

    Write-ConnectorLog -Level Information -EventId $script:EventIds.Installed -Message ("Dawabag Stock Connector {0} installed: partner {1}, folder {2}, every {3} min, API {4}." -f
        $script:ConnectorVersion, $config.PartnerId, $config.ExportFolder, $IntervalMinutes, $config.ApiBaseUrl)
    Write-Host ''
    Write-Host 'Done. Check: Event Viewer > Windows Logs > Application, source "Dawabag Stock Connector".' -ForegroundColor Green
    Write-Host 'Scheduled runs upload only after Dawabag''s admin switches LIVE mode on for this partner (see docs/stock-connector.md).'
}

function Uninstall-DawabagConnector {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param(
        [string]$InstallRoot = $script:DefaultInstallRoot,
        [switch]$KeepServiceAccount,
        [switch]$RemoveEventSource
    )
    Assert-Administrator
    if (-not $PSCmdlet.ShouldProcess('Dawabag Stock Connector', 'Remove the scheduled task, settings, stored key and program files (the export folder is NOT touched)')) { return }

    $taskUser = $null
    $task = Get-ScheduledTask -TaskName $script:TaskName -TaskPath $script:TaskPath -ErrorAction SilentlyContinue
    if ($task) {
        $taskUser = $task.Principal.UserId
        Unregister-ScheduledTask -TaskName $script:TaskName -TaskPath $script:TaskPath -Confirm:$false
        Write-Host 'Scheduled task removed.'
    }

    # The key: delete it from Credential Manager where we can
    try { if (Remove-ConnectorSecret) { Write-Host "Key removed from Credential Manager of $(Get-CurrentAccountName)." } } catch { Write-Verbose $_.Exception.Message }
    $dedicated = Get-LocalUser -Name $script:DefaultServiceAccount -ErrorAction SilentlyContinue
    $taskIsDedicated = $dedicated -and $taskUser -and (($taskUser -split '\\')[-1] -ieq $script:DefaultServiceAccount)
    if ($dedicated -and -not $KeepServiceAccount -and ($taskIsDedicated -or -not $taskUser)) {
        Remove-AccountProfile -Name $script:DefaultServiceAccount   # its profile holds its Credential Manager
        Remove-LocalUser -Name $script:DefaultServiceAccount
        Write-Host "Local account $($script:DefaultServiceAccount) and its profile (with the stored key) removed."
    } elseif ($taskUser -and -not (Test-SameAccount $taskUser)) {
        Write-Warning ("The key may still be in Credential Manager of '{0}'. Sign in as that account and run: cmdkey /delete:""{1}""" -f $taskUser, $script:CredentialTarget)
    }

    Remove-ConnectorConfig
    Write-Host "Settings removed ($($script:RegistryPath))."
    if (Test-Path -LiteralPath $InstallRoot) {
        Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Program files removed ($InstallRoot)."
    }
    Write-ConnectorLog -Level Information -EventId $script:EventIds.Uninstalled -Message 'Dawabag Stock Connector uninstalled. The export folder and its files were not touched.'
    if ($RemoveEventSource -and [System.Diagnostics.EventLog]::SourceExists($script:EventSource)) {
        [System.Diagnostics.EventLog]::DeleteEventSource($script:EventSource)
    }
    Write-Host 'Also revoke the API key in Dawabag (Automatic stock upload > Revoke) and ask Dawabag''s admin to switch live mode off for the partner if no other uploader replaces this one.' -ForegroundColor Yellow
}
