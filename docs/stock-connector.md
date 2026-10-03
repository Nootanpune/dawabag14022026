# Dawabag Stock Connector for Windows (MediVision Platinum)

A small Windows program that keeps a partner's stock on Dawabag up to date from the
partner's own billing software. MediVision Platinum Wholesale (Allied Softtech) writes
its **batch-wise stock report** to a folder about every 5 minutes. Every 5 minutes the
connector checks that folder and uploads the newest complete report to Dawabag over
HTTPS. It does not read MediVision's database, and nothing outside can connect into the
partner's network.

The program is in `tools/stock-connector/`. It needs nothing installed: it uses
Windows PowerShell 5.1, which comes with Windows 10, Windows 11 and Windows Server 2016
or later.

> All ids and keys in this guide are placeholders. Never paste a real API key into a
> document, an e-mail, a chat or a ticket.

---

## Part A - Installation guide for the owner

### What you need

| Item | Example / where it comes from |
| --- | --- |
| The Windows PC or server where MediVision writes the export | Best: the MediVision LAN server itself (for example `192.168.1.7`) |
| An administrator login on that computer | To install the scheduled task |
| The export folder | Allied Softtech sets it up. Example: `D:\MediVision\StockExport` |
| The partner id | Shown next to the key in Dawabag ("Address: ..."). Example: `00000000-0000-4000-8000-000000000000` |
| An API key | Starts with `dwbk_` (step 1) |
| Internet access to the Dawabag API | Default address `https://api.trial.dawabag.com` |

### Step 0 - Ask Allied Softtech to set up the scheduled export

Ask Allied to set MediVision to export the **"Stock Report Of Batch-wise Products"**
every ~5 minutes into one folder, as Excel (`.xlsx`) or CSV. Use the same layout as the
`report.xlsx` you already upload by hand. The report must list the **whole stock**, not
only the changes. Old `.xls` files are refused, so ask for `.xlsx` or `.csv`.

It does not matter whether MediVision overwrites one file each time or writes a new
file with the time in its name. The connector always takes the newest one.

