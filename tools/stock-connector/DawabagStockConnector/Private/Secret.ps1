# Secret.ps1 - the Dawabag API key, kept ONLY in Windows Credential Manager as a
# generic credential of the Windows account that runs the connector (CredWrite /
# CredRead through P/Invoke; protected by Windows with that account's DPAPI keys).
# Never in a file, the registry, a task argument, a log or the screen (C-44).
#
# Credential Manager is per Windows account: the scheduled task reads the vault of
# the account it runs as. The installer therefore stores the key while running AS
# that account (Install.ps1). The task must use the "Password" logon type ("Run
# whether user is logged on or not" with a stored password): an S4U task cannot
# open the account's protected credentials.

$script:CredManSource = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace Dawabag
{
    public static class CredMan
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct CREDENTIAL
        {
            public uint Flags;
            public uint Type;
            public string TargetName;
            public string Comment;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
            public uint CredentialBlobSize;
            public IntPtr CredentialBlob;
            public uint Persist;
            public uint AttributeCount;
            public IntPtr Attributes;
            public string TargetAlias;
            public string UserName;
        }

        [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredWrite(ref CREDENTIAL credential, uint flags);

        [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);

        [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CredDelete(string target, uint type, uint flags);

        [DllImport("advapi32.dll", SetLastError = false)]
        private static extern void CredFree(IntPtr buffer);

        private const uint CRED_TYPE_GENERIC = 1;
        private const uint CRED_PERSIST_LOCAL_MACHINE = 2;   // this PC only, survives sign-out, does not roam
        private const int ERROR_NOT_FOUND = 1168;

        public static void Write(string target, string userName, string secret)
        {
            byte[] blob = Encoding.Unicode.GetBytes(secret);
            IntPtr p = Marshal.AllocHGlobal(blob.Length);
            try
            {
                Marshal.Copy(blob, 0, p, blob.Length);
                CREDENTIAL c = new CREDENTIAL();
                c.Type = CRED_TYPE_GENERIC;
                c.TargetName = target;
                c.UserName = userName;
                c.Comment = "Dawabag partner stock feed API key";
                c.CredentialBlobSize = (uint)blob.Length;
                c.CredentialBlob = p;
                c.Persist = CRED_PERSIST_LOCAL_MACHINE;
                if (!CredWrite(ref c, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
            }
            finally
            {
                for (int i = 0; i < blob.Length; i++) { Marshal.WriteByte(p, i, 0); blob[i] = 0; }
                Marshal.FreeHGlobal(p);
            }
        }

        /// <summary>Returns null when there is no such credential.</summary>
        public static string Read(string target)
        {
            IntPtr p;
            if (!CredRead(target, CRED_TYPE_GENERIC, 0, out p))
            {
                int err = Marshal.GetLastWin32Error();
                if (err == ERROR_NOT_FOUND) return null;
                throw new Win32Exception(err);
            }
            try
            {
                CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
                if (c.CredentialBlob == IntPtr.Zero || c.CredentialBlobSize == 0) return null;
                return Marshal.PtrToStringUni(c.CredentialBlob, (int)c.CredentialBlobSize / 2);
            }
            finally { CredFree(p); }
        }

        public static bool Delete(string target)
        {
            if (CredDelete(target, CRED_TYPE_GENERIC, 0)) return true;
            int err = Marshal.GetLastWin32Error();
            if (err == ERROR_NOT_FOUND) return false;
            throw new Win32Exception(err);
        }
    }
}
'@

function Initialize-CredMan {
    if (-not ('Dawabag.CredMan' -as [type])) {
        Add-Type -TypeDefinition $script:CredManSource -Language CSharp
    }
}

function ConvertFrom-SecureKey {
    # SecureString -> plain text, only for the moment it is needed (validation, the HTTP header).
    param([Parameter(Mandatory)][System.Security.SecureString]$Secure)
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Test-ApiKeyFormat {
    param([AllowNull()][string]$Key)
    return ($null -ne $Key) -and ($Key -cmatch $script:ApiKeyPattern)
}

function Get-ApiKeyPrefix {
    # "dwbk_ab12cd34ef" - how Dawabag names a key on screens and in its audit log (never the secret).
    param([Parameter(Mandatory)][string]$Key)
    $parts = $Key.Split('_')
    if ($parts.Count -ge 2) { return "$($parts[0])_$($parts[1])" }
    return '(unknown)'
}

function Set-ConnectorSecret {
    # Stores the key in Credential Manager for the CURRENT Windows account.
    [CmdletBinding()]
    param([Parameter(Mandatory)][System.Security.SecureString]$Key)
    $plain = (ConvertFrom-SecureKey $Key).Trim()
    try {
        if (-not (Test-ApiKeyFormat $plain)) {
            throw 'That does not look like a Dawabag API key (it starts with dwbk_ followed by 10 letters/digits, an underscore and 43 characters). Nothing was stored.'
        }
        Initialize-CredMan
        [Dawabag.CredMan]::Write($script:CredentialTarget, (Get-ApiKeyPrefix $plain), $plain)
        return (Get-ApiKeyPrefix $plain)
    } finally { $plain = $null }
}

function Get-ConnectorSecret {
    # Returns the key as plain text (for the Authorization header), or $null when none is stored.
    Initialize-CredMan
    return [Dawabag.CredMan]::Read($script:CredentialTarget)
}

function Test-ConnectorSecret {
    try { return [bool](Get-ConnectorSecret) } catch { return $false }
}

function Remove-ConnectorSecret {
    Initialize-CredMan
    return [Dawabag.CredMan]::Delete($script:CredentialTarget)
}

function Get-CurrentAccountName {
    if (Test-IsWindowsHost) { return [Security.Principal.WindowsIdentity]::GetCurrent().Name }
    return [Environment]::UserName
}
