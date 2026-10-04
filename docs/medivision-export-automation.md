# Exporting MediVision's stock report automatically (Power Automate Desktop)

For the owner and Nootan's staff. Plain English. Sprint 49.

Allied Softtech will not set up a scheduled export or an API for Dawabag (4 October 2026).
This guide shows how Nootan can do it **itself**, with a free Microsoft tool, so that the
batch-wise stock report lands in a fixed folder every 15–30 minutes during shop hours. The
**Dawabag Stock Connector** that is already installed (`docs/stock-connector.md`) then
uploads each new report to Dawabag.

```
MediVision Platinum ──(Power Automate Desktop clicks "export", as a person would)──▶
   C:\DawabagExport\out\STOCK.xlsx ──(Stock Connector, every 5 minutes)──▶ Dawabag
```

> **The exact MediVision menu steps are not known yet.** Every place where you must record
> your own clicks is marked **▶ RECORD YOUR OWN CLICKS HERE**. Fill in the worksheet at the
> end of this guide while you build the flow, and keep it with the PC.

---

## 1. What this does — and what it never does

Power Automate Desktop (PAD) repeats, on the screen, the clicks a staff member already makes
to export the stock report. It is the same as a person sitting at the PC and pressing the
same buttons every 15 minutes.

It **only automates Nootan's own normal use of its own licensed copy of MediVision**:

* It **never** reads or writes MediVision's database, files or settings. It only uses the
  menus on the screen, signed in as an ordinary Nootan user.
* It **never** bypasses a login, a licence check, a password, a lock screen or any other
  protection. If MediVision asks for a password, shows a licence message or is not signed in,
  the flow **stops** and a person deals with it (section 6).
* It **never writes anything into MediVision** — no sales, purchases, stock changes or
  settings. It only opens the stock report and exports it, as staff do by hand today.
* It does not need Allied Softtech, and it does not change MediVision's installation.

The export file stays on Nootan's PC until the Stock Connector reads it and sends it to
Dawabag over HTTPS. Dawabag's server is the record of what is offered online; the file is
only the hand-over from MediVision to the connector.

---

## 2. What you need

| Item | Notes |
| --- | --- |
| A Windows 10 or 11 PC where MediVision runs and staff can sign in | Best: the PC at the counter or the MediVision server, whichever is on all day during shop hours |
| **Power Automate Desktop** (free) | Windows 11: already installed (Start → "Power Automate"). Windows 10: install "Power Automate" from the Microsoft Store or Microsoft's website. Sign in with any Microsoft account (a free one is enough). |
| A Windows login that stays signed in and unlocked during shop hours | The free version of PAD runs flows only on a signed-in, **unlocked** desktop ("attended" runs). See section 7. |
| The Stock Connector, installed and tested | `docs/stock-connector.md`, Part A. Its export folder will be `C:\DawabagExport\out` |
| About one hour, once | To record and test the flow |

PAD's paid plan ("unattended" runs on a locked PC, cloud schedules) is **not** needed.

---

## 3. Folders and the file name

Create two folders on the PC (any local drive is fine):

| Folder | Used for |
| --- | --- |
| `C:\DawabagExport\staging` | MediVision saves the report here first |
| `C:\DawabagExport\out` | The finished report is moved here. **This is the Stock Connector's export folder.** |

**Use one fixed file name, overwritten each time: `STOCK.xlsx`** (or `STOCK.csv` if
MediVision exports CSV). This is what the connector prefers:

* The connector picks the newest **complete** file in the export folder whose modified time
  is later than the last snapshot Dawabag already has. A file rewritten in place gets a new
  modified time, so every new export is sent once — no list of sent files is kept anywhere.
* The connector **never deletes, moves or renames** anything in the export folder. With a
  fixed name there is always exactly one file, so nothing piles up.
