# Test-StockConnector.ps1 - checks settings, folder access, key, Dawabag (whoami) and shows
# which file the next run would send. Uploads nothing.
#   powershell -ExecutionPolicy Bypass -File .\Test-StockConnector.ps1 [-PromptForKey]
[CmdletBinding()]
param([switch]$PromptForKey)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path (Join-Path $PSScriptRoot 'DawabagStockConnector') 'DawabagStockConnector.psd1') -Force
Test-DawabagConnector -PromptForKey:$PromptForKey
