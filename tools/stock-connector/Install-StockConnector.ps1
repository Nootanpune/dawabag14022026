# Install-StockConnector.ps1 - run in "Windows PowerShell" opened with "Run as administrator":
#   powershell -ExecutionPolicy Bypass -File .\Install-StockConnector.ps1 `
#       -PartnerId 00000000-0000-4000-8000-000000000000 -ExportFolder 'D:\MediVision\StockExport'
# Options: -ApiBaseUrl, -FilePatterns, -MinFileAgeSeconds, -StableSeconds, -IntervalMinutes,
#          -TaskAccount Dedicated|Installer|Existing [-Credential], -GrantFolderRead, -KeepKey, -NoStart
# See docs/stock-connector.md.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PartnerId,
    [Parameter(Mandatory)][string]$ExportFolder,
    [string]$ApiBaseUrl,
    [string[]]$FilePatterns,
    [int]$MinFileAgeSeconds = -1,
    [int]$StableSeconds = -1,
    [int]$IntervalMinutes = 5,
    [ValidateSet('Dedicated', 'Installer', 'Existing')][string]$TaskAccount = 'Dedicated',
    [pscredential]$Credential,
    [switch]$GrantFolderRead,
    [switch]$KeepKey,
    [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path (Join-Path $PSScriptRoot 'DawabagStockConnector') 'DawabagStockConnector.psd1') -Force
# Pass on only what was given, so the module's defaults apply otherwise
$p = @{ PartnerId = $PartnerId; ExportFolder = $ExportFolder; IntervalMinutes = $IntervalMinutes; TaskAccount = $TaskAccount
    GrantFolderRead = $GrantFolderRead; KeepKey = $KeepKey; NoStart = $NoStart }
if ($ApiBaseUrl) { $p.ApiBaseUrl = $ApiBaseUrl }
if ($FilePatterns) { $p.FilePatterns = $FilePatterns }
if ($MinFileAgeSeconds -ge 0) { $p.MinFileAgeSeconds = $MinFileAgeSeconds }
if ($StableSeconds -ge 0) { $p.StableSeconds = $StableSeconds }
if ($Credential) { $p.Credential = $Credential }
Install-DawabagConnector @p