* Connector version 1.1.0 (Sprint 49) also checks the file again just before reading it:
  if the flow overwrote `STOCK.xlsx` in the moment between the connector's checks and its
  read, it sends nothing that run (Event Viewer, event 2005 "rewritten after it was
  checked") and sends the new file on the next run.

**Time-stamped names** (`STOCK-2026-10-04-1015.xlsx`) also work — the connector always takes
the newest — but then the folder fills up, and the flow must also delete files older than one
day from `out` (PAD: "Get files in folder" + "Delete file(s)"). Prefer the fixed name.

**Why "staging" then "move"?** MediVision may take several seconds to write the file. If
it wrote straight into `out`, the connector could meet a half-written file. The connector
already waits until a file is at least 60 seconds old, unchanged for a few seconds and not
open in another program, but moving a *finished* file into `out` in one step is the most
robust: the connector never sees a half-written report. Moving a file keeps its modified
time (the time MediVision finished writing it), which is the export time Dawabag records.

Keep the report the same as the one you upload by hand today: **"Stock Report Of
Batch-wise Products", the whole stock (all items, not only changes)**, as `.xlsx` or `.csv`
(old `.xls` is refused). Dawabag treats a linked batch that is missing from a snapshot as 0.

---

## 4. Build the flow

Open Power Automate → **+ New flow** → name it `Dawabag stock export`. In the flow designer,
add the actions below in this order. PAD's **recorder** (the "Record" button) can capture
your clicks for steps 3–5; then tidy them up as described in section 5.

### Step 1 — Make sure MediVision is open and in front

* Action **"Run application"** only if MediVision is not running (use **"If process is
  running"** → `MediVision…exe` ▶ RECORD the process name shown in Task Manager).
* Action **"Wait for window"** — window title contains `MediVision` ▶ RECORD the exact
  window title. Timeout 60 s; on timeout → go to the error handler (step 9).
* Action **"Focus window"** and **"Set window state: Maximized"** (fixed size = clicks land
  in the same place every time).

### Step 2 — Check that MediVision is signed in and on its main screen

* Action **"If window contains UI element"** — look for something only the main screen shows
  (the main menu bar or a menu item such as "Reports") ▶ RECORD which element you chose.
* If instead the **login window** is showing, or any message asks for a password or licence:
  **stop** (step 9). Do **not** store a MediVision password in the flow and do not try to
  sign in automatically — a person signs in.
* If a pop-up is open (reminder, "update available", backup message): stop and let a person
  close it the first few times; once you know the pop-up well, you may add a step that
  presses its **Close / Cancel** button — never "Install", "Update" or "Yes" to anything.

### Step 3 — Open the stock report

▶ **RECORD YOUR OWN CLICKS HERE.** Example of what to write down (yours will differ):

| # | Click / key | Window it happens in | Wait for (before the next click) |
| --- | --- | --- | --- |
| 3.1 | Menu **Reports** (or Alt+R) | MediVision main window | The Reports menu is open |
| 3.2 | **Stock** → **Stock Report Of Batch-wise Products** | MediVision main window | The report options window |
| 3.3 | … | … | … |

After the last click, add **"Wait for window"** for the report options window (timeout 60 s).

### Step 4 — Choose the options for the whole stock

▶ **RECORD YOUR OWN CLICKS HERE.** Typical options to check every time (do not trust that
MediVision remembers them): all companies, all items, **batch-wise**, include zero stock or
not as you do by hand today, **no date filter that leaves items out**. Press the button that
shows the report, then **"Wait for window"** for the report itself (it can take a minute on
a big stock — use a timeout of 180 s).

### Step 5 — Export to Excel / CSV into the staging folder

▶ **RECORD YOUR OWN CLICKS HERE**: the Export / Excel button and the **Save As** dialog.

* In the Save As dialog, use **"Populate text field in window"** to type the full path
  `C:\DawabagExport\staging\STOCK.xlsx` into the file-name box (more reliable than clicking
  through folders).
* If Windows asks **"STOCK.xlsx already exists. Do you want to replace it?"** — answer
  **Yes** (this only replaces the old export in the staging folder).
* If MediVision opens the file in Excel after exporting: add **"Close window"** for Excel
  (do not save anything in Excel). An Excel window holding the file open stops the move in
  step 7.

### Step 6 — Wait until the file is complete

* Action **"Wait for file"** — `C:\DawabagExport\staging\STOCK.xlsx` is **created**
  (timeout 180 s). Note: when the file already exists, also check its modified time is newer
  than when this run started (**"Get files in folder"** → *Last modified* later than the run's
  start time, saved at step 1 with **"Get current date and time"**).
* Action **"Wait"** 10 seconds, then check the file size is not 0 and did not change during
  those 10 seconds (**"Get file path part"/"Get files in folder"** → size). If it is still
  changing, wait again (at most 3 times), else go to step 9.

### Step 7 — Move the finished file into the connector's folder

* Action **"Move file(s)"** — from `C:\DawabagExport\staging\STOCK.xlsx` to
  `C:\DawabagExport\out`, **If file exists: Overwrite**.
* Add **"On error" → Retry 3 times, 10 seconds apart**: the connector holds the old file open
  for a fraction of a second while it reads it; a retry clears that.

### Step 8 — Close the report and return to MediVision's main screen

▶ **RECORD YOUR OWN CLICKS HERE** (usually the report window's **Close** button or Esc).
Leave MediVision as staff expect to find it. The flow must not leave windows open that block
a staff member who is billing.

### Step 9 — Error handler (for every step above)

In each action's **"On error"** settings (or one **"On block error"** around steps 1–8):

1. Close any Save As / report window the flow opened (Esc / Cancel — never "Yes" to a
   question you did not record).
2. **"Display message"** on screen for the staff (e.g. "Dawabag stock export did not run —
   please check MediVision and tell the owner"), with a timeout of 60 s so the flow ends, and,
   if you like, **"Send email"** to the owner through an account you already use.
3. **Stop flow** (ending with an error). PAD keeps the run in its run history.

Do not save screenshots of MediVision's screens to the disk as a "log": they contain business
data. PAD's own run history is enough.

### Step 10 — Make the flow polite to staff

Staff may be billing on the same PC. Keep the whole run short (target under 2 minutes),
schedule it at quiet minutes (for example :07, :22, :37, :52), and tell staff that the
screen will move by itself for a minute every 15 minutes. If the PC is used for billing all
day, a second Windows PC signed in to MediVision with its own user just for the export is
better.

---

## 5. Recording advice that keeps the flow working

* **Prefer UI elements to screen positions.** PAD's recorder captures UI elements (buttons,
  menu items, text boxes). Avoid "click at x, y" and image matching; they break when the
  window size, screen resolution, Windows scaling or a theme changes.
* **Keyboard shortcuts are often the most robust** (Alt+letter for menus, Tab to fields,
  Enter). Use **"Send keys"** only to a window you have just focused.
* **Always "Wait for window" / "Wait for UI element" after a click** that opens something,
  with a timeout and an error path. Never use fixed "Wait 5 seconds" alone: MediVision can be
  slower when it is busy.
* **Remove recorded details that change**: dates in window titles, record counts, the current
  user's name. Edit the selector so it matches only the stable part (e.g. title *contains*
  "Batch-wise").
* **Fix the window size**: maximise MediVision in step 1; keep the PC's screen resolution
  and scaling unchanged.
* **Run it by hand 10 times** (Run button in the designer) at different times of the day —
  including while MediVision is busy — before scheduling it.
* **After every MediVision update**, run the flow by hand once and watch it. Updates can move
  menus or rename windows; then re-record the affected step and update the worksheet.

---

## 6. When MediVision is not as the flow expects

| Situation | What the flow does | What a person does |
| --- | --- | --- |
| MediVision not open | Step 1 opens it, then step 2 sees the login window and stops | Sign in to MediVision; the next run works |
| Signed out / session timed out / login window | Stops (never types a password) | Sign in again |
| "Update available" / update in progress / licence or registration message | Stops | Deal with the message as you normally would (or call Allied for MediVision itself); run the flow once by hand afterwards |
| A staff member is in the middle of a bill on the same PC | Avoid: schedule at quiet minutes, or use a separate PC | — |
| Windows lock screen / screensaver with password | The free PAD cannot run on a locked screen; the run fails | Unlock; see section 7 for settings |
| Excel opened the file and holds it | Step 5 closes Excel; else the move fails and retries | Close Excel |
| Report takes very long (large stock) | Step 4 waits up to 180 s, then stops | Raise the timeout if this happens often |

---

## 7. Windows settings for shop hours

The free PAD runs only on a **signed-in, unlocked** desktop. On the export PC, during shop
hours:

* **Settings → System → Power (& battery) → Screen and sleep**: "When plugged in, put my
  device to sleep after" → **Never**; turn off the screen after a while is fine **only if the
  screen-off does not lock the PC** (next point).
* **Settings → Accounts → Sign-in options → "If you've been away, when should Windows require
  you to sign in again?"** → **Never**, and screensaver "On resume, display logon screen" →
  off — only on a PC that is in a staffed, safe place (the shop counter during shop hours).
  Lock it by hand (Windows key + L) when the shop closes, or leave the shop's normal closing
  routine as it is: the flow is not needed after hours.
* **Settings → Windows Update → Advanced options → Active hours**: set to the shop hours, so
  Windows does not restart in the middle of the day.
* Keep the PC on mains power; if it is a laptop, keep the lid open and "Lid close action:
  Do nothing" when plugged in.

---

## 8. Running it every 15–30 minutes during shop hours

The free PAD has no built-in schedule (cloud schedules need the paid plan). Use **Windows
Task Scheduler** to start the flow:

1. In Power Automate, open the flow's **⋮ → Properties** and copy the **"Run URL"**
   (`ms-powerautomate:/console/flow/run?…workflowId=…`). Recent versions of PAD show it
   there; if yours does not, update PAD.
2. Start **Task Scheduler** → **Create Task** (not "Basic Task"):
   * **General**: name `Dawabag stock export`; **"Run only when user is logged on"** (the
     flow needs the visible desktop); run as the Windows user that is signed in at the
     counter.
   * **Triggers**: **Daily** at the shop's opening time (e.g. 09:07); **Repeat task every 15
     minutes** (or 30) **for a duration of** the shop's open hours (e.g. 12 hours).
     Add a trigger per day pattern if Sunday hours differ.
   * **Actions**: Start a program:
     `"C:\Program Files (x86)\Power Automate Desktop\PAD.Console.Host.exe"` with the argument
     `"<the Run URL you copied>"` (check the path on your PC; it may be under
     `C:\Program Files\…`).
   * **Settings**: "If the task is already running" → **Do not start a new instance**;
     "Stop the task if it runs longer than" → **10 minutes**.
3. The first time, PAD may ask to allow a flow started from outside — allow it for this flow
   only. Then right-click the task → **Run**, and watch one full run.

*Alternative:* one flow started at opening time that loops ("Loop condition" until the
closing time, with "Wait 15 minutes" at the end of each pass). It is simpler but stops for
the day if one pass fails badly; Task Scheduler starts a fresh run every time, so prefer it.

**Shop hours only — what Dawabag does at night:** when no new export arrives within the
partner's window, Dawabag treats the stock as out of date (Sprint 37) and, by default,
**stops offering Nootan's stock** until the next snapshot arrives (or offers only the part
above the safety margin, if the admin chose "margin"). The first export of the morning brings
it back. This is the safe behaviour; if the owner wants night-time orders, keep the flow
running longer or choose the "margin" setting.

---

## 9. Set Dawabag's "out of date" window to match

The partner's **stale window** (Admin → Partners → Nootan → Stock feed → **"Stale after (minutes without a
snapshot)"**; default **15 minutes**) must be **longer than the export interval plus the
connector's delay**:

