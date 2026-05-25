# WA/Jobs — WhatsApp Jobs Group Finder (Hyderabad · Bihar · Delhi · Jharkhand)

A **fully GitHub-native, zero-cost** web app that discovers public WhatsApp jobs groups across four
Indian regions and lets visitors crowd-verify which are open-join.

- **Frontend** → plain HTML + CSS + vanilla JavaScript, served by **GitHub Pages**.
- **Database** → a JSON file checked into this repo (`docs/data/groups.json`).
- **Bot** → a Python script that runs in **GitHub Actions** (cron + manual trigger), commits new groups back to the repo.
- **User actions** → submit / report are **pre-filled GitHub Issues**; another Action processes them and updates the JSON.

No servers. No paid APIs. No database. No build step.

---

## Architecture

```
whatsappmarketing/
├── docs/                          # ← GitHub Pages serves this folder
│   ├── index.html                 # static HTML site
│   ├── styles.css
│   ├── app.js                     # vanilla JS — fetches data/*.json
│   └── data/
│       ├── groups.json            # the "database"
│       └── scan_state.json
├── scripts/                       # Python bot (runs in GitHub Actions)
│   ├── lib.py                     # shared helpers
│   ├── discover.py                # crawls public web, appends groups to JSON
│   ├── apply_reports.py           # reads issues with submit/report labels, updates JSON
│   └── requirements.txt
├── .github/
│   ├── workflows/
│   │   ├── discover.yml           # cron daily + manual workflow_dispatch
│   │   └── apply-reports.yml      # on issue opened/labeled
│   └── ISSUE_TEMPLATE/
│       ├── submit-group.yml
│       ├── report-group.yml
│       └── config.yml
├── frontend/                      # ← only for local Emergent preview, NOT pushed
├── README.md
└── LICENSE
```

> The `frontend/` folder is a leftover from the previous React stack. It is **kept for
> local-preview purposes only**. Everything you need for production is under `docs/`, `scripts/`
> and `.github/`. You can safely delete `frontend/` from the GitHub repo if you wish.

---

## 1 · One-time setup (on GitHub)

1. **Push this repo** to GitHub (you've already done this — `karnkeshav/whatsappmarketing`).
2. **Enable GitHub Pages:**
   - Go to **Settings → Pages**
   - **Source** → "Deploy from a branch"
   - **Branch** → `main` · **Folder** → `/docs`
   - **Save** — wait ~1 min, your site appears at:
     `https://karnkeshav.github.io/whatsappmarketing/`
3. **Allow GitHub Actions to push:**
   - Go to **Settings → Actions → General**
   - Under "Workflow permissions" → choose **Read and write permissions**
   - Tick **Allow GitHub Actions to create and approve pull requests**
   - **Save**

That's it. The site is live, no backend to deploy.

---

## 2 · Run the discovery bot

The bot finds new WhatsApp jobs groups and commits them to `docs/data/groups.json`.

### Manual run (do this once to populate the directory)
1. Go to **Actions → Discovery scan**
2. Click **Run workflow** → leave defaults → **Run workflow**
3. Wait ~1-2 min. When it finishes, refresh your site — the new groups appear.

### Automatic run
- The workflow runs on a cron schedule: **every day at 03:00 UTC** (configured in `.github/workflows/discover.yml`). Change the cron line to adjust.

---

## 3 · How user actions work (no backend needed)

Every interactive button on the site opens a **pre-filled GitHub Issue**:

| Action            | Issue label   | What the Action does                                       |
|-------------------|---------------|------------------------------------------------------------|
| Submit a group    | `submit`      | Validates the link, appends to `groups.json`, closes issue |
| Worked            | `report,works`| Increments `reports_works` on the group                    |
| Needed approval   | `report,approval` | Increments `reports_approval`; **hides** after 2 reports |
| Invalid / expired | `report,invalid` | Increments `reports_invalid`; marks invalid after 2 reports |

The visitor only needs a free GitHub account to confirm the issue — no other auth required.
The bot replies on the issue with a ✅/❌ confirmation comment and closes it.

---

## 4 · Local preview (optional)

You don't need any server to run this site. Just open the HTML:

```bash
# From the repo root
cd docs
python3 -m http.server 5500
# Open http://localhost:5500/
```

Or to populate JSON locally (requires Python 3.10+):
```bash
pip install -r scripts/requirements.txt
python scripts/discover.py --regions "Hyderabad,Delhi" --max-per-region 6
```

---

## 5 · Customising

- **Add a region** → edit `REGIONS` in `scripts/lib.py` AND add a chip in `docs/index.html`.
- **Change category** → pass `--category` to `discover.py`, or change `CATEGORY` in `lib.py`.
- **Change auto-hide threshold** → edit `HIDE_THRESHOLD` in `scripts/apply_reports.py`.
- **Style** → all CSS lives in `docs/styles.css`.

---

## 6 · Ethical & legal notes

- The bot only fetches the **public invite-preview** HTML that WhatsApp serves to any browser —
  no WhatsApp account is used and no joining is automated.
- WhatsApp now renders its join page in client-side JavaScript, which is why admin-approval status
  must be **crowd-verified** by visitors.
- Only links already publicly indexed on the open web are surfaced.
- Respect [WhatsApp's Terms of Service](https://www.whatsapp.com/legal/terms-of-service).

## License
MIT
