# Send-StockFile.ps1 - manual mode: send one stock export now (read only; the file is not moved).
#   powershell -ExecutionPolicy Bypass -File .\Send-StockFile.ps1 -File 'D:\Exports\STOCK.xlsx' [-PromptForKey]
# Before live mode it becomes a DRAFT in the Dawabag partner portal; in live mode it applies.
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory)][string]$File,
    [string]$PartnerId,
    [string]$ApiBaseUrl,
    [switch]$PromptForKey
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path (Join-Path $PSScriptRoot 'DawabagStockConnector') 'DawabagStockConnector.psd1') -Force
$p = @{ File = $File; PromptForKey = $PromptForKey; WhatIf = $WhatIfPreference }
if ($PartnerId) { $p.PartnerId = $PartnerId }
if ($ApiBaseUrl) { $p.ApiBaseUrl = $ApiBaseUrl }
$r = Send-DawabagStock @p
if ($r -and -not $r.Success) { exit 1 }
