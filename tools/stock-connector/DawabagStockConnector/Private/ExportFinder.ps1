# ExportFinder.ps1 - finds the newest COMPLETE stock export in the export folder.
#
# READ-ONLY: the export folder and its files belong to MediVision / Allied Softtech.
# The connector never deletes, moves, renames, locks for writing or changes them; it
# only lists the folder and reads a file's bytes into memory. Clearing old exports, if
# ever needed, is the partner's / Allied's job.
#
# "Complete" means: an accepted extension, not empty, not over the upload limit, older
# than MinFileAgeSeconds, the same size and modified time across a StableSeconds wait,
# and not open for writing by another program.

function Wait-ConnectorSeconds {
    # Separate so the tests can skip real waiting.
    param([int]$Seconds)
    if ($Seconds -gt 0) { Start-Sleep -Seconds $Seconds }
}

function Get-ExportFile {
    # All candidate exports in the folder (not sub-folders), newest first.
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Folder, [Parameter(Mandatory)][string[]]$Patterns)
    if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
        throw "The export folder '$Folder' does not exist or this Windows account cannot open it."
    }
    $seen = @{}
    $files = foreach ($pat in $Patterns) {
        foreach ($f in @(Get-ChildItem -LiteralPath $Folder -Filter $pat -File -ErrorAction Stop)) {
            if ($seen.ContainsKey($f.FullName)) { continue }
            $seen[$f.FullName] = $true
            # "*.xls" style filters also match ".xlsx" on Windows (and the reverse is never wanted):
            # keep only what the server reads; skip Excel's "~$" owner files.
            if ($script:AcceptedExtensions -notcontains $f.Extension.ToLowerInvariant()) { continue }
            if ($f.Name.StartsWith('~$')) { continue }
            $f
        }
    }
    return @($files | Sort-Object -Property LastWriteTimeUtc -Descending)
}

function Test-ExportFileUnlocked {
    # True when no program holds the file open for writing (FileShare.Read refuses then).
    param([Parameter(Mandatory)][string]$Path)
    try {
        $s = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
        $s.Dispose()
        return $true
    } catch [System.IO.IOException] {
        return $false
    }
}

function Test-ExportFileReady {
    # Quick checks without waiting. Returns $null when ready, else the reason.
    param([Parameter(Mandatory)][System.IO.FileInfo]$File, [int]$MinAgeSeconds, [datetime]$NowUtc = [datetime]::UtcNow)
    if ($File.Length -le 0) { return 'the file is empty' }
    if ($File.Length -gt $script:MaxUploadBytes) { return ('the file is {0:N1} MB; Dawabag accepts up to 5 MB' -f ($File.Length / 1MB)) }
    $age = ($NowUtc - $File.LastWriteTimeUtc).TotalSeconds
    if ($age -lt $MinAgeSeconds) { return ('it was written {0:N0} s ago; waiting until it is {1} s old' -f [math]::Max(0, $age), $MinAgeSeconds) }
    return $null
}

function Test-ExportFileStable {
    # Size and modified time unchanged across StableSeconds, and not open for writing.
    param([Parameter(Mandatory)][System.IO.FileInfo]$File, [int]$StableSeconds)
    $len = $File.Length; $time = $File.LastWriteTimeUtc
    Wait-ConnectorSeconds $StableSeconds
    $File.Refresh()
    if (-not $File.Exists) { return 'the file disappeared while waiting' }
    if ($File.Length -ne $len -or $File.LastWriteTimeUtc -ne $time) { return 'the file is still being written (its size or time changed)' }
    if (-not (Test-ExportFileUnlocked $File.FullName)) { return 'another program still has the file open for writing' }
    return $null
}

function Find-ExportToSend {
    # Stateless choice: the newest complete export written AFTER the snapshot Dawabag
    # already has (LastTakenAtUtc from /whoami; $null = Dawabag has none yet).
    # Returns @{ File; TakenAtUtc; Newest; Pending; Notes }.
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Config,
        [AllowNull()]$LastTakenAtUtc,
        [datetime]$NowUtc = [datetime]::UtcNow
    )
    $all = @(Get-ExportFile -Folder $Config.ExportFolder -Patterns $Config.FilePatterns)
    $notes = New-Object System.Collections.Generic.List[string]
    $result = @{ File = $null; TakenAtUtc = $null; Newest = $null; Pending = 0; Notes = $notes; Count = $all.Count }
    if (-not $all.Count) { return $result }
    $result.Newest = $all[0]

    $newer = @($all | Where-Object { $null -eq $LastTakenAtUtc -or (Get-WholeSecondUtc $_.LastWriteTimeUtc) -gt $LastTakenAtUtc })
    $result.Pending = $newer.Count
    foreach ($f in $newer) {
        # Newest first; an older file is only tried while the newest is still being written.
        # Sending it is safe (the server keeps order by export time) and keeps the feed fresh.
        $why = Test-ExportFileReady -File $f -MinAgeSeconds $Config.MinFileAgeSeconds -NowUtc $NowUtc
        if (-not $why) { $why = Test-ExportFileStable -File $f -StableSeconds $Config.StableSeconds }
        if ($why) { $notes.Add("$($f.Name): $why"); continue }
        $result.File = $f
        $result.TakenAtUtc = Get-WholeSecondUtc $f.LastWriteTimeUtc
        break
    }
    return $result
}

function Read-ExportFileBytes {
    # Reads the whole file into memory (read-only, sharing read). Nothing is written anywhere.
    # Sprint 49: an export saved under a FIXED name is rewritten in place every 15-30 minutes
    # (for example by a Power Automate Desktop flow). When the caller passes what it checked
    # (-ExpectedWriteTimeUtc / -ExpectedLength), the file is compared again once it is open
    # (an open FileShare.Read handle keeps writers out while it is read): if it was rewritten
    # since the check, nothing is sent with the older file's time - the next run sends it.
    param(
        [Parameter(Mandatory)][System.IO.FileInfo]$File,
        [Nullable[datetime]]$ExpectedWriteTimeUtc = $null,
        [long]$ExpectedLength = -1
    )
    try {
        $s = [System.IO.File]::Open($File.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    } catch [System.IO.IOException] {
        throw (New-Object System.IO.IOException ('{0} is being written again (it is open in another program); it is sent on a later run' -f $File.Name))
    }
    try {
        if ($null -ne $ExpectedWriteTimeUtc -or $ExpectedLength -ge 0) {
            $nowTime = [System.IO.File]::GetLastWriteTimeUtc($File.FullName)
            if (($null -ne $ExpectedWriteTimeUtc -and $nowTime -ne $ExpectedWriteTimeUtc) -or ($ExpectedLength -ge 0 -and $s.Length -ne $ExpectedLength)) {
                throw (New-Object System.IO.IOException ('{0} was rewritten after it was checked; the new export is sent on the next run' -f $File.Name))
            }
        }
        if ($s.Length -gt $script:MaxUploadBytes) { throw ('{0} is larger than 5 MB' -f $File.Name) }
        $buf = New-Object byte[] ([int]$s.Length)
        $read = 0
        while ($read -lt $buf.Length) {
            $n = $s.Read($buf, $read, $buf.Length - $read)
            if ($n -le 0) { break }
            $read += $n
        }
        if ($read -ne $buf.Length) { throw "$($File.Name) changed while it was being read" }
        return , $buf
    } finally { $s.Dispose() }
}