| Export every | Connector delay (5-minute run + 60 s minimum file age) | Set the stale window to at least |
| --- | --- | --- |
| 15 minutes | up to ~6 minutes | **30 minutes** |
| 30 minutes | up to ~6 minutes | **45 minutes** |

With the default 15 minutes and a 15–30 minute export, Nootan's stock would be hidden
between exports. Dawabag counts the window from the **export time** (the file's modified
time), and an export identical to the last one still counts as fresh ("unchanged").

---

## 10. Check that it works

1. Let the flow run once (Task Scheduler → Run). `C:\DawabagExport\out\STOCK.xlsx` should
   have a modified time of a minute ago.
2. On the same PC, in an administrator PowerShell window:

   ```powershell
   cd 'C:\Program Files\Dawabag\StockConnector'
   powershell -ExecutionPolicy Bypass -File .\Test-StockConnector.ps1 -PromptForKey
   ```

   Check: **Export folder** = `C:\DawabagExport\out`, newest file `STOCK.xlsx` with the
   right time; **Dry run** names `STOCK.xlsx` (or says Dawabag already has it). The test
   uploads nothing.
3. Event Viewer → Windows Logs → Application, source **Dawabag Stock Connector**: within
   5 minutes, event **1001** ("applied to Dawabag") — or 1003 while the partner is still in
   manual mode (then send trial files first, `docs/stock-connector.md` step 5).
