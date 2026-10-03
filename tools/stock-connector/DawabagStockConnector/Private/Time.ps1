# Time.ps1 - export times. The server orders a partner's snapshots by the time the export
# was written (X-Snapshot-Taken-At) and remembers the last one (whoami: last_taken_at).
# The connector sends whole seconds in Indian Standard Time (+05:30) and compares in UTC
# whole seconds, so "newer than what Dawabag already has" is exact.

function Get-WholeSecondUtc {
    param([Parameter(Mandatory)][datetime]$Time)
    $u = if ($Time.Kind -eq [DateTimeKind]::Utc) { $Time } else { $Time.ToUniversalTime() }
    $u = $u.AddTicks( - ($u.Ticks % [TimeSpan]::TicksPerSecond))
    return [datetime]::SpecifyKind($u, [DateTimeKind]::Utc)
}

function ConvertTo-IstIsoString {
    # 2026-10-03T15:35:00+05:30, independent of the PC's time-zone setting.
    param([Parameter(Mandatory)][datetime]$Time)
    $ist = (Get-WholeSecondUtc $Time).AddMinutes($script:IstOffsetMinutes)
    return $ist.ToString("yyyy'-'MM'-'dd'T'HH':'mm':'ss", [Globalization.CultureInfo]::InvariantCulture) + $script:IstOffsetText
}

function ConvertFrom-ServerTime {
    # The server answers ISO 8601 ("2026-10-03T10:00:00.000Z"). Windows PowerShell 5.1's
    # ConvertFrom-Json keeps it as a string; PowerShell 7 makes it a DateTime. Returns UTC or $null.
    param([AllowNull()]$Value)
    if ($null -eq $Value -or "$Value" -eq '') { return $null }
    if ($Value -is [datetime]) {
        if ($Value.Kind -eq [DateTimeKind]::Unspecified) { return [datetime]::SpecifyKind($Value, [DateTimeKind]::Utc) }
        return $Value.ToUniversalTime()
    }
    $styles = [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal
    return [DateTimeOffset]::Parse("$Value", [Globalization.CultureInfo]::InvariantCulture, $styles).UtcDateTime
}

function Format-IstForPeople {
    param([AllowNull()]$UtcTime)
    if ($null -eq $UtcTime) { return 'never' }
    return (ConvertTo-IstIsoString $UtcTime).Replace('T', ' ').Replace($script:IstOffsetText, ' IST')
}