**The connector never deletes, moves, renames or changes any file in the export
folder.** The folder belongs to MediVision / Allied. If MediVision writes a new file
every time, the files will pile up, so ask Allied to clear old ones (for example,
keep one day's files).

Until Allied has set this up, you can use **manual mode** (step 5): export the report
by hand and send it with one command.

### Step 1 - Create the API key in Dawabag

Either of these works:

* Dawabag admin: **Admin -> Partners -> (the partner) -> Automatic stock upload -> New key**
* The partner's owner login: **Partner portal -> Upload stock -> Automatic stock upload -> New key**

Name the key after the computer, for example "MediVision server". The key looks like
`dwbk_xxxxxxxxxx_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` and is **shown only once**.
Keep it on screen (or copy it) until step 3 asks for it. Note the **partner id** shown
next to it.

### Step 2 - Copy the connector to the computer

Copy the whole `tools\stock-connector` folder to the computer, for example to
`C:\Temp\stock-connector`. The installer copies the program to
`C:\Program Files\Dawabag\StockConnector`, so you can delete the temporary copy
afterwards.

### Step 3 - Install

1. Click Start, type **Windows PowerShell**, right-click it and choose **Run as administrator**.
2. Run (change the partner id and the folder to your own):

```powershell
cd C:\Temp\stock-connector
Get-ChildItem -Recurse | Unblock-File
powershell -ExecutionPolicy Bypass -File .\Install-StockConnector.ps1 `
    -PartnerId 00000000-0000-4000-8000-000000000000 `
    -ExportFolder 'D:\MediVision\StockExport'
```

The installer does six things:

1. Copies the program to `C:\Program Files\Dawabag\StockConnector`.
2. Saves the settings (address, partner id, folder, file types) in the registry under
   `HKEY_LOCAL_MACHINE\SOFTWARE\Dawabag\StockConnector`. The key is never saved there.
3. Registers "Dawabag Stock Connector" as a source in the Windows Event Log.
4. Creates a local Windows account **`DawabagConnector`**. It belongs to no group, and
   its random password is never shown to anyone.
5. Opens a **second window running as that account** and asks for the API key there.
   Paste the key and press Enter. Nothing appears while you paste; that is normal.
   The key is stored only in that account's **Windows Credential Manager**. The window
   then runs the checks (step 4) as that account and waits for Enter.
6. Registers the scheduled task **`\Dawabag\Dawabag Stock Connector`**. It runs every
   5 minutes, whether or not anyone is signed in, and starts once right away.

Optional switches:

| Switch | Use it when |
| --- | --- |
| `-TaskAccount Installer` | You want the task to run as your own admin login instead of `DawabagConnector`. You are asked for your Windows password: Task Scheduler needs it to run while nobody is signed in, and Windows keeps it, not the connector. If you change that password later, run the installer again. |
| `-TaskAccount Existing -Credential (Get-Credential)` | The task should run as another account, for example a domain account that can read a network folder. |
| `-GrantFolderRead` | The `DawabagConnector` account cannot read the export folder. This adds a **read-only** permission for that account on the folder. |
| `-ApiBaseUrl https://...` | Dawabag gives you a different API address (for example after the trial). |
| `-FilePatterns '*.xlsx'` | Only Excel files should be picked up. The default is `*.xlsx` and `*.csv`. |
| `-MinFileAgeSeconds 120` | MediVision takes long to write the file. The default is 60 seconds. |

**If the export folder is on another computer** (a `\\server\share` path), the task's
account must be able to read that share. A local `DawabagConnector` account on another
PC usually cannot. Either install on the MediVision server itself (recommended), or
use `-TaskAccount Existing` with a domain account that can read the share.

To change a setting or the key later, run the installer again with the same command.
It asks for the key again, because each install gives `DawabagConnector` a new
password, and Windows then cannot read the old stored key.

### Step 4 - Check that it works

In an administrator PowerShell window:

```powershell
cd 'C:\Program Files\Dawabag\StockConnector'
powershell -ExecutionPolicy Bypass -File .\Test-StockConnector.ps1 -PromptForKey
```

The test uploads nothing. It shows `PASS` / `WARN` / `FAIL` for each of these:

* **Settings**: the address, the partner id and the folder.
* **Scheduled task**: which account it runs as, its last run and its next run.
* **Export folder**: how many export files are there and which one is newest.
* **API key**: whether a key is stored for the account running the test.
  `-PromptForKey` lets you paste the key for this test only (it is not stored). You
  need it because the key is stored for the task's account, not for your admin login.
* **Dawabag (whoami)**: the partner name Dawabag knows the key by, and the mode
  (`MANUAL` or `LIVE`).
* **Dry run**: which file the next run would send. Nothing is sent.

You can also check **Event Viewer -> Windows Logs -> Application** and filter on
source **Dawabag Stock Connector**. The connector logs every run there. It writes no
log files.

### Step 5 - First uploads (trial, before live mode)

At first the partner is in **manual** mode on Dawabag. In manual mode the scheduled
task uploads nothing: each run only logs "Live stock feed is not switched on yet"
(event 1003).

Send one export by hand. It becomes a **draft** in the partner portal and changes no
stock:

```powershell
cd 'C:\Program Files\Dawabag\StockConnector'
powershell -ExecutionPolicy Bypass -File .\Send-StockFile.ps1 -File 'D:\MediVision\StockExport\STOCK.xlsx' -PromptForKey
```

Then open **Partner portal -> Stock import** and check:

* the columns were recognised as MediVision's layout;
* the products are matched, or link the new ones (Dawabag remembers each link);
* there are no problem lines you did not expect.

Send two or three files over a day until the drafts look right. Apply or discard them
as usual.

**Manual mode while Allied has not set up the schedule:** use the same
`Send-StockFile.ps1` command whenever you export the report by hand. Once live mode is
on, the same command sends a live snapshot instead of a draft.

### Step 6 - Switch the partner to live mode (only after step 5 looks right)

Dawabag admin: **Admin -> Partners -> (the partner) -> Stock feed -> mode: Live**.

From the next run (within 5 minutes), each new export applies by itself:

* Quantities of products that are already linked and listed are updated at once.
* Everything else waits for a person in the partner portal (**Live stock feed**):
  new products, price or MRP changes, and so on.
* A linked batch that is missing from the export is set to 0, because the software is
  the master of the stock. So the export must always be the **whole** stock.
* While live mode is on, the partner's own stock editor in the portal is switched off.
* If no new export arrives within the partner's window (default 15 minutes), Dawabag
  treats the stock as out of date and stops offering it. The connector also writes a
  warning (event 2004) when the newest export in the folder is that old.

Then check Event Viewer for event **1001** ("applied to Dawabag") every 5 minutes, and
the partner portal for "Stock last updated ...".

### Uninstall

In an administrator PowerShell window:

```powershell
cd 'C:\Program Files\Dawabag\StockConnector'
powershell -ExecutionPolicy Bypass -File .\Uninstall-StockConnector.ps1
```

The uninstaller removes:

* the scheduled task;
* the settings in the registry;
* the `DawabagConnector` account with its profile, which deletes the stored key;
* the program folder.

The **export folder and its files are not touched**. Use `-KeepServiceAccount` to keep
the account, and `-RemoveEventSource` to also remove the event-log source (old events
then show less detail).

After uninstalling, also:

1. **revoke the key** in Dawabag (Automatic stock upload -> Revoke);
2. ask Dawabag's admin to switch the partner back to **manual** mode, unless another
   uploader takes over. Otherwise the stock goes stale after 15 minutes.

If the task ran as another existing account, the uninstaller tells you how to remove
the key from that account: sign in as it and run
`cmdkey /delete:"Dawabag Stock Connector"`.

### Troubleshooting

| What you see | Event | What to do |
| --- | --- | --- |
| "Live stock feed is not switched on yet ... nothing uploaded" | 1003 | Normal before step 6. Send trial files with `Send-StockFile.ps1`, then ask the admin to switch live mode on. |
| "No export newer than the one Dawabag already has" | 1002 | Normal between MediVision exports. |
| "Check MediVision's scheduled stock export: the newest export ... was written N minutes ago" | 2004 | MediVision's scheduled export has stopped. Check MediVision / ask Allied. Is the export folder the right one? |
| "A newer export is not complete yet" | 2005 | MediVision is still writing the file, or holds it open. It is sent on the next run. If this repeats for one file, raise `-MinFileAgeSeconds`. |
| "No Dawabag API key is stored ... for the account" | 3002 | Run the installer again (it asks for the key as the task's account). |
| "the key was refused" / "did not accept the key" (401/403) | 3003 | The key was revoked or mistyped, or belongs to another partner, or the partner account is not active. Make a new key (step 1) and run the installer again. |
| "Dawabag already has a newer snapshot, so this one was skipped" (409) | 2003 | Harmless once. If it repeats, check the computer's clock (Settings -> Time -> Sync now). |
| "refused, fix the export or the setup" (422) | 3004 | Read the server message. "Columns of this file are not known": upload one file in the partner portal and confirm the columns. "in the future": fix the PC clock. "file type": export `.xlsx` or `.csv`, not `.xls`. |
| "not sent after 3 attempt(s): RateLimited / ServerError / NetworkError" | 2002 | Internet or Dawabag had a problem. The next run tries again by itself. If it continues, check the internet connection, the proxy and the firewall (outbound HTTPS 443 to the API address). |
| "The export folder ... does not exist or this Windows account cannot open it" | 3005 | Wrong folder, or the task's account has no read access. Run the installer again with `-GrantFolderRead`, or use an account that can read the share. |
| "The connector is not set up on this PC" | 3001 | Settings are missing in the registry. Run the installer. |
| The task shows "Last Run Result" `0x1` | - | A problem was logged. Check the Event Viewer entry at that time. |
| The task never runs: "logon failure" or "not granted the requested logon type" | - | The account needs the "Log on as a batch job" right. Task Scheduler normally grants it, but a domain policy may block it: ask IT, or use `-TaskAccount Installer`. If you changed the password of the task's account, run the installer again. |
| The installer's second window does not open ("The directory name is invalid", or an access error) | - | Run the installer from a local folder (not a network drive), or use `-TaskAccount Installer`. |
| PowerShell says "running scripts is disabled on this system" | - | Use `powershell -ExecutionPolicy Bypass -File ...` as shown, and `Unblock-File` the copied folder. |

### Event IDs (Application log, source "Dawabag Stock Connector")

| ID | Level | Meaning |
| --- | --- | --- |
| 1001 | Information | File uploaded. The message has the file name, size, export time, result (applied / unchanged / replay / draft) and Dawabag's counts. |
| 1002 | Information | Nothing new to send |
| 1003 | Information | Live mode is off for the partner, so nothing was uploaded |
| 1010 / 1011 / 1012 | Information | Installed / key stored / uninstalled |
| 2001 | Warning | Temporary problem; trying again within this run |
| 2002 | Warning | Gave up for this run; the next run tries again |
| 2003 | Warning | Export older than the snapshot Dawabag already has (skipped) |
| 2004 | Warning | The newest export in the folder is older than the stale window |
| 2005 | Information | The newest export is not complete yet |
| 3001-3005, 3009 | Error | Settings, key, key refused, file refused, folder, unexpected |

---

## Part B - Technical notes

### Files

```
tools/stock-connector/
  Install-StockConnector.ps1     entry: install / re-install (admin)
  Uninstall-StockConnector.ps1   entry: remove (admin)
  Run-StockConnector.ps1         entry: what the scheduled task runs (one run, exit 0/1)
  Test-StockConnector.ps1        entry: checks + dry run, no upload
  Send-StockFile.ps1             entry: manual mode, one file
  Set-StockConnectorKey.ps1      entry: store the key as the CURRENT account, then test
  DawabagStockConnector/         PowerShell module (one responsibility per file)
    Private/Constants.ps1  Logging.ps1  Config.ps1  Secret.ps1  Time.ps1
            ExportFinder.ps1  Http.ps1  Api.ps1  Install.ps1
    Public/Invoke-DawabagStockSync.ps1  Send-DawabagStock.ps1  Test-DawabagConnector.ps1
           Set-DawabagConnectorKey.ps1  Install-DawabagConnector.ps1
  tests/DawabagStockConnector.Tests.ps1   Pester 5 (HTTP, registry, vault mocked)
```

All files are plain ASCII, because Windows PowerShell 5.1 reads a script without a
byte-order mark in the ANSI code page. No PowerShell 7-only syntax is used.

### Each run (stateless)

The standing rule is that the server is the single source of truth. The connector
keeps no "sent" list, no database and no files. Each run:

1. Reads the settings from `HKLM\SOFTWARE\Dawabag\StockConnector` and the key from
   Credential Manager.
2. `GET /api/v1/partner-feed/<partner id>/whoami` returns `stock_feed.mode`,
   `last_taken_at` and `stale_after_minutes`.
3. If the mode is not `live`, it logs event 1003 and stops. Uploading would only create
   another draft every 5 minutes.
4. It lists `ExportFolder` (not sub-folders) for `FilePatterns`. It keeps
   `.xlsx/.csv/.txt/.tsv`, skips `~$` owner files, and sorts newest first. It keeps
   files whose modified time, in whole seconds UTC, is **later** than `last_taken_at`.
5. It takes the newest file that is complete:
   * not empty and at most 5 MB;
   * at least `MinFileAgeSeconds` old;
   * the same size and modified time after a `StableSeconds` wait;
   * openable with `FileShare.Read`, which means no writer has it open.

   If the newest file is not complete yet, it tries the next newer-than-server file.
   Order is still kept, because the server orders snapshots by export time.
6. It reads the file into memory (read-only) and sends
   `POST .../stock-snapshot` as multipart, with field `file` and header
   `X-Snapshot-Taken-At` = the file's modified time as `yyyy-MM-ddTHH:mm:ss+05:30`.
   The time is converted to IST explicitly, so the PC's time-zone setting does not
   matter.
7. It reads the answer:

   | Answer | What the connector does |
   | --- | --- |
   | `applied`, `unchanged`, `replay` | Success |
   | 409 out of order | Logged; the file is skipped |
   | 409 live mode off | Logged; the run stops |
   | 401 / 403 | Error |
   | 422 / 413 | Error; the same file is not resent |
   | 429 / 5xx / no answer | Retried within the run with backoff (below) |

Retries use 10 s, then 30 s (then 60 s), with ±20% jitter, or the server's
`Retry-After`. There are at most `MaxAttempts` (3) per request, inside a run budget of
200 s, so a run never overlaps the next one. The task also has `MultipleInstances
IgnoreNew` and a 4-minute limit. A retry resends the **same bytes with the same
header**, so the server answers `replay`; it is idempotent by SHA-256. Anything left
over is done by the next run, which asks `whoami` again.

`Send-DawabagStock` (manual mode) follows the same path. When the partner is not live,
it posts to `/stock-files`, which creates a draft for review. When the partner is live,
it posts to `/stock-snapshot`.

The connector does not send `X-Snapshot-Sequence`. The export time orders the files, as
the API recommends for file uploads. Keep to that style.

### Secrets and accounts

* The key is typed once with `Read-Host -AsSecureString` and checked against the
  server's shape (`dwbk_<10 lower-case letters/digits>_<43 chars>`). It is then stored
  with `CredWrite` as a **generic credential**: target `Dawabag Stock Connector`,
  persistence *local machine*, user name = the key's public prefix. The key is never
  in a file, the registry, a task argument, the screen or a log. Every log line also
  passes through a filter that hides anything shaped like a key or a bearer token
  (C-44, C-46).
* Credential Manager belongs to one Windows account, so the key must be stored **as the
  task's account**. When that account is not the installer's, the installer starts
  `Set-StockConnectorKey.ps1` as that account with `Start-Process -Credential
  -LoadUserProfile`. The key is pasted into that window, so it never passes through a
  command line or a file.
* The task uses the **Password** logon type ("Run whether user is logged on or not",
  password kept by Windows). An S4U task ("do not store password") cannot decrypt the
  account's credentials. RunLevel is *Limited* (not elevated).
* The dedicated account `DawabagConnector` belongs to no group and has a 32-character
  random password that is never shown. An administrator's password reset makes the
  account's earlier vault entries unreadable, so every install stores the key again.
* Uninstall deletes the dedicated account's profile, which deletes its vault.
* The key travels only in `Authorization: Bearer`, over **TLS 1.2+**:
  `ServicePointManager` and `HttpClientHandler.SslProtocols` are pinned. Redirects are
  not followed. The API address must be `https://`; plain `http` is allowed only to
  `localhost` for testing.

### Settings: registry, not task arguments

The settings are in `HKLM\SOFTWARE\Dawabag\StockConnector`:

| Value | Type | Content |
| --- | --- | --- |
| `ApiBaseUrl`, `PartnerId`, `ExportFolder` | `REG_SZ` | |
| `FilePatterns` | `REG_MULTI_SZ` | |
| `MinFileAgeSeconds`, `StableSeconds`, `RequestTimeoutSeconds`, `MaxAttempts`, `RunBudgetSeconds` | `REG_DWORD` | |
| `ConnectorVersion` | `REG_SZ` | |

The registry was chosen over task arguments for three reasons:

* the manual commands (`Test`, `Send`) read the same settings as the task;
* only administrators can change them, while the low-privilege account can only read
  them;
* the task's command line stays fixed.

These are operating-system settings, not business data. Nothing the connector learns
at run time is written anywhere.

### What was verified, and what was not

* **Syntax.** Every script was parsed with PowerShell 7.6's parser on Linux. A check
  confirmed that no PowerShell 7-only syntax is used (`?:`, `??`, `?.`, `&&`/`||`) and
  that the files are ASCII only. This is not the same as running on Windows PowerShell
  5.1, which **has not been tested**.
* **Run logic on Linux.** The run logic was exercised under PowerShell 7.6 on Linux
  against a local mock of the partner feed API, which used the backend's own
  `multer` / `express`:
  * multipart field `file`, file name, content type;
  * the `X-Snapshot-Taken-At` IST value;
  * the bearer key only in the header;
  * not-live = no upload;
  * applied, then nothing new, then unchanged;
  * 503 retried, then success;
  * persistent 503 bounded to 3 attempts;
  * 409 out of order;
  * 401;
  * missing key;
  * network down;
  * manual send = draft to `/stock-files`;
  * `.xls` refused;
  * Test = no POST;
  * export files unchanged afterwards (hashes).

  The C# Credential Manager code compiled with `Add-Type`.
* **Not run.**
  * The Pester tests in `tests/` (Pester was not available here).
  * Anything Windows-only: Credential Manager calls, Event Log, Scheduled Task, local
    account, registry, `Start-Process -Credential`, .NET Framework's `HttpClient`.

  Before relying on it, run the Pester tests on a Windows PC
  (`Invoke-Pester .\tools\stock-connector\tests`), then follow Part A on a test
  machine.
