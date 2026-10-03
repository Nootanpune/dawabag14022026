# Http.ps1 - one HTTPS request to the Dawabag partner feed API with System.Net.Http.HttpClient
# (Windows PowerShell 5.1's Invoke-RestMethod has no -Form for multipart uploads).
# TLS 1.2 or newer only. The key goes only in the Authorization header (never the URL).
# Redirects are not followed, so the key is never sent to another address.

function Initialize-ConnectorTls {
    # .NET Framework (PowerShell 5.1) uses ServicePointManager; allow only TLS 1.2 / 1.3.
    $p = [Net.SecurityProtocolType]::Tls12
    if ([enum]::GetNames([Net.SecurityProtocolType]) -contains 'Tls13') { $p = $p -bor [Net.SecurityProtocolType]::Tls13 }
    [Net.ServicePointManager]::SecurityProtocol = $p
    if (-not ('System.Net.Http.HttpClient' -as [type])) { Add-Type -AssemblyName System.Net.Http }
}

function New-ConnectorHttpClient {
    param([int]$TimeoutSeconds = 45)
    Initialize-ConnectorTls
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    # .NET Framework 4.7.1+ / .NET Core: pin the handler's protocols as well
    if ($handler.PSObject.Properties['SslProtocols']) {
        $ssl = [Security.Authentication.SslProtocols]::Tls12
        if ([enum]::GetNames([Security.Authentication.SslProtocols]) -contains 'Tls13') { $ssl = $ssl -bor [Security.Authentication.SslProtocols]::Tls13 }
        try { $handler.SslProtocols = $ssl } catch { Write-Verbose 'Could not pin SslProtocols on the handler; ServicePointManager applies' }
    }
    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds)
    $ua = 'DawabagStockConnector/{0} (Windows PowerShell {1})' -f $script:ConnectorVersion, $PSVersionTable.PSVersion
    [void]$client.DefaultRequestHeaders.TryAddWithoutValidation('User-Agent', $ua)
    return $client
}

function Get-ExportContentType {
    param([string]$FileName)
    switch ([IO.Path]::GetExtension($FileName).ToLowerInvariant()) {
        '.xlsx' { return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        '.csv' { return 'text/csv' }
        '.tsv' { return 'text/tab-separated-values' }
        default { return 'text/plain' }
    }
}

function Get-SafeUploadName {
    # The server uses the name only for its extension and to show the partner; keep it plain ASCII.
    param([string]$FileName)
    $n = [regex]::Replace($FileName, '[^A-Za-z0-9._ -]', '_')
    if (-not $n) { $n = 'stock' + [IO.Path]::GetExtension($FileName) }
    return $n
}

function Invoke-ConnectorHttp {
    # Returns @{ StatusCode (0 = no answer); Body; Json; NetworkError; RetryAfterSeconds }.
    # Never throws for HTTP or network problems: the caller decides (Api.ps1).
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateSet('GET', 'POST')][string]$Method,
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][string]$ApiKey,
        [byte[]]$FileBytes,
        [string]$FileName,
        [hashtable]$Headers = @{},
        [int]$TimeoutSeconds = 45
    )
    $client = $null; $request = $null; $response = $null
    $out = @{ StatusCode = 0; Body = $null; Json = $null; NetworkError = $null; RetryAfterSeconds = $null }
    try {
        $client = New-ConnectorHttpClient -TimeoutSeconds $TimeoutSeconds
        $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::new($Method), $Uri)
        $request.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $ApiKey)
        [void]$request.Headers.TryAddWithoutValidation('Accept', 'application/json')
        foreach ($h in $Headers.Keys) { [void]$request.Headers.TryAddWithoutValidation($h, [string]$Headers[$h]) }
        if ($null -ne $FileBytes) {
            $multipart = New-Object System.Net.Http.MultipartFormDataContent
            $part = New-Object System.Net.Http.ByteArrayContent(, $FileBytes)
            $part.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse((Get-ExportContentType $FileName))
            $cd = New-Object System.Net.Http.Headers.ContentDispositionHeaderValue('form-data')
            $cd.Name = '"file"'
            $cd.FileName = '"' + (Get-SafeUploadName $FileName) + '"'
            $part.Headers.ContentDisposition = $cd
            $multipart.Add($part)
            $request.Content = $multipart
        }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        $out.StatusCode = [int]$response.StatusCode
        $out.Body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        if ($response.Headers.RetryAfter -and $response.Headers.RetryAfter.Delta) {
            $out.RetryAfterSeconds = [int]$response.Headers.RetryAfter.Delta.Value.TotalSeconds
        }
        if ($out.Body) { try { $out.Json = $out.Body | ConvertFrom-Json } catch { $out.Json = $null } }
    } catch {
        # Timeout (TaskCanceledException), DNS, refused connection, TLS failure, proxy ...
        $e = $_.Exception
        $timedOut = $false
        while ($true) {
            if ($e -is [System.Threading.Tasks.TaskCanceledException] -or $e -is [System.TimeoutException]) { $timedOut = $true }
            if (-not $e.InnerException) { break }
            $e = $e.InnerException
        }
        $out.NetworkError = if ($timedOut) { "no answer within $TimeoutSeconds s" } else { Protect-LogText $e.Message }
    } finally {
        if ($response) { $response.Dispose() }
        if ($request) { $request.Dispose() }
        if ($client) { $client.Dispose() }
    }
    return $out
}
