# Uninstall-StockConnector.ps1 - run as administrator. Removes the scheduled task, the
# settings, the stored key (and the dedicated "DawabagConnector" account with its profile)
# and the program files. The MediVision export folder and its files are NOT touched.
[CmdletBinding()]
param([switch]$KeepServiceAccount, [switch]$RemoveEventSource)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path (Join-Path $PSScriptRoot 'DawabagStockConnector') 'DawabagStockConnector.psd1') -Force
Uninstall-DawabagConnector -KeepServiceAccount:$KeepServiceAccount -RemoveEventSource:$RemoveEventSource
