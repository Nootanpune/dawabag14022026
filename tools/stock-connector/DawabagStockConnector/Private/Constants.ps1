# Constants.ps1 - fixed names and defaults of the Dawabag Stock Connector.
# Keep every file of this module plain ASCII: Windows PowerShell 5.1 reads a .ps1
# without a byte-order mark in the ANSI code page.

$script:ConnectorVersion = '1.0.0'

# Non-secret settings live in the registry (HKLM, admins write, everyone reads).
# Nothing else is stored by the connector: no data files, no "sent" list, no database
# (standing rule: the Dawabag server is the single source of truth; each run asks it
# what it already has via /whoami).
$script:RegistryPath = 'HKLM:\SOFTWARE\Dawabag\StockConnector'

# The API key lives only in Windows Credential Manager (generic credential) of the
# Windows account that runs the scheduled task.
$script:CredentialTarget = 'Dawabag Stock Connector'

# Logging goes to the Windows Event Log only (no log files).
$script:EventLogName = 'Application'
$script:EventSource = 'Dawabag Stock Connector'

$script:TaskName = 'Dawabag Stock Connector'
$script:TaskPath = '\Dawabag\'
$script:DefaultInstallRoot = $(if ($env:ProgramFiles) { $env:ProgramFiles } else { 'C:\Program Files' }) + '\Dawabag\StockConnector'
$script:DefaultServiceAccount = 'DawabagConnector'

$script:Defaults = @{
    ApiBaseUrl            = 'https://api.trial.dawabag.com'
    FilePatterns          = @('*.xlsx', '*.csv')
    MinFileAgeSeconds     = 60      # the export must be at least this old ...
    StableSeconds         = 10      # ... and keep the same size/time across this wait
    RequestTimeoutSeconds = 45
    MaxAttempts           = 3       # per request, within one run
    RunBudgetSeconds      = 200     # a run never outlives the 5-minute schedule
    IntervalMinutes       = 5
}

# The server reads only these (old binary .xls is refused, docs/partner-stock-api.md).
$script:AcceptedExtensions = @('.xlsx', '.csv', '.txt', '.tsv')
$script:MaxUploadBytes = 5MB        # backend MAX_FILE_BYTES (partnerStockImport/readFile.ts)

# Export times are sent in Indian Standard Time, whatever the PC's time zone setting.
$script:IstOffsetMinutes = 330
$script:IstOffsetText = '+05:30'

# Same shape the backend accepts (services/partnerApiKeys/keys.ts KEY_RE).
$script:ApiKeyPattern = '^dwbk_[a-z0-9]{10}_[A-Za-z0-9_-]{43}$'

# Event IDs (Application log, source "Dawabag Stock Connector").
$script:EventIds = @{
    Uploaded        = 1001   # snapshot applied / unchanged / replay, or draft created
    NothingNew      = 1002   # no export newer than what Dawabag already has
    NotLive         = 1003   # live mode is off for the partner: scheduled runs wait
    Installed       = 1010
    KeyStored       = 1011
    Uninstalled     = 1012
    Retrying        = 2001   # 429 / 5xx / network error, will retry within the run
    RetryNextRun    = 2002   # gave up for this run; the next run tries again
    OutOfOrder      = 2003   # export older than the snapshot already applied (409)
    ExportStale     = 2004   # the newest export in the folder is old: is the export running?
    NotComplete     = 2005   # newest export still being written / locked / too young
    ConfigError     = 3001
    KeyMissing      = 3002
    AuthFailed      = 3003   # 401 / 403
    Rejected        = 3004   # 422 / 413 / other refusal: fix the export or the setup
    FolderError     = 3005
    Unexpected      = 3009
}
