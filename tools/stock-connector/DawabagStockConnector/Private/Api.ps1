# Api.ps1 - the Dawabag partner feed API (docs/partner-stock-api.md, Sprints 36/37):
#   GET  /api/v1/partner-feed/<partner id>/whoami          -> partner name, stock_feed { mode, last_taken_at, ... }
#   POST /api/v1/partner-feed/<partner id>/stock-snapshot  -> live mode: a full snapshot that applies by itself
#   POST /api/v1/partner-feed/<partner id>/stock-files     -> not live: a DRAFT the partner reviews in the portal
# Retries (429 / 5xx / no answer) resend the SAME bytes with the SAME X-Snapshot-Taken-At,
# which the server recognises as a replay (idempotent by SHA-256), within a bounded budget.

function Get-FeedUri {
    param([Parameter(Mandatory)]$Config, [Parameter(Mandatory)][ValidateSet('whoami', 'stock-snapshot', 'stock-files')][string]$Path)
    return '{0}/api/v1/partner-feed/{1}/{2}' -f $Config.ApiBaseUrl, [Uri]::EscapeDataString($Config.PartnerId), $Path
}

function Get-ServerMessage {
    param($Response)
    if ($Response.Json -and $Response.Json.PSObject.Properties['message'] -and $Response.Json.message) { return Protect-LogText ([string]$Response.Json.message) }
    if ($Response.NetworkError) { return $Response.NetworkError }
    if ($Response.Body) { return Protect-LogText ([string]$Response.Body).Substring(0, [math]::Min(300, ([string]$Response.Body).Length)) }
    return "HTTP $($Response.StatusCode)"
}

function Get-ResponseOutcome {
    # Pure: what an answer means for the connector (docs/partner-stock-api.md section 7).
    # Returns @{ Outcome; Success; Retryable; Message }.
    param([Parameter(Mandatory)]$Response)
    $code = [int]$Response.StatusCode
    $msg = Get-ServerMessage $Response
    $o = @{ Outcome = 'Unexpected'; Success = $false; Retryable = $false; Message = $msg }
    if ($code -eq 0) { $o.Outcome = 'NetworkError'; $o.Retryable = $true; return $o }
    if ($code -ge 200 -and $code -lt 300) {
        $o.Success = $true
        $status = $null
        if ($Response.Json -and $Response.Json.data -and $Response.Json.data.PSObject.Properties['status']) { $status = [string]$Response.Json.data.status }
        switch ($status) {
            'applied' { $o.Outcome = 'Applied' }
            'unchanged' { $o.Outcome = 'Unchanged' }   # same stock with a later time: success
            'replay' { $o.Outcome = 'Replay' }         # the same file and time again (a retry): success
            'draft' { $o.Outcome = 'Draft' }
            default { $o.Outcome = 'Ok' }
        }
        $o.Message = $null
        return $o
    }
    switch ($code) {
        { $_ -eq 401 -or $_ -eq 403 } { $o.Outcome = 'AuthFailed'; return $o }
        409 {
            if ($msg -match '(?i)not switched on') { $o.Outcome = 'NotLive' }
            elseif ($msg -match '(?i)out of order') { $o.Outcome = 'OutOfOrder' }
            else { $o.Outcome = 'Conflict' }
            return $o
        }
        413 { $o.Outcome = 'Rejected'; return $o }
        422 { $o.Outcome = 'Rejected'; return $o }
        429 { $o.Outcome = 'RateLimited'; $o.Retryable = $true; return $o }
    }
    if ($code -ge 500) { $o.Outcome = 'ServerError'; $o.Retryable = $true; return $o }
    if ($code -eq 404) { $o.Outcome = 'Rejected'; $o.Message = "$msg (check the API address and the partner id)"; return $o }
    return $o
}

function Get-RetryDelaySeconds {
    # 10 s, 30 s, 60 s ... with +/-20% jitter; a server Retry-After (when given) wins.
    param([int]$Attempt, $RetryAfterSeconds)
    if ($RetryAfterSeconds -and $RetryAfterSeconds -gt 0) { return [int]$RetryAfterSeconds }
    $base = @(10, 30, 60, 120)[[math]::Min($Attempt - 1, 3)]
    return [int][math]::Round($base * (0.8 + (Get-Random -Minimum 0.0 -Maximum 0.4)))
}

