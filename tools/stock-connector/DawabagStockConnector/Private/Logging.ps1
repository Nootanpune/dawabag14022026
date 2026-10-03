# Logging.ps1 - Windows Event Log only (Application log, source "Dawabag Stock Connector").
# No log files (standing rule: no local storage). The API key is never logged; as a
# second line of defence every message passes through Protect-LogText, which hides
# anything shaped like a Dawabag key (Compliance Rulebook C-44, C-46).

function Protect-LogText {
    [CmdletBinding()]
    param([AllowNull()][AllowEmptyString()][string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return $Text }
    # dwbk_<prefix>_<secret>: keep the scheme and prefix (how Dawabag names a key), hide the secret
    $masked = [regex]::Replace($Text, 'dwbk_([a-z0-9]{10})_[A-Za-z0-9_-]{6,}', 'dwbk_$1_(hidden)')
    # A bearer value of any shape
    return [regex]::Replace($masked, '(?i)(Bearer\s+)\S+', '$1(hidden)')
}

function Test-IsWindowsHost {
    # $IsWindows exists only in PowerShell 6+; Windows PowerShell 5.1 runs only on Windows.
    if ($PSVersionTable.PSEdition -eq 'Desktop') { return $true }
    return [bool](Get-Variable -Name IsWindows -ValueOnly -ErrorAction SilentlyContinue)
}

function Write-ConnectorLog {
    [CmdletBinding()]
    param(
        [ValidateSet('Information', 'Warning', 'Error')][string]$Level = 'Information',
        [Parameter(Mandatory)][int]$EventId,
        [Parameter(Mandatory)][string]$Message
    )
    $safe = Protect-LogText $Message
    $color = @{ Information = 'Gray'; Warning = 'Yellow'; Error = 'Red' }[$Level]
    # Console copy for interactive commands (Test / Send / Install). A scheduled run has no console.
    Write-Host ('[{0}] {1}' -f $Level.ToUpperInvariant(), $safe) -ForegroundColor $color

    if (-not (Test-IsWindowsHost)) { return }
    try {
        $type = [System.Diagnostics.EventLogEntryType]::$Level
        # The installer registers the source; a non-admin account can write to it but not create it.
        [System.Diagnostics.EventLog]::WriteEntry($script:EventSource, $safe, $type, $EventId)
    } catch {
        Write-Warning ("Could not write to the Windows Event Log (run the installer as administrator to register the source '{0}'): {1}" -f $script:EventSource, $_.Exception.Message)
    }
}

function Register-ConnectorEventSource {
    # Admin only (called by the installer).
    if (-not [System.Diagnostics.EventLog]::SourceExists($script:EventSource)) {
        [System.Diagnostics.EventLog]::CreateEventSource($script:EventSource, $script:EventLogName)
    }
}

function Get-ConnectorRecentEvents {
    [CmdletBinding()]
    param([int]$MaxEvents = 5)
    if (-not (Test-IsWindowsHost)) { return @() }
    try {
        return @(Get-WinEvent -FilterHashtable @{ LogName = $script:EventLogName; ProviderName = $script:EventSource } -MaxEvents $MaxEvents -ErrorAction Stop)
    } catch { return @() }
}
