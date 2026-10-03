# Invoke-DawabagStockSync - ONE scheduled run (every ~5 minutes, Windows Task Scheduler).
#
# Stateless by design (standing rule: the server is the single source of truth):
#   1. ask Dawabag (/whoami) for the partner's mode and the export time it already has;
#   2. pick the newest complete export in the folder written after that time;
#   3. upload it with X-Snapshot-Taken-At = the file's modified time (+05:30);
#   4. log the result to the Windows Event Log.
# Nothing is remembered between runs; a crash or reboot loses nothing. The export files
# are only read - never deleted, moved or renamed (they belong to MediVision / Allied).

function Invoke-DawabagStockSync {
    [CmdletBinding()]
    param()
    $deadline = [datetime]::UtcNow.AddSeconds($script:Defaults.RunBudgetSeconds)
    $result = [pscustomobject]@{ Outcome = 'Unexpected'; Success = $false; File = $null; Message = $null }
    try {
        try { $config = Get-ConnectorConfig } catch {
            $result.Outcome = 'ConfigError'; $result.Message = $_.Exception.Message
            Write-ConnectorLog -Level Error -EventId $script:EventIds.ConfigError -Message $result.Message
            return $result
        }
        $deadline = [datetime]::UtcNow.AddSeconds($config.RunBudgetSeconds)

        $key = $null
        try { $key = Get-ConnectorSecret } catch { $key = $null }
        if (-not $key) {
            $result.Outcome = 'KeyMissing'
            $result.Message = ("No Dawabag API key is stored in Windows Credential Manager for the account '{0}'. Run Install-StockConnector.ps1 again (or Set-StockConnectorKey.ps1 as this account)." -f (Get-CurrentAccountName))
            Write-ConnectorLog -Level Error -EventId $script:EventIds.KeyMissing -Message $result.Message
            return $result
        }

        # 1. What does Dawabag already have?
        $who = Get-DawabagWhoami -Config $config -ApiKey $key -DeadlineUtc $deadline
        if (-not $who.Info) {
            $result.Outcome = $who.Outcome.Outcome; $result.Message = "Dawabag did not accept the key check: $($who.Outcome.Message)"
            $id = if ($who.Outcome.Outcome -eq 'AuthFailed') { $script:EventIds.AuthFailed } elseif ($who.Outcome.Retryable) { $script:EventIds.RetryNextRun } else { $script:EventIds.Rejected }
            $lvl = if ($who.Outcome.Retryable) { 'Warning' } else { 'Error' }
            if ($who.Outcome.Outcome -eq 'AuthFailed') { $result.Message += ' - the key is wrong, revoked or of another partner, or the partner account is not active. Issue a new key and run Install-StockConnector.ps1 again.' }
            Write-ConnectorLog -Level $lvl -EventId $id -Message $result.Message
            return $result
        }
        $info = $who.Info
        if ($info.Mode -ne 'live') {
            # Scheduled uploads only make sense in live mode; until the admin switches it on, each
            # upload would only add another draft. Use Send-DawabagStock for trial drafts.
            $result.Outcome = 'NotLive'; $result.Success = $true
            $result.Message = ("Live stock feed is not switched on yet for {0}: nothing uploaded. Dawabag's admin switches it on (Admin > Partners > {0} > Stock feed) after a trial file sent with Send-DawabagStock looks right." -f $info.PartnerName)
            Write-ConnectorLog -Level Information -EventId $script:EventIds.NotLive -Message $result.Message
            return $result
        }

        # 2. The newest complete export newer than Dawabag's last snapshot
        try { $pick = Find-ExportToSend -Config $config -LastTakenAtUtc $info.LastTakenAtUtc } catch {
            $result.Outcome = 'FolderError'; $result.Message = $_.Exception.Message
            Write-ConnectorLog -Level Error -EventId $script:EventIds.FolderError -Message $result.Message
            return $result
        }
        if (-not $pick.File) {
            $result.Outcome = 'NothingNew'; $result.Success = $true
            $last = Format-IstForPeople $info.LastTakenAtUtc
            if ($pick.Pending -gt 0) {
                $result.Outcome = 'NotComplete'
                $result.Message = "A newer export is not complete yet, trying again next run: " + ($pick.Notes -join '; ')
                Write-ConnectorLog -Level Information -EventId $script:EventIds.NotComplete -Message $result.Message
            } else {
                $result.Message = "No export newer than the one Dawabag already has ($last). Files in the folder: $($pick.Count)."
                Write-ConnectorLog -Level Information -EventId $script:EventIds.NothingNew -Message $result.Message
            }
            # Is MediVision still exporting? Warn before Dawabag marks the stock stale.
            $newestAge = if ($pick.Newest) { ([datetime]::UtcNow - $pick.Newest.LastWriteTimeUtc).TotalMinutes } else { $null }
            if ($null -eq $newestAge -or $newestAge -gt $info.StaleAfterMinutes) {
                $what = if ($pick.Newest) { "the newest export ($($pick.Newest.Name)) was written $([int]$newestAge) minutes ago" } else { "there is no export file in $($config.ExportFolder)" }
                Write-ConnectorLog -Level Warning -EventId $script:EventIds.ExportStale -Message ("Check MediVision's scheduled stock export: {0}. Dawabag treats the stock as out of date after {1} minutes without a new snapshot." -f $what, $info.StaleAfterMinutes)
            }
            return $result
        }

        # 3. Upload (live snapshot)
        $file = $pick.File
        $result.File = $file.FullName
        $sent = Send-ExportFile -Config $config -ApiKey $key -File $file -TakenAtUtc $pick.TakenAtUtc -As live -DeadlineUtc $deadline
        $result.Outcome = $sent.Outcome; $result.Success = $sent.Success; $result.Message = $sent.Message
        return $result
    } catch {
        $result.Outcome = 'Unexpected'; $result.Message = $_.Exception.Message
        Write-ConnectorLog -Level Error -EventId $script:EventIds.Unexpected -Message ("Unexpected problem: {0}" -f $_.Exception.Message)
        return $result
    } finally {
        $key = $null
    }
}

