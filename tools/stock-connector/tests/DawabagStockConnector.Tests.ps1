# Pester 5 tests for the Dawabag Stock Connector. HTTP is mocked (Invoke-ConnectorHttp),
# the registry and Credential Manager are mocked (Get-ConnectorConfig / Get-ConnectorSecret),
# waiting is mocked (Wait-ConnectorSeconds). Export files live in Pester's TestDrive.
#   Install-Module Pester -MinimumVersion 5.0 -Scope CurrentUser   (once)
#   Invoke-Pester -Path .\tools\stock-connector\tests -Output Detailed

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '..\DawabagStockConnector\DawabagStockConnector.psd1') -Force
}

Describe 'Time and text helpers' {
    It 'sends export times in IST, whole seconds' {
        InModuleScope DawabagStockConnector {
            $u = [datetime]::SpecifyKind([datetime]'2026-10-03T10:05:07.9', 'Utc')
            ConvertTo-IstIsoString $u | Should -Be '2026-10-03T15:35:07+05:30'
        }
    }
    It 'reads the server time as UTC (string or DateTime)' {
        InModuleScope DawabagStockConnector {
            $want = [datetime]::SpecifyKind([datetime]'2026-10-03T10:00:00', 'Utc')
            ConvertFrom-ServerTime '2026-10-03T10:00:00.000Z' | Should -Be $want
            ConvertFrom-ServerTime $want | Should -Be $want
            ConvertFrom-ServerTime $null | Should -BeNullOrEmpty
        }
    }
    It 'never lets a key through to a log line' {
        InModuleScope DawabagStockConnector {
            $k = 'dwbk_abcde12345_' + ('A' * 43)
            Protect-LogText "sent with $k" | Should -Be 'sent with dwbk_abcde12345_(hidden)'
            Protect-LogText 'Authorization: Bearer whatever' | Should -Be 'Authorization: Bearer (hidden)'
        }
    }
    It 'checks the key shape like the server' {
        InModuleScope DawabagStockConnector {
            Test-ApiKeyFormat ('dwbk_abcde12345_' + ('A' * 43)) | Should -BeTrue
            Test-ApiKeyFormat 'dwbk_ABCDE12345_short' | Should -BeFalse
            Test-ApiKeyFormat $null | Should -BeFalse
        }
    }
}

Describe 'Settings' {
    It 'fills in defaults' {
        InModuleScope DawabagStockConnector {
            $c = ConvertTo-ConnectorConfig -Values @{ PartnerId = '00000000-0000-4000-8000-000000000000'; ExportFolder = 'C:\Export' }
            $c.ApiBaseUrl | Should -Be 'https://api.trial.dawabag.com'
            $c.FilePatterns | Should -Be @('*.xlsx', '*.csv')
            $c.MinFileAgeSeconds | Should -Be 60
        }
    }
    It 'refuses plain http (except this PC) and a partner id that is not a GUID' {
        InModuleScope DawabagStockConnector {
            { ConvertTo-ConnectorConfig -Values @{ PartnerId = 'x'; ExportFolder = 'C:\E'; ApiBaseUrl = 'http://example.com' } } | Should -Throw '*https*'
            (ConvertTo-ConnectorConfig -Values @{ PartnerId = '00000000-0000-4000-8000-000000000000'; ExportFolder = 'C:\E'; ApiBaseUrl = 'http://127.0.0.1:8080/' }).ApiBaseUrl |
                Should -Be 'http://127.0.0.1:8080'
        }
    }
}

