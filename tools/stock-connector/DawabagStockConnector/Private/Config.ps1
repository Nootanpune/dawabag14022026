# Config.ps1 - non-secret settings, kept in the registry key
# HKLM\SOFTWARE\Dawabag\StockConnector (written by the installer as administrator,
# readable by the task's low-privilege account). There is no settings file: the
# registry is the operating system's own configuration store, and the values are
# settings, not business data. The API key is NOT here (see Secret.ps1).

function ConvertTo-ConnectorConfig {
    # Pure: merges raw values (from the registry or parameters) with the defaults and validates.
    [CmdletBinding()]
    param([Parameter(Mandatory)][hashtable]$Values)
    $d = $script:Defaults
    $pick = { param($name) if ($Values.ContainsKey($name) -and $null -ne $Values[$name] -and "$($Values[$name])" -ne '') { $Values[$name] } else { $d[$name] } }

    $patterns = @(& $pick 'FilePatterns' | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
    $cfg = [pscustomobject]@{
        ApiBaseUrl            = ("$(& $pick 'ApiBaseUrl')").Trim().TrimEnd('/')
        PartnerId             = ("$($Values['PartnerId'])").Trim()
        ExportFolder          = ("$($Values['ExportFolder'])").Trim()
        FilePatterns          = $patterns
        MinFileAgeSeconds     = [int](& $pick 'MinFileAgeSeconds')
        StableSeconds         = [int](& $pick 'StableSeconds')
        RequestTimeoutSeconds = [int](& $pick 'RequestTimeoutSeconds')
        MaxAttempts           = [int](& $pick 'MaxAttempts')
        RunBudgetSeconds      = [int](& $pick 'RunBudgetSeconds')
    }
    $problems = @(Test-ConnectorConfig $cfg)
    if ($problems.Count) { throw ('Connector settings are not valid: ' + ($problems -join '; ')) }
    return $cfg
}

function Test-ConnectorConfig {
    # Returns a list of plain-English problems (empty when the settings are usable).
    param([Parameter(Mandatory)]$Config)
    $p = New-Object System.Collections.Generic.List[string]
    $uri = $null
    if (-not [Uri]::TryCreate($Config.ApiBaseUrl, [UriKind]::Absolute, [ref]$uri)) {
        $p.Add("ApiBaseUrl '$($Config.ApiBaseUrl)' is not an address")
    } elseif ($uri.Scheme -ne 'https' -and -not ($uri.Scheme -eq 'http' -and $uri.IsLoopback)) {
        # The key travels in a header: HTTPS only (plain http only to this PC, for testing)
        $p.Add('ApiBaseUrl must start with https://')
    }
    $g = [guid]::Empty
    if (-not [guid]::TryParse($Config.PartnerId, [ref]$g)) { $p.Add('PartnerId must be the partner id shown next to the key in Dawabag (a GUID)') }
    if (-not $Config.ExportFolder) { $p.Add('ExportFolder is empty') }
    if (-not $Config.FilePatterns.Count) { $p.Add('FilePatterns is empty') }
    foreach ($pat in $Config.FilePatterns) {
        if ($pat -match '[\\/]') { $p.Add("FilePattern '$pat' must be a file name pattern such as *.xlsx") }
    }
    if ($Config.MinFileAgeSeconds -lt 0 -or $Config.MinFileAgeSeconds -gt 3600) { $p.Add('MinFileAgeSeconds must be 0..3600') }
    if ($Config.StableSeconds -lt 0 -or $Config.StableSeconds -gt 120) { $p.Add('StableSeconds must be 0..120') }
    if ($Config.RequestTimeoutSeconds -lt 5 -or $Config.RequestTimeoutSeconds -gt 300) { $p.Add('RequestTimeoutSeconds must be 5..300') }
    if ($Config.MaxAttempts -lt 1 -or $Config.MaxAttempts -gt 6) { $p.Add('MaxAttempts must be 1..6') }
    if ($Config.RunBudgetSeconds -lt 30 -or $Config.RunBudgetSeconds -gt 280) { $p.Add('RunBudgetSeconds must be 30..280 (a run must end before the next one)') }
    return $p.ToArray()
}

function Get-ConnectorConfig {
    # Reads the registry; parameters given here override it (used by Send-DawabagStock before install).
    [CmdletBinding()]
    param([hashtable]$Override = @{})
    $values = @{}
    if (Test-Path -LiteralPath $script:RegistryPath) {
        $item = Get-ItemProperty -LiteralPath $script:RegistryPath
        foreach ($name in @('ApiBaseUrl', 'PartnerId', 'ExportFolder', 'FilePatterns', 'MinFileAgeSeconds', 'StableSeconds',
                'RequestTimeoutSeconds', 'MaxAttempts', 'RunBudgetSeconds')) {
            if ($item.PSObject.Properties[$name]) { $values[$name] = $item.$name }
        }
    }
    foreach ($k in $Override.Keys) { if ($null -ne $Override[$k] -and "$($Override[$k])" -ne '') { $values[$k] = $Override[$k] } }
    if (-not $values.ContainsKey('PartnerId')) {
        throw "The connector is not set up on this PC (no settings in $($script:RegistryPath)). Run Install-StockConnector.ps1 as administrator."
    }
    return ConvertTo-ConnectorConfig -Values $values
}

function Set-ConnectorConfig {
    # Admin only (installer). Writes the validated settings to the registry.
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Config)
    if (-not (Test-Path -LiteralPath $script:RegistryPath)) { New-Item -Path $script:RegistryPath -Force | Out-Null }
    $p = $script:RegistryPath
    Set-ItemProperty -LiteralPath $p -Name ApiBaseUrl -Value $Config.ApiBaseUrl -Type String
    Set-ItemProperty -LiteralPath $p -Name PartnerId -Value $Config.PartnerId -Type String
    Set-ItemProperty -LiteralPath $p -Name ExportFolder -Value $Config.ExportFolder -Type String
    Set-ItemProperty -LiteralPath $p -Name FilePatterns -Value ([string[]]$Config.FilePatterns) -Type MultiString
    foreach ($n in @('MinFileAgeSeconds', 'StableSeconds', 'RequestTimeoutSeconds', 'MaxAttempts', 'RunBudgetSeconds')) {
        Set-ItemProperty -LiteralPath $p -Name $n -Value ([int]$Config.$n) -Type DWord
    }
    Set-ItemProperty -LiteralPath $p -Name ConnectorVersion -Value $script:ConnectorVersion -Type String
}

function Remove-ConnectorConfig {
    if (Test-Path -LiteralPath $script:RegistryPath) { Remove-Item -LiteralPath $script:RegistryPath -Recurse -Force }
    $parent = Split-Path -Parent $script:RegistryPath
    if ((Test-Path -LiteralPath $parent) -and -not (Get-ChildItem -LiteralPath $parent) -and -not (Get-Item -LiteralPath $parent).Property) {
        Remove-Item -LiteralPath $parent -Force
    }
}