function Invoke-FeedRequest {
    # One logical request with bounded retries. Returns @{ Response; Outcome; Attempts }.
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Config,
        [Parameter(Mandatory)][scriptblock]$Send,
        [Parameter(Mandatory)][datetime]$DeadlineUtc,
        [string]$What = 'request'
    )
    $attempt = 0
    while ($true) {
        $attempt++
        $resp = & $Send
        $outcome = Get-ResponseOutcome $resp
        if (-not $outcome.Retryable -or $attempt -ge $Config.MaxAttempts) { break }
        $delay = Get-RetryDelaySeconds -Attempt $attempt -RetryAfterSeconds $resp.RetryAfterSeconds
        $left = ($DeadlineUtc - [datetime]::UtcNow).TotalSeconds - $delay - $Config.RequestTimeoutSeconds
        if ($left -lt 0) { break }   # leave it to the next scheduled run
        Write-ConnectorLog -Level Warning -EventId $script:EventIds.Retrying -Message ("{0}: {1} ({2}); trying again in {3} s (attempt {4} of {5})." -f
            $What, $outcome.Outcome, $outcome.Message, $delay, ($attempt + 1), $Config.MaxAttempts)
        Wait-ConnectorSeconds $delay
    }
    return @{ Response = $resp; Outcome = $outcome; Attempts = $attempt }
}

function Get-DawabagWhoami {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Config, [Parameter(Mandatory)][string]$ApiKey, [Parameter(Mandatory)][datetime]$DeadlineUtc)
    $uri = Get-FeedUri -Config $Config -Path whoami
    $timeout = $Config.RequestTimeoutSeconds
    $r = Invoke-FeedRequest -Config $Config -DeadlineUtc $DeadlineUtc -What 'Checking the key with Dawabag' -Send {
        Invoke-ConnectorHttp -Method GET -Uri $uri -ApiKey $ApiKey -TimeoutSeconds $timeout
    }
    $info = $null
    if ($r.Outcome.Success -and $r.Response.Json -and $r.Response.Json.data) {
        $d = $r.Response.Json.data
        $feed = $d.stock_feed
        $info = [pscustomobject]@{
            PartnerId          = [string]$d.partner_id
            PartnerName        = [string]$d.partner_name
            Key                = [string]$d.key
            Mode               = if ($feed) { [string]$feed.mode } else { 'manual' }
            LastTakenAtUtc     = if ($feed) { ConvertFrom-ServerTime $feed.last_taken_at } else { $null }
            LastSequence       = if ($feed) { $feed.last_sequence } else { $null }
            StaleAfterMinutes  = if ($feed -and $feed.stale_after_minutes) { [int]$feed.stale_after_minutes } else { 15 }
        }
    }
    $r.Info = $info
    return $r
}

function Send-DawabagExport {
    # Uploads one export file's bytes. Live mode -> /stock-snapshot (applies), otherwise -> /stock-files (draft).
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Config,
        [Parameter(Mandatory)][string]$ApiKey,
        [Parameter(Mandatory)][byte[]]$Bytes,
        [Parameter(Mandatory)][string]$FileName,
        [Parameter(Mandatory)][datetime]$TakenAtUtc,
        [Parameter(Mandatory)][ValidateSet('live', 'draft')][string]$As,
        [Parameter(Mandatory)][datetime]$DeadlineUtc
    )
    $path = if ($As -eq 'live') { 'stock-snapshot' } else { 'stock-files' }
    $uri = Get-FeedUri -Config $Config -Path $path
    # Same header on every retry: the server treats a repeat as a replay (no double counting).
    $headers = @{ 'X-Snapshot-Taken-At' = (ConvertTo-IstIsoString $TakenAtUtc) }
    $timeout = $Config.RequestTimeoutSeconds
    return Invoke-FeedRequest -Config $Config -DeadlineUtc $DeadlineUtc -What "Uploading $FileName" -Send {
        Invoke-ConnectorHttp -Method POST -Uri $uri -ApiKey $ApiKey -FileBytes $Bytes -FileName $FileName -Headers $headers -TimeoutSeconds $timeout
    }
}

function Format-ServerSummary {
    # A short line from the server's answer (counts only; no product names or prices).
    param($Json)
    if (-not $Json -or -not $Json.data) { return '' }
    $d = $Json.data
    $parts = New-Object System.Collections.Generic.List[string]
    if ($d.PSObject.Properties['applied'] -and $d.applied) {
        $a = $d.applied
        $parts.Add(('lines {0}; batches set {1}, new {2}, set to 0 {3}; packs offered {4}; held for orders {5}' -f
                $a.lines, $a.batches_set, $a.batches_new, $a.batches_zeroed, $a.packs_offered, $a.held_for_orders))
    }
    if ($d.PSObject.Properties['waiting_for_check'] -and $d.waiting_for_check) {
        $w = $d.waiting_for_check
        $parts.Add(('waiting for a person in the partner portal: {0} new, {1} open' -f $w.new, $w.open))
    }
    if ($d.PSObject.Properties['summary'] -and $d.summary) {
        $s = $d.summary
        $bits = foreach ($n in @('lines', 'matched', 'needs_review', 'problem', 'skipped')) {
            if ($s.PSObject.Properties[$n]) { '{0} {1}' -f $n.Replace('_', ' '), $s.$n }
        }
        if ($bits) { $parts.Add('file: ' + ($bits -join ', ')) }
    }
    if ($d.PSObject.Properties['import_id'] -and $d.import_id) { $parts.Add("import $($d.import_id)") }
    return ($parts -join '; ')
}
