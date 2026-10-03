# Send-DawabagStock - manual mode: send ONE stock export now, e.g. while Allied Softtech
# has not set up MediVision's scheduled export yet (the partner exports the batch-wise
# stock report by hand and runs this).
#   * Partner NOT in live mode: the file becomes a DRAFT import in the partner portal
#     (Stock import) to review - the safe way to try the layout before live mode.
#   * Partner in live mode: the file is a full snapshot that applies by itself, exactly
#     like a scheduled run (and must be newer than the snapshot Dawabag already has).
# The file is only read; it is never moved, renamed or deleted.

function Send-DawabagStock {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory, Position = 0)][Alias('Path')][string]$File,
        # Overrides for a PC where the connector is not installed yet
        [string]$PartnerId,
        [string]$ApiBaseUrl,
        # Ask for the key for this one run (not stored) when the current Windows account has none stored
        [switch]$PromptForKey
    )
    $override = @{}
    if ($PartnerId) { $override.PartnerId = $PartnerId }
    if ($ApiBaseUrl) { $override.ApiBaseUrl = $ApiBaseUrl }
    # ExportFolder is not needed to send one named file
    if (-not (Test-Path -LiteralPath $script:RegistryPath)) { $override.ExportFolder = '(manual)' }
    $config = Get-ConnectorConfig -Override $override

    $item = Get-Item -LiteralPath $File -ErrorAction Stop
    if ($item -isnot [System.IO.FileInfo]) { throw "$File is not a file" }
    if ($script:AcceptedExtensions -notcontains $item.Extension.ToLowerInvariant()) {
        throw "Dawabag reads .xlsx, .csv, .txt or .tsv stock files. Save the report as Excel (.xlsx) or CSV; old .xls files are refused."
    }
    $why = Test-ExportFileReady -File $item -MinAgeSeconds 0
    if ($why) { throw "$($item.Name) cannot be sent: $why" }
    if (-not (Test-ExportFileUnlocked $item.FullName)) { throw "$($item.Name) is still open in another program (close it in Excel / MediVision first)" }

    $key = $null
    try { $key = Get-ConnectorSecret } catch { $key = $null }
    if (-not $key) {
        if (-not $PromptForKey) {
            throw ("No Dawabag API key is stored for the Windows account '{0}'. Run Set-DawabagConnectorKey (stores it for this account) or use -PromptForKey to type it for this run only." -f (Get-CurrentAccountName))
        }
        $key = (ConvertFrom-SecureKey (Read-Host -AsSecureString -Prompt 'Paste the Dawabag API key (not shown, not stored)')).Trim()
        if (-not (Test-ApiKeyFormat $key)) { throw 'That does not look like a Dawabag API key (dwbk_...).' }
    }
    try {
        $deadline = [datetime]::UtcNow.AddSeconds($config.RunBudgetSeconds)
        $who = Get-DawabagWhoami -Config $config -ApiKey $key -DeadlineUtc $deadline
        if (-not $who.Info) { throw "Dawabag did not accept the key: $($who.Outcome.Outcome) - $($who.Outcome.Message)" }
        $info = $who.Info
        $as = if ($info.Mode -eq 'live') { 'live' } else { 'draft' }
        $taken = Get-WholeSecondUtc $item.LastWriteTimeUtc
        if ($as -eq 'live' -and $null -ne $info.LastTakenAtUtc -and $taken -le $info.LastTakenAtUtc) {
            Write-Warning ("Dawabag already has a snapshot exported at {0}; this file was exported at {1}, so Dawabag will skip it as older. Export a fresh report first." -f (Format-IstForPeople $info.LastTakenAtUtc), (Format-IstForPeople $taken))
        }
        $target = if ($as -eq 'live') { "LIVE snapshot for $($info.PartnerName) (applies stock at once)" } else { "DRAFT for $($info.PartnerName) (to review in the partner portal)" }
        if (-not $PSCmdlet.ShouldProcess("$($item.Name) exported $(Format-IstForPeople $taken)", "Send to Dawabag as $target")) { return }
        $r = Send-ExportFile -Config $config -ApiKey $key -File $item -TakenAtUtc $taken -As $as -DeadlineUtc $deadline
        return [pscustomobject]@{ File = $item.FullName; SentAs = $as; Outcome = $r.Outcome; Success = $r.Success; Message = $r.Message }
    } finally { $key = $null }
}
