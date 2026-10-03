# Test-DawabagConnector - checks the set-up WITHOUT uploading anything:
#   settings, export folder access, key present, /whoami (partner name and mode),
#   and a dry run that names the file the next scheduled run would send.
# Run it as the task's account for an exact answer (the installer does that once);
# as another account it checks that account's Credential Manager (or -PromptForKey).

function Test-DawabagConnector {
    [CmdletBinding()]
    param([switch]$PromptForKey, [switch]$Quiet, [switch]$PassThru)
    $checks = New-Object System.Collections.Generic.List[object]
    $add = {
        param($Name, $Status, $Detail)
        $checks.Add([pscustomobject]@{ Check = $Name; Status = $Status; Detail = (Protect-LogText $Detail) })
        if (-not $Quiet) {
            $color = @{ PASS = 'Green'; WARN = 'Yellow'; FAIL = 'Red'; INFO = 'Gray' }[$Status]
            Write-Host ('{0,-5} {1,-22} {2}' -f $Status, $Name, (Protect-LogText $Detail)) -ForegroundColor $color
        }
    }

    # The checks are printed; -PassThru also returns them as objects (for scripts).
    $finish = { if ($PassThru) { $checks.ToArray() } }

    # 1. Settings
    try { $config = Get-ConnectorConfig } catch { & $add 'Settings' 'FAIL' $_.Exception.Message; return (& $finish) }
    & $add 'Settings' 'PASS' ("API {0}; partner {1}; folder {2}; files {3}; minimum age {4} s" -f $config.ApiBaseUrl, $config.PartnerId, $config.ExportFolder, ($config.FilePatterns -join ' '), $config.MinFileAgeSeconds)
    & $add 'Windows account' 'INFO' (Get-CurrentAccountName)
    if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
        $task = Get-ScheduledTask -TaskName $script:TaskName -TaskPath $script:TaskPath -ErrorAction SilentlyContinue
        if ($task) {
            $ti = $task | Get-ScheduledTaskInfo
            & $add 'Scheduled task' 'INFO' ("runs as {0}; state {1}; last run {2} (result 0x{3:X}); next run {4}" -f $task.Principal.UserId, $task.State, $ti.LastRunTime, $ti.LastTaskResult, $ti.NextRunTime)
        } else { & $add 'Scheduled task' 'WARN' 'not installed (manual mode only)' }
    }

    # 2. Export folder (read-only listing)
    $files = @()
    try {
        $files = @(Get-ExportFile -Folder $config.ExportFolder -Patterns $config.FilePatterns)
        if ($files.Count) {
            & $add 'Export folder' 'PASS' ("{0} export file(s); newest {1} written {2}" -f $files.Count, $files[0].Name, (Format-IstForPeople $files[0].LastWriteTimeUtc))
        } else { & $add 'Export folder' 'WARN' 'readable, but no export file matches the patterns yet' }
    } catch { & $add 'Export folder' 'FAIL' $_.Exception.Message }

    # 3. Key
    $key = $null
    try { $key = Get-ConnectorSecret } catch { $key = $null }
    if ($key) { & $add 'API key' 'PASS' ("{0} found in Credential Manager" -f (Get-ApiKeyPrefix $key)) }
    elseif ($PromptForKey) {
        $key = (ConvertFrom-SecureKey (Read-Host -AsSecureString -Prompt 'Paste the Dawabag API key (not shown, not stored)')).Trim()
        & $add 'API key' 'INFO' 'typed for this test only (not stored)'
    } else {
        & $add 'API key' 'FAIL' ("none stored for '{0}'. The scheduled task uses the key of its own account; run Set-DawabagConnectorKey as that account, or use -PromptForKey here" -f (Get-CurrentAccountName))
        return (& $finish)
    }

    try {
        # 4. whoami
        $deadline = [datetime]::UtcNow.AddSeconds(60)
        $who = Get-DawabagWhoami -Config $config -ApiKey $key -DeadlineUtc $deadline
        if (-not $who.Info) { & $add 'Dawabag (whoami)' 'FAIL' ("{0}: {1}" -f $who.Outcome.Outcome, $who.Outcome.Message); return (& $finish) }
        $info = $who.Info
        & $add 'Dawabag (whoami)' 'PASS' ("partner '{0}'; key {1}; mode {2}; last snapshot exported {3}; stale after {4} min" -f $info.PartnerName, $info.Key, $info.Mode.ToUpperInvariant(), (Format-IstForPeople $info.LastTakenAtUtc), $info.StaleAfterMinutes)
        if ($info.Mode -ne 'live') {
            & $add 'Live mode' 'WARN' 'off: scheduled runs upload nothing yet. Send a trial file with Send-DawabagStock (it becomes a draft to review), then ask Dawabag''s admin to switch live mode on'
        }

        # 5. Dry run (no upload)
        if ($files.Count) {
            $pick = Find-ExportToSend -Config $config -LastTakenAtUtc $info.LastTakenAtUtc
            if ($pick.File) {
                & $add 'Dry run' 'PASS' ("next run would send {0} ({1:N0} bytes) with X-Snapshot-Taken-At {2}{3}" -f $pick.File.Name, $pick.File.Length, (ConvertTo-IstIsoString $pick.TakenAtUtc), $(if ($info.Mode -ne 'live') { ' - once live mode is on' } else { '' }))
            } elseif ($pick.Pending) {
                & $add 'Dry run' 'INFO' ('a newer export is not complete yet: ' + ($pick.Notes -join '; '))
            } else {
                & $add 'Dry run' 'INFO' 'nothing to send: Dawabag already has the newest export'
            }
        }
    } finally { $key = $null }

    foreach ($e in @(Get-ConnectorRecentEvents -MaxEvents 3)) {
        & $add 'Recent event' 'INFO' ("{0} [{1}] {2}" -f $e.TimeCreated, $e.Id, ($e.Message -split "`n")[0])
    }
    return (& $finish)
}