function Send-ExportFile {
    # Shared by the scheduled run and Send-DawabagStock: read, upload, log one line.
    param($Config, [string]$ApiKey, [System.IO.FileInfo]$File, [datetime]$TakenAtUtc, [ValidateSet('live', 'draft')][string]$As, [datetime]$DeadlineUtc)
    $bytes = Read-ExportFileBytes $File
    $when = ConvertTo-IstIsoString $TakenAtUtc
    $r = Send-DawabagExport -Config $Config -ApiKey $ApiKey -Bytes $bytes -FileName $File.Name -TakenAtUtc $TakenAtUtc -As $As -DeadlineUtc $DeadlineUtc
    $o = $r.Outcome
    $head = '{0} ({1:N0} bytes, exported {2})' -f $File.Name, $bytes.Length, $when
    $summary = Format-ServerSummary $r.Response.Json
    switch ($o.Outcome) {
        { $o.Success } {
            $text = switch ($o.Outcome) {
                'Applied' { 'applied to Dawabag' }
                'Unchanged' { 'same stock as the last snapshot - Dawabag kept it and marked the feed fresh' }
                'Replay' { 'already received (a repeat) - nothing changed' }
                'Draft' { 'received as a DRAFT: review and apply it in the Dawabag partner portal (Stock import) within 24 hours' }
                default { 'accepted' }
            }
            $msg = "$head - $text. $summary".Trim()
            Write-ConnectorLog -Level Information -EventId $script:EventIds.Uploaded -Message $msg
            return @{ Outcome = $o.Outcome; Success = $true; Message = $msg; Json = $r.Response.Json }
        }
        'OutOfOrder' {
            $msg = "$head - Dawabag already has a newer snapshot, so this one was skipped (not an error unless it keeps happening; check the PC clock). Server: $($o.Message)"
            Write-ConnectorLog -Level Warning -EventId $script:EventIds.OutOfOrder -Message $msg
        }
        'NotLive' {
            $msg = "$head - not sent: live stock feed is off for this partner. Server: $($o.Message)"
            Write-ConnectorLog -Level Warning -EventId $script:EventIds.NotLive -Message $msg
        }
        'AuthFailed' {
            $msg = "$head - the key was refused (wrong, revoked, of another partner, or partner not active). Issue a new key and run the installer again. Server: $($o.Message)"
            Write-ConnectorLog -Level Error -EventId $script:EventIds.AuthFailed -Message $msg
        }
        { $o.Retryable } {
            $msg = "$head - not sent after $($r.Attempts) attempt(s): $($o.Outcome) ($($o.Message)). The next run tries again."
            Write-ConnectorLog -Level Warning -EventId $script:EventIds.RetryNextRun -Message $msg
        }
        default {
            $msg = "$head - refused, fix the export or the setup (resending the same file will not help). Server: $($o.Message)"
            Write-ConnectorLog -Level Error -EventId $script:EventIds.Rejected -Message $msg
        }
    }
    return @{ Outcome = $o.Outcome; Success = $false; Message = $msg; Json = $r.Response.Json }
}