4. Dawabag: Partner portal → "Stock last updated …", and Admin → Live stock feeds.
5. Leave it for a day. Every 15–30 minutes there should be a new 1001 (or 1002 "nothing
   new" between exports). Event **2004** means the newest export is older than the stale
   window — the flow has stopped.

Admin → **Launch readiness** (item 4.8) shows how many partners are on the live feed and when
the newest snapshot arrived.

---

## 11. If the export fails

* Dawabag notices by itself: after the stale window without a new snapshot, Nootan's stock
  is **not offered** (or only the margin), the admins and Nootan's owner login get **one**
  alert ("stock feed stale"), and the connector logs event **2004**. No wrong stock is sold
  because of a missing export; buyers simply cannot order Nootan's items until it is back.
* Look at **Power Automate → Runs** (what failed and where) and at MediVision's screen.
  Fix the cause (sign in, close the message, re-record a step after an update).
* **Meanwhile, by hand:** export the report from MediVision as usual and save it as
  `C:\DawabagExport\out\STOCK.xlsx` (replace the old one) — the connector sends it within
  5 minutes. Or send any file directly with `Send-StockFile.ps1` (`docs/stock-connector.md`).
* If the flow cannot be repaired the same day, ask Dawabag's admin to switch the partner back
  to **manual** mode and use the partner portal's stock import until it is fixed.

---

## 12. Worksheet — record your own clicks (keep a copy with the PC)

| Item | What you recorded |
| --- | --- |
| MediVision version (Help → About) | |
| Process name (Task Manager) | |
| Main window title (stable part) | |
| UI element that proves "signed in, main screen" | |
| Step 3 — clicks to open "Stock Report Of Batch-wise Products" | 3.1 … 3.2 … 3.3 … |
| Step 4 — options set every time | |
| Step 5 — export button, Save As handling | |
| Step 8 — how the report window is closed | |
| Export format (.xlsx / .csv) and file name | `STOCK.xlsx` |
| Staging and export folders | `C:\DawabagExport\staging`, `C:\DawabagExport\out` |
| Task Scheduler: start time, repeat, duration | |
| Dawabag stale window agreed with the admin | minutes |
| Date tested; tested by | |
| Re-tested after MediVision update on | |
