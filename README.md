# WA/Jobs — WhatsApp Jobs Group Finder (every Indian state + capital)

A **fully GitHub-native, zero-cost** web app that discovers public WhatsApp jobs groups across
**every Indian state and capital city** and lets visitors crowd-verify each group.

- **Frontend** → plain HTML + CSS + vanilla JavaScript on **GitHub Pages**.
- **Database** → a JSON file checked into this repo (`docs/data/groups.json`).
- **Bot** → a Python script that runs in **GitHub Actions** (cron + on-demand via Issues).
- **User actions** → pre-filled GitHub Issues; Actions process them and update the JSON.

No servers. No database. No paid APIs. No build step.

---

## What it tracks

| Signal                          | How                                                       | Outcome                                    |
|---------------------------------|-----------------------------------------------------------|--------------------------------------------|
| New invite links                | Bot crawls public web for a chosen state/capital          | Appended to `groups.json` (existing groups never deleted) |
| Group worked (you joined)       | "👍 Worked" button → GitHub Issue → bot tallies          | Verified-count grows                       |
| Needed admin approval           | "⛔ Needed approval" button                              | After 2 reports → **hidden**               |
| Only admins can send messages   | "🔇 Admins only" button                                  | After 2 reports → **READ-ONLY badge, stays visible** so you can DM the admin |
| Invalid / expired link          | "⚠" button                                              | After 2 reports → marked invalid           |

---

## Architecture

```
whatsappmarketing/
├── docs/                              # ← GitHub Pages source
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── data/
│       ├── groups.json                # the "database"
│       └── scan_state.json
├── scripts/                           # Python bot (runs in GitHub Actions)
│   ├── lib.py                         # locations list, JSON I/O, shared helpers
│   ├── discover.py                    # crawls public web, appends groups
│   ├── apply_reports.py               # processes Issues (submit / report / scan-request)
│   └── requirements.txt
├── .github/
│   ├── workflows/
│   │   ├── discover.yml               # daily cron + manual trigger
│   │   └── apply-reports.yml          # on issue opened/labeled
│   └── ISSUE_TEMPLATE/
│       ├── submit-group.yml
│       ├── report-group.yml
│       └── scan-request.yml
├── frontend/                          # ONLY for local Emergent preview, NOT used in production
├── README.md
└── LICENSE
```

---

## 1 · One-time setup (on GitHub)

1. **Enable GitHub Pages:** Settings → Pages → Branch `main` · Folder `/docs` → Save.
   Your site appears at `https://<user>.github.io/whatsappmarketing/`.

2. **Allow Actions to push:** Settings → Actions → General → Workflow permissions → **Read and write**
   permissions → Save.

---

## 2 · Populate the directory

The site can be scanned in **three** ways — all free, all GitHub-native:

### a · On-demand from the site (recommended)
- Open the site → **Locations** section
- Click any state pill (e.g. *Maharashtra*) or its capital (e.g. *Mumbai*)
- You'll be sent to GitHub to confirm a pre-filled issue
- Workflow runs in 1-2 min → new groups appear after refresh

### b · Manual workflow run
- Actions → **Discovery scan** → Run workflow
- Optional: change the `regions` input (comma-separated state/capital names)

### c · Automatic daily cron
- Configured in `.github/workflows/discover.yml`
- Runs every day at **03:00 UTC** for the default regions (Hyderabad / Bihar / Delhi / Jharkhand)

> The bot **only appends** new groups. Existing groups are never deleted by discovery.

---

## 3 · How crowd-verification works

Every card has four feedback buttons. Each opens a pre-filled GitHub Issue:

| Button              | Issue labels         | Effect                                                      |
|---------------------|----------------------|-------------------------------------------------------------|
| 👍 Worked           | `report,works`       | Increments confirmed count                                  |
| ⛔ Needed approval  | `report,approval`    | After 2 → group **hidden** from listing                     |
| 🔇 Admins only      | `report,readonly`    | After 2 → group flagged as **READ-ONLY · DM admin** (still visible) |
| ⚠ Invalid           | `report,invalid`     | After 2 → group marked invalid (hidden)                     |

The site also has an **"Open chat only"** toggle that hides read-only groups instantly without
removing them from the data.

---

## 4 · Supported locations

All 28 Indian states + all 8 union territories + their capitals — see `INDIAN_LOCATIONS` in
`scripts/lib.py` for the canonical list. Both the state name AND its capital are valid scan
targets and become buttons on the site.

---

## 5 · Local development (optional)

```bash
# Run the static site locally
cd docs && python3 -m http.server 5500
# → http://localhost:5500

# Or populate the JSON yourself
pip install -r scripts/requirements.txt
python scripts/discover.py --regions "Mumbai,Bengaluru,Chennai" --max-per-region 8
```

---

## 6 · Ethical & legal notes

- The bot only fetches WhatsApp's **public invite preview**. No WhatsApp account is used and no
  joining is automated.
- WhatsApp renders its join page in client-side JavaScript, which is why admin-approval and
  admin-only-messaging status must be **crowd-verified**.
- Only links already publicly indexed on the open web are surfaced.
- Respect [WhatsApp's Terms of Service](https://www.whatsapp.com/legal/terms-of-service).

## License
MIT