Describe 'Server answers' {
    It 'maps <Code> "<Msg>" to <Outcome>' -TestCases @(
        @{ Code = 409; Msg = 'Live stock feed is not switched on for this partner'; Outcome = 'NotLive'; Retry = $false }
        @{ Code = 409; Msg = 'Out of order: taken_at is earlier than the snapshot already applied'; Outcome = 'OutOfOrder'; Retry = $false }
        @{ Code = 401; Msg = 'Invalid key'; Outcome = 'AuthFailed'; Retry = $false }
        @{ Code = 403; Msg = 'Other partner'; Outcome = 'AuthFailed'; Retry = $false }
        @{ Code = 422; Msg = 'columns not known'; Outcome = 'Rejected'; Retry = $false }
        @{ Code = 429; Msg = 'Too many'; Outcome = 'RateLimited'; Retry = $true }
        @{ Code = 503; Msg = 'down'; Outcome = 'ServerError'; Retry = $true }
    ) {
        InModuleScope DawabagStockConnector -Parameters @{ Code = $Code; Msg = $Msg; Outcome = $Outcome; Retry = $Retry } {
            $o = Get-ResponseOutcome @{ StatusCode = $Code; Json = [pscustomobject]@{ message = $Msg }; Body = 'x'; NetworkError = $null }
            $o.Outcome | Should -Be $Outcome
            $o.Retryable | Should -Be $Retry
        }
    }
    It 'treats replay and unchanged as success' {
        InModuleScope DawabagStockConnector {
            foreach ($s in 'replay', 'unchanged', 'applied') {
                $o = Get-ResponseOutcome @{ StatusCode = 200; Json = ("{""data"":{""status"":""$s""}}" | ConvertFrom-Json); Body = 'x'; NetworkError = $null }
                $o.Success | Should -BeTrue
            }
        }
    }
    It 'retries a lost connection' {
        InModuleScope DawabagStockConnector {
            (Get-ResponseOutcome @{ StatusCode = 0; NetworkError = 'refused'; Json = $null; Body = $null }).Retryable | Should -BeTrue
        }
    }
}

Describe 'Choosing the export' {
    BeforeEach {
        $script:dir = Join-Path $TestDrive ([guid]::NewGuid())
        New-Item -ItemType Directory -Path $script:dir | Out-Null
        function New-Export([string]$Name, [int]$MinutesAgo, [string]$Content = 'a,b') {
            $p = Join-Path $script:dir $Name
            Set-Content -LiteralPath $p -Value $Content -NoNewline
            (Get-Item -LiteralPath $p).LastWriteTimeUtc = [datetime]::UtcNow.AddMinutes(-$MinutesAgo)
        }
        New-Export 'old.csv' 30; New-Export 'mid.xlsx' 10 'xlsx'; New-Export 'young.csv' 0
        New-Export 'legacy.xls' 1; New-Export '~$owner.xlsx' 1; New-Export 'empty.csv' 2 ''
    }
    It 'ignores .xls and Excel owner files' {
        InModuleScope DawabagStockConnector -Parameters @{ Dir = $script:dir } {
            (Get-ExportFile -Folder $Dir -Patterns @('*.xlsx', '*.csv')).Name | Should -Be @('young.csv', 'empty.csv', 'mid.xlsx', 'old.csv')
        }
    }
    It 'picks the newest COMPLETE export newer than what Dawabag has' {
        InModuleScope DawabagStockConnector -Parameters @{ Dir = $script:dir } {
            Mock Wait-ConnectorSeconds {}
            $cfg = ConvertTo-ConnectorConfig -Values @{ PartnerId = '00000000-0000-4000-8000-000000000000'; ExportFolder = $Dir }
            $pick = Find-ExportToSend -Config $cfg -LastTakenAtUtc $null
            $pick.File.Name | Should -Be 'mid.xlsx'          # young.csv too new, empty.csv empty
            $last = Get-WholeSecondUtc (Get-Item (Join-Path $Dir 'mid.xlsx')).LastWriteTimeUtc
            (Find-ExportToSend -Config $cfg -LastTakenAtUtc $last).File | Should -BeNullOrEmpty
        }
    }
    It 'waits when the file is still growing' {
        InModuleScope DawabagStockConnector -Parameters @{ Dir = $script:dir } {
            Mock Wait-ConnectorSeconds { Add-Content -LiteralPath (Join-Path $Dir 'mid.xlsx') -Value 'more' }
            $f = Get-Item (Join-Path $Dir 'mid.xlsx')
            Test-ExportFileStable -File $f -StableSeconds 10 | Should -Match 'still being written'
        }
    }
}

