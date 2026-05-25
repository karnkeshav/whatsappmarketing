# WA/Jobs — Product Requirements

## Original Problem Statement
> "i want to create a website where, where when i click find. it should find all the whatsapp group across hyderabad, bihar, delhi and jharkhand which is open to public. which means anyone can join those group. and the bot should check if that group needs admin approval to join. if it needs admin approval than those groups should not be shown. it should show only those groups where i can join using my watsapp number without any block. this should be on github. no paid tools should be required. only free tier options needs to be used"

## User Choices
- Approach: **Option 3** — Auto-discovery + user submissions
- Category: **Jobs**
- Frontend: professional UI/UX
- Hosting target: **GitHub repo** (ready-to-push)

## Architecture
- Backend: FastAPI · httpx · BeautifulSoup4 · MongoDB (Motor) — `/api/*` routes
- Frontend: React 19 · Tailwind · Shadcn UI · Phosphor Icons · react-fast-marquee
- Discovery: Startpage HTML search (no key) + crawl result pages for `chat.whatsapp.com/XXX` codes
- Validation: HTTP fetch to invite preview (server-rendered). Admin-approval status is
  crowd-verified via `POST /api/groups/{id}/report` (auto-hide after 2 "approval"/"invalid" reports)

## User Personas
1. **Job seeker (primary)** — wants to find active WhatsApp jobs groups in their city.
2. **Community manager** — submits their own group via the form.

## Core Requirements
- Discover open WhatsApp jobs groups across Hyderabad, Bihar, Delhi, Jharkhand
- Show only open-join groups (admin-approval auto-hidden after community flags)
- 100% free-tier stack — no paid APIs

## Implemented (2026-05-25)
- [x] Discovery endpoint (Startpage + page crawling) — works across all 4 regions
- [x] Group list / filter by region / stats endpoints
- [x] User-submission endpoint with link validation
- [x] Crowd-verification (works / approval / invalid) with auto-hide threshold = 2
- [x] React frontend: hero, bento stats, ticker, filter chips, cards, submit form, how-it-works, footer
- [x] Swiss / high-contrast brutalist design per design_guidelines.json
- [x] GitHub-ready repo: README, .gitignore, LICENSE, .env.examples
- [x] Tested end-to-end (16/17 backend, 100% frontend) — only nit (ordering) fixed

## Backlog / Next
- P1: Add localStorage to dedupe self-reports per user (prevent same user spamming `/report`)
- P1: Polling timeout / failure state if scan hangs > 3 min
- P2: Periodic background cron (GitHub Actions) to re-scan daily
- P2: Add `$inc` atomic update for `reports_*` to avoid the race condition
- P2: Per-region landing pages + SEO friendly metadata
- P2: Extend categories beyond jobs (education, business, news)
