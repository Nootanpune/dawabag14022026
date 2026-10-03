# Run-StockConnector.ps1 - what the Scheduled Task runs every ~5 minutes (one stateless run).
# Exit code 0 = fine (uploaded, nothing new, or waiting for live mode); 1 = a problem
# (details in Event Viewer > Windows Logs > Application, source "Dawabag Stock Connector").
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path (Join-Path $PSScriptRoot 'DawabagStockConnector') 'DawabagStockConnector.psd1') -Force
$result = Invoke-DawabagStockSync
if ($result.Success) { exit 0 } else { exit 1 }