Describe 'A scheduled run' {
    BeforeAll {
        $script:dir = Join-Path $TestDrive 'export'
        New-Item -ItemType Directory -Path $script:dir -Force | Out-Null
        $p = Join-Path $script:dir 'STOCK.xlsx'
        Set-Content -LiteralPath $p -Value 'xlsx-bytes' -NoNewline
        (Get-Item $p).LastWriteTimeUtc = [datetime]::UtcNow.AddMinutes(-5)
        $script:hash = (Get-FileHash $p).Hash
    }
    BeforeEach {
        InModuleScope DawabagStockConnector -Parameters @{ Dir = $script:dir } {
            $script:testCfg = ConvertTo-ConnectorConfig -Values @{ PartnerId = '00000000-0000-4000-8000-000000000000'; ExportFolder = $Dir; StableSeconds = 0 }
        }
    }
    It 'uploads nothing while live mode is off' {
        InModuleScope DawabagStockConnector {
            Mock Get-ConnectorConfig { $script:testCfg }
            Mock Get-ConnectorSecret { 'dwbk_abcde12345_' + ('A' * 43) }
            Mock Write-ConnectorLog {}
            Mock Invoke-ConnectorHttp { @{ StatusCode = 200; NetworkError = $null; Body = 'x'; RetryAfterSeconds = $null
                    Json = ('{"data":{"partner_id":"p","partner_name":"Demo","key":"k","stock_feed":{"mode":"manual","last_taken_at":null,"stale_after_minutes":15}}}' | ConvertFrom-Json) } }
            $r = Invoke-DawabagStockSync
            $r.Outcome | Should -Be 'NotLive'
            Should -Invoke Invoke-ConnectorHttp -Times 1 -Exactly -ParameterFilter { $Method -eq 'GET' }
            Should -Invoke Invoke-ConnectorHttp -Times 0 -Exactly -ParameterFilter { $Method -eq 'POST' }
        }
    }
    It 'uploads the export to /stock-snapshot with its IST time, and leaves the file alone' {
        InModuleScope DawabagStockConnector {
            Mock Get-ConnectorConfig { $script:testCfg }
            Mock Get-ConnectorSecret { 'dwbk_abcde12345_' + ('A' * 43) }
            Mock Write-ConnectorLog {}
            Mock Invoke-ConnectorHttp -ParameterFilter { $Method -eq 'GET' } { @{ StatusCode = 200; NetworkError = $null; Body = 'x'; RetryAfterSeconds = $null
                    Json = ('{"data":{"partner_id":"p","partner_name":"Demo","key":"k","stock_feed":{"mode":"live","last_taken_at":null,"stale_after_minutes":15}}}' | ConvertFrom-Json) } }
            Mock Invoke-ConnectorHttp -ParameterFilter { $Method -eq 'POST' } { @{ StatusCode = 200; NetworkError = $null; Body = 'x'; RetryAfterSeconds = $null
                    Json = ('{"data":{"status":"applied","applied":{"lines":1}}}' | ConvertFrom-Json) } }
            $r = Invoke-DawabagStockSync
            $r.Outcome | Should -Be 'Applied'
            $expected = ConvertTo-IstIsoString (Get-Item $r.File).LastWriteTimeUtc
            Should -Invoke Invoke-ConnectorHttp -Times 1 -Exactly -ParameterFilter {
                $Method -eq 'POST' -and $Uri -like '*/stock-snapshot' -and $FileName -eq 'STOCK.xlsx' -and $Headers['X-Snapshot-Taken-At'] -eq $expected
            }
        }
        Test-Path (Join-Path $script:dir 'STOCK.xlsx') | Should -BeTrue
        (Get-FileHash (Join-Path $script:dir 'STOCK.xlsx')).Hash | Should -Be $script:hash
    }
    It 'retries a 503 a bounded number of times, then leaves it to the next run' {
        InModuleScope DawabagStockConnector {
            Mock Get-ConnectorConfig { $script:testCfg }
            Mock Get-ConnectorSecret { 'dwbk_abcde12345_' + ('A' * 43) }
            Mock Write-ConnectorLog {}
            Mock Wait-ConnectorSeconds {}
            Mock Invoke-ConnectorHttp { @{ StatusCode = 503; NetworkError = $null; Body = '{"message":"down"}'; RetryAfterSeconds = $null; Json = [pscustomobject]@{ message = 'down' } } }
            $r = Invoke-DawabagStockSync
            $r.Success | Should -BeFalse
            Should -Invoke Invoke-ConnectorHttp -Times $script:testCfg.MaxAttempts -Exactly
        }
    }
    It 'reports a missing key without calling Dawabag' {
        InModuleScope DawabagStockConnector {
            Mock Get-ConnectorConfig { $script:testCfg }
            Mock Get-ConnectorSecret { $null }
            Mock Write-ConnectorLog {}
            Mock Invoke-ConnectorHttp {}
            (Invoke-DawabagStockSync).Outcome | Should -Be 'KeyMissing'
            Should -Invoke Invoke-ConnectorHttp -Times 0 -Exactly
        }
    }
}
