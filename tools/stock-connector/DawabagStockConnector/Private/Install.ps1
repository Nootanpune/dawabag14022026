# Install.ps1 - helpers for the installer: administrator check, program copy, the task's
# Windows account, storing the key AS that account, and the Scheduled Task.

function Assert-Administrator {
    if (-not (Test-IsWindowsHost)) { throw 'The Dawabag Stock Connector installs on Windows only.' }
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this in "Windows PowerShell" opened with "Run as administrator".'
    }
}

function Get-PackageRoot {
    # The folder holding the entry scripts and the module folder (the parent of this module).
    return (Split-Path -Parent $script:ModuleRoot)
}

function Get-WindowsPowerShellPath {
    return (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
}

function Copy-ConnectorProgram {
    # Program files only (scripts). Admins can change them, the task's account can only read them.
    param([Parameter(Mandatory)][string]$InstallRoot)
    $src = Get-PackageRoot
    if ((Resolve-Path -LiteralPath $src).Path.TrimEnd('\') -ieq $InstallRoot.TrimEnd('\')) { return }
    if (-not (Test-Path -LiteralPath $InstallRoot)) { New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null }
    $moduleDst = Join-Path $InstallRoot 'DawabagStockConnector'
    if (Test-Path -LiteralPath $moduleDst) { Remove-Item -LiteralPath $moduleDst -Recurse -Force }
    Copy-Item -LiteralPath (Join-Path $src 'DawabagStockConnector') -Destination $moduleDst -Recurse -Force
    foreach ($f in @(Get-ChildItem -LiteralPath $src -Filter '*.ps1' -File)) {
        Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $InstallRoot $f.Name) -Force
    }
    # Downloaded scripts carry a "from the internet" mark; the copies are trusted by the admin who installs them.
    Get-ChildItem -LiteralPath $InstallRoot -Recurse -File | Unblock-File
}

function New-RandomPassword {
    # 32 characters from a cryptographic generator, with every character class (local policy).
    $sets = @('ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!#%+-=?@_')
    $all = -join $sets
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $pick = {
            param([string]$set)
            $b = New-Object byte[] 4
            $rng.GetBytes($b)
            $set[[int]([BitConverter]::ToUInt32($b, 0) % [uint32]$set.Length)]
        }
        $chars = New-Object System.Collections.Generic.List[char]
        foreach ($s in $sets) { $chars.Add((& $pick $s)) }
        while ($chars.Count -lt 32) { $chars.Add((& $pick $all)) }
        # shuffle (Fisher-Yates)
        for ($i = $chars.Count - 1; $i -gt 0; $i--) {
            $b = New-Object byte[] 4; $rng.GetBytes($b)
            $j = [int]([BitConverter]::ToUInt32($b, 0) % [uint32]($i + 1))
            $t = $chars[$i]; $chars[$i] = $chars[$j]; $chars[$j] = $t
        }
        $secure = New-Object System.Security.SecureString
        foreach ($c in $chars) { $secure.AppendChar($c) }
        $secure.MakeReadOnly()
        return $secure
    } finally { $rng.Dispose() }
}

function Set-DedicatedAccount {
    # Creates (or resets) the local low-privilege account "DawabagConnector": member of no group,
    # password random and never shown (Windows keeps it for the task). Returns a PSCredential.
    # NOTE: resetting a password makes the account's earlier Credential Manager entries
    # unreadable (Windows protects them with the old password), so the key is stored again
    # after every install.
    param([string]$Name = $script:DefaultServiceAccount)
    $password = New-RandomPassword
    $existing = Get-LocalUser -Name $Name -ErrorAction SilentlyContinue
    if ($existing) {
        Set-LocalUser -Name $Name -Password $password -PasswordNeverExpires $true -UserMayChangePassword $false
        Enable-LocalUser -Name $Name
    } else {
        New-LocalUser -Name $Name -Password $password -PasswordNeverExpires -UserMayNotChangePassword -AccountNeverExpires `
            -FullName 'Dawabag Stock Connector' -Description 'Runs the Dawabag stock connector task (reads the stock export folder, uploads over HTTPS)' | Out-Null
    }
    return New-Object System.Management.Automation.PSCredential("$env:COMPUTERNAME\$Name", $password)
}

function Test-SameAccount {
    param([Parameter(Mandatory)][string]$UserName)
    $mine = [Security.Principal.WindowsIdentity]::GetCurrent()
    try {
        $sid = (New-Object Security.Principal.NTAccount($UserName)).Translate([Security.Principal.SecurityIdentifier])
        return $sid.Value -eq $mine.User.Value
    } catch { return $UserName -ieq $mine.Name }
}

function Invoke-AsAccount {
    # Runs one connector entry script AS the task's account, in a new window, with its profile
    # loaded (so its own Credential Manager is used). The admin pastes the key in that window;
    # nothing passes through files or command lines. Returns the exit code.
    param([Parameter(Mandatory)][pscredential]$Credential, [Parameter(Mandatory)][string]$InstallRoot, [Parameter(Mandatory)][string]$Script)
    $ps = Get-WindowsPowerShellPath
    $file = Join-Path $InstallRoot $Script
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $file))
    $p = Start-Process -FilePath $ps -ArgumentList $argList -Credential $Credential -LoadUserProfile -WorkingDirectory $InstallRoot -Wait -PassThru
    return $p.ExitCode
}

function Grant-FolderRead {
    # Optional (-GrantFolderRead): lets the task's account READ the export folder. Adds one
    # read-only permission entry; never changes the files.
    param([Parameter(Mandatory)][string]$Folder, [Parameter(Mandatory)][string]$UserName)
    $acl = Get-Acl -LiteralPath $Folder
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($UserName, 'ReadAndExecute, Synchronize',
        'ContainerInherit, ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $Folder -AclObject $acl
}

function Register-ConnectorTask {
    param([Parameter(Mandatory)][pscredential]$Credential, [Parameter(Mandatory)][string]$InstallRoot, [int]$IntervalMinutes = 5)
    $ps = Get-WindowsPowerShellPath
    $run = Join-Path $InstallRoot 'Run-StockConnector.ps1'
    $action = New-ScheduledTaskAction -Execute $ps -WorkingDirectory $InstallRoot `
        -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $run)
    # Daily at 00:00, repeated every N minutes for 24 hours = all day, every day. (This form
    # works the same on Windows 10/11 and Server 2016+.)
    $trigger = New-ScheduledTaskTrigger -Daily -At '00:00'
    $trigger.Repetition = (New-ScheduledTaskTrigger -Once -At '00:00' -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 1)).Repetition
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 4)
    $plain = $Credential.GetNetworkCredential().Password
    try {
        # Logon type "Password" (= "Run whether user is logged on or not", password kept by Windows):
        # needed for the account's Credential Manager. Not elevated (RunLevel Limited).
        Register-ScheduledTask -TaskName $script:TaskName -TaskPath $script:TaskPath -Action $action -Trigger $trigger -Settings $settings `
            -User $Credential.UserName -Password $plain -RunLevel Limited -Force `
            -Description 'Uploads each new MediVision stock export to Dawabag (read-only on the export folder). See docs/stock-connector.md.' | Out-Null
    } finally { $plain = $null }
}

function Remove-AccountProfile {
    # Deletes a local account's profile (this removes its Credential Manager entries too).
    param([Parameter(Mandatory)][string]$Name)
    $u = Get-LocalUser -Name $Name -ErrorAction SilentlyContinue
    if (-not $u) { return }
    Get-CimInstance -ClassName Win32_UserProfile | Where-Object { $_.SID -eq $u.SID.Value } | Remove-CimInstance
}
