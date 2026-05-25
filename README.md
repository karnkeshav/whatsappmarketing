# WA/Jobs — WhatsApp Jobs Group Finder (Hyderabad · Bihar · Delhi · Jharkhand)

A free & open-source web app that discovers **public WhatsApp jobs groups** across four Indian
regions and lets visitors crowd-verify which groups are open-join (no admin approval).

> **Important technical note:** WhatsApp does **not** provide an API to discover or check groups,
> and its invite-preview page is rendered client-side — so admin-approval status can't be detected
> from a single HTTP request without using a real WhatsApp account (which would risk a ban).
>
> This project takes the honest free-tier approach:
> 1. **Discover** `chat.whatsapp.com/...` invite links from the public web (search engines + public
>    group directories).
> 2. **Show** them all on the site with the group name pulled from WhatsApp's open-graph metadata.
> 3. **Crowd-verify**: every card has *Worked / Needed approval / Invalid* buttons. After 2
>    "needed approval" reports a group is auto-hidden — so the directory self-cleans.

---

## Features
- One-click discovery scan across 4 regions (Hyderabad, Bihar, Delhi, Jharkhand)
- Crowd-verified open-join status with auto-hide after 2 admin-approval reports
- User-submission form (instant validation)
- Region filters · live stats · scan status
- 100% free-tier stack (no paid APIs)

## Tech Stack
| Layer    | Tech                                              |
|----------|---------------------------------------------------|
| Frontend | React 19, Tailwind CSS, Shadcn UI, Phosphor Icons |
| Backend  | FastAPI, httpx, BeautifulSoup4                    |
| Database | MongoDB                                           |
| Search   | Startpage (no API key) + public-page crawling     |

---

## Repository Structure

```
wa-jobs/
├── backend/
│   ├── server.py            # FastAPI app + discovery bot + validator
│   ├── requirements.txt     # Python dependencies
│   └── .env.example         # Copy → .env (MONGO_URL, DB_NAME, CORS_ORIGINS)
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/      # Hero, RegionFilters, GroupCard, SubmitGroupForm, HowItWorks, TickerRibbon
│   │   ├── pages/Home.jsx
│   │   ├── lib/api.js
│   │   ├── App.js
│   │   ├── index.js
│   │   ├── App.css
│   │   └── index.css
│   ├── package.json
│   ├── tailwind.config.js
│   └── .env.example         # Copy → .env (REACT_APP_BACKEND_URL)
├── .gitignore
├── LICENSE
└── README.md
```

---

## Local Setup (end-to-end)

### Prerequisites
- Python 3.10+
- Node.js 18+ and **Yarn** (do not use npm)
- MongoDB running locally (or MongoDB Atlas free tier)

### 1. Clone
```bash
git clone https://github.com/<your-user>/wa-jobs.git
cd wa-jobs
```

### 2. Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env →
#   MONGO_URL="mongodb://localhost:27017"
#   DB_NAME="wa_jobs"
#   CORS_ORIGINS="*"
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Frontend
```bash
cd ../frontend
yarn install
cp .env.example .env
# Edit .env →
#   REACT_APP_BACKEND_URL=http://localhost:8001
yarn start
```

Visit **http://localhost:3000** → click **Find Groups**.

---

## API Reference

All routes are prefixed with `/api`.

| Method | Path                            | Description                            |
|--------|---------------------------------|----------------------------------------|
| GET    | `/api/regions`                  | Returns supported regions              |
| GET    | `/api/groups?region=All`        | List currently-open groups             |
| GET    | `/api/groups/stats`             | Counts per region + scan info          |
| POST   | `/api/groups/discover`          | Trigger background discovery scan      |
| GET    | `/api/scan/status`              | Current scan progress                  |
| POST   | `/api/groups/submit`            | User submits an invite link            |
| POST   | `/api/groups/{id}/report`       | Report group (works / approval / invalid) |

### Example — start a scan
```bash
curl -X POST http://localhost:8001/api/groups/discover \
  -H "Content-Type: application/json" \
  -d '{"regions":["Hyderabad","Delhi"],"category":"jobs","max_per_region":10}'
```

---

## Deployment (Free Tier)

You can host this entirely on free tiers:

| Layer    | Recommended Free Host          |
|----------|--------------------------------|
| Frontend | Vercel · Netlify · Cloudflare Pages |
| Backend  | Render · Railway · Fly.io (free trial) |
| Database | MongoDB Atlas (M0 — free 512 MB) |

### Steps after pushing to GitHub
1. **MongoDB Atlas**: create free cluster → get connection string → set as `MONGO_URL`.
2. **Backend (Render)**:
   - New → Web Service → connect repo → root `backend/`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn server:app --host 0.0.0.0 --port $PORT`
   - Env vars: `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS=https://<your-frontend>.vercel.app`
3. **Frontend (Vercel)**:
   - Import repo → root `frontend/`
   - Build: `yarn build` · Output: `build`
   - Env var: `REACT_APP_BACKEND_URL=https://<your-backend>.onrender.com`

---

## End-to-End Workflow

1. **Build locally** → run `yarn start` + `uvicorn` and click *Find Groups*.
2. **Initialise git** and push to GitHub:
   ```bash
   cd wa-jobs
   git init
   git add .
   git commit -m "feat: initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/wa-jobs.git
   git push -u origin main
   ```
3. **Create a free MongoDB Atlas cluster** and copy its connection string.
4. **Deploy backend** on Render (see above) using the Atlas URL.
5. **Deploy frontend** on Vercel with `REACT_APP_BACKEND_URL` pointed at the Render URL.
6. **Visit the live site** and trigger a scan.
7. (Optional) Add a GitHub Action to ping `/api/groups/discover` daily — keeps the directory fresh.

---

## Legal & Ethical Notes
- The bot only requests the **public invite-preview HTML** that WhatsApp serves to any browser — no
  WhatsApp account is used and no joining is automated.
- WhatsApp now renders its join page in client-side JavaScript, which is why admin-approval status
  must be crowd-verified by visitors.
- Respect WhatsApp's [Terms of Service](https://www.whatsapp.com/legal/terms-of-service). Do not use
  this project to spam, harvest data, or join groups against their rules.
- Only links that are already publicly indexed on the open web are surfaced.

## License
MIT
