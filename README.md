# Aspen Front Desk Tasks

Task tracker for the Aspen Aesthetics + Wellness front desk team. Styled to match the Aspen Inventory Management System.

- **Front end:** this repo, served by GitHub Pages at `https://aspen-elevated.github.io/front-desk-tasks/`
- **Data:** a Google Sheet in the **info@aspen-elevated.com** Drive, reached through an Apps Script web app (`apps-script/Code.gs`)
- **Sign-in:** each person picks their name and enters a personal 4–6 digit PIN. PINs are stored hashed, never in plain text. Sessions last 30 days per device; use **Switch user** on the shared front desk computer.

Until `config.js` has an API URL, the site runs in **demo mode** (sample data, kept only in that browser, every PIN is `1234`).

---

## Features

| | |
|---|---|
| **Dashboard** | Open / overdue / due today / unassigned / done-this-week counts. Tasks grouped Overdue → Due today → Next 7 days → Later → No due date. Filter by status or person, search, tap the box to mark done. |
| **Tasks** | Title, details, assignee, due date, status (Open, In progress, Waiting, Done). |
| **Comments + history** | Every task keeps a comment thread and a log of who changed what. |
| **My Tasks** | Just what's assigned to the signed-in person. |
| **Recurring** | Daily, weekdays, weekly (pick days), or monthly (pick a date). A fresh task is created each scheduled morning at about 5 AM. Managers set these up. |
| **History** | Team-wide log of the latest 200 changes. |
| **Team** | Open / overdue / done counts per person. |

**Roles:** *manager* (Scott, Misha, Valen by default) can delete any task and manage recurring tasks. *staff* can add, edit, comment on and complete tasks, and delete tasks they created.

---

## One-time setup (about 15 minutes)

Do steps 1–3 while signed in to Google as **info@aspen-elevated.com**, so the Sheet and script belong to the shared account rather than a person.

### 1. Create the Sheet and add the script
1. In Google Drive, create a blank Google Sheet named **Aspen Front Desk Tasks**.
2. **Extensions → Apps Script**.
3. Delete the starter code in `Code.gs` and paste in the contents of [`apps-script/Code.gs`](apps-script/Code.gs).
4. Click the gear (**Project Settings**), tick **Show "appsscript.json" manifest file**, open `appsscript.json` from the file list, and replace it with [`apps-script/appsscript.json`](apps-script/appsscript.json). This sets the time zone to Mountain time.
5. Save (⌘S / Ctrl+S).

### 2. Run setup and create PINs
1. In the Apps Script editor, choose the **setup** function in the toolbar and click **Run**. Approve the permission prompts (Google will warn the app is unverified; choose *Advanced → Go to project*). This creates the tabs, seeds Scott, Misha and Valen as managers, and installs the daily recurring-task trigger.
2. Reload the Sheet. A new **Aspen Tasks** menu appears.
3. **Aspen Tasks → Set or reset a PIN** for Scott, Misha and Valen.
4. **Aspen Tasks → Add staff member** for each front desk person (it asks for their PIN right after).
5. Hand out PINs privately. Each person can change theirs in the app (tap their name, top right → *Change my PIN*).

### 3. Deploy the web app
1. In Apps Script: **Deploy → New deployment**.
2. Gear icon → **Web app**.
3. *Execute as:* **Me (info@aspen-elevated.com)** · *Who has access:* **Anyone**.
4. **Deploy**, then copy the **Web app URL** (ends in `/exec`).

"Anyone" lets the page reach the script from any device without a Google sign-in. Every request except the name list still needs a valid PIN session, and the Sheet itself stays private to info@.

### 4. Connect the site
1. In this repo, edit [`config.js`](config.js) and paste the URL:
   ```js
   API_URL: 'https://script.google.com/macros/s/XXXX/exec',
   ```
2. Commit.
3. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)` → Save**.
4. After a minute the app is live at **https://aspen-elevated.github.io/front-desk-tasks/**.

On the front desk computer, bookmark it. On phones, open it in Safari/Chrome and choose **Add to Home Screen**.

---

## Day-to-day admin (from the Sheet's Aspen Tasks menu)

| Need to… | Do this |
|---|---|
| Add a new hire | *Add staff member* |
| Someone forgot their PIN | *Set or reset a PIN* |
| Someone leaves | On the **Staff** tab set **Active** to `FALSE`. They're signed out everywhere and their recurring tasks keep coming, unassigned. |
| Make someone a manager | On the **Staff** tab change **Role** to `manager` |
| Shared computer left signed in | *Sign everyone out* |
| Recurring tasks didn't appear | *Create today's recurring tasks now* (safe to run twice; it never duplicates) |

Too many wrong PINs locks that name for 15 minutes.

## Updating the backend later
After changing `Code.gs`: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. Editing the existing deployment keeps the same URL, so `config.js` doesn't change.

## Files
```
index.html            page shell
styles.css            styles (palette and components match the inventory app)
app.js                app logic
config.js             Apps Script URL goes here
mock-api.js           demo-mode backend (used only when config.js has no URL)
apps-script/Code.gs   backend; paste into the Sheet's Apps Script project
apps-script/appsscript.json  backend manifest (time zone, web app settings)
```

No client health information should go into tasks. This tool is for internal front desk operations only.
