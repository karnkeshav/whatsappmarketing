"""
Shared helpers for the WA/Jobs GitHub-Action bot.
- search the public web via Startpage (no API key)
- crawl result pages for chat.whatsapp.com invite codes
- read/write the JSON "database" inside docs/data/
"""
from __future__ import annotations
import asyncio
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "docs" / "data"
GROUPS_FILE = DATA_DIR / "groups.json"
STATE_FILE = DATA_DIR / "scan_state.json"

# All Indian states + UTs and their capitals.
# Click a STATE name or CAPITAL name → it becomes a valid scan target.
INDIAN_LOCATIONS = {
    # 28 states
    "Andhra Pradesh": "Amaravati",
    "Arunachal Pradesh": "Itanagar",
    "Assam": "Dispur",
    "Bihar": "Patna",
    "Chhattisgarh": "Raipur",
    "Goa": "Panaji",
    "Gujarat": "Gandhinagar",
    "Haryana": "Chandigarh",
    "Himachal Pradesh": "Shimla",
    "Jharkhand": "Ranchi",
    "Karnataka": "Bengaluru",
    "Kerala": "Thiruvananthapuram",
    "Madhya Pradesh": "Bhopal",
    "Maharashtra": "Mumbai",
    "Manipur": "Imphal",
    "Meghalaya": "Shillong",
    "Mizoram": "Aizawl",
    "Nagaland": "Kohima",
    "Odisha": "Bhubaneswar",
    "Punjab": "Chandigarh",
    "Rajasthan": "Jaipur",
    "Sikkim": "Gangtok",
    "Tamil Nadu": "Chennai",
    "Telangana": "Hyderabad",
    "Tripura": "Agartala",
    "Uttar Pradesh": "Lucknow",
    "Uttarakhand": "Dehradun",
    "West Bengal": "Kolkata",
    # 8 union territories
    "Andaman and Nicobar Islands": "Port Blair",
    "Chandigarh": "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu": "Daman",
    "Delhi": "New Delhi",
    "Jammu and Kashmir": "Srinagar",
    "Ladakh": "Leh",
    "Lakshadweep": "Kavaratti",
    "Puducherry": "Puducherry",
}

# Every accepted region name (states + capitals, case-insensitive matching)
VALID_LOCATIONS = sorted(set(INDIAN_LOCATIONS.keys()) | set(INDIAN_LOCATIONS.values()))
VALID_LOWER = {x.lower(): x for x in VALID_LOCATIONS}

# Legacy 4 default regions (kept for the cron-default discover run)
DEFAULT_REGIONS = ["Hyderabad", "Bihar", "Delhi", "Jharkhand"]
CATEGORY = "jobs"

INVITE_REGEX = re.compile(
    r"https?://chat\.whatsapp\.com/(?:invite/)?([A-Za-z0-9_-]{18,30})", re.IGNORECASE
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

EXCLUDED_DOMAINS = {
    "startpage.com", "google.com", "bing.com", "yahoo.com", "duckduckgo.com",
    "facebook.com", "instagram.com", "twitter.com", "x.com", "t.me",
    "youtube.com", "youtu.be", "pinterest.com", "linkedin.com",
    "tiktok.com", "reddit.com", "schema.org", "w3.org", "system1.com",
    "googleapis.com", "gstatic.com", "wikipedia.org",
}


# ---------- region normalisation ----------
def normalise_region(name: str) -> Optional[str]:
    """Return the canonical-case name if valid, else None."""
    if not name:
        return None
    return VALID_LOWER.get(name.strip().lower())


# ---------- JSON I/O ----------
def load_groups() -> list[dict]:
    if not GROUPS_FILE.exists():
        return []
    try:
        return json.loads(GROUPS_FILE.read_text() or "[]")
    except Exception:
        return []


def save_groups(items: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    GROUPS_FILE.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n")


def load_state() -> dict:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text() or "{}")
    except Exception:
        return {}


def save_state(state: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- URL helpers ----------
def is_excluded(u: str) -> bool:
    host = ""
    try:
        host = urlparse(u).netloc.lower()
    except Exception:
        return True
    if not host:
        return True
    if any(host == d or host.endswith("." + d) for d in EXCLUDED_DOMAINS):
        return True
    return "whatsapp.com" in host


def extract_codes(text: str) -> set[str]:
    return {m.group(1) for m in INVITE_REGEX.finditer(text)}


def extract_invite_code(link: str) -> Optional[str]:
    m = INVITE_REGEX.search(link)
    return m.group(1) if m else None


# ---------- HTTP ----------
async def fetch(c: httpx.AsyncClient, url: str, timeout: float = 15.0) -> Optional[str]:
    try:
        r = await c.get(url, timeout=timeout)
        if r.status_code == 200 and r.text:
            return r.text
    except Exception:
        pass
    return None


async def startpage_search(c: httpx.AsyncClient, query: str) -> list[str]:
    try:
        r = await c.get(
            "https://www.startpage.com/do/search",
            params={"q": query, "cat": "web"},
            timeout=20.0,
        )
        if r.status_code != 200:
            return []
    except Exception:
        return []
    soup = BeautifulSoup(r.text, "lxml")
    urls: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("http") and not is_excluded(href):
            urls.append(href.split("#")[0])
    seen, out = set(), []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out[:25]


async def fetch_invite_meta(c: httpx.AsyncClient, code: str) -> dict:
    """Pull og:title / og:description from the public WhatsApp invite preview."""
    url = f"https://chat.whatsapp.com/{code}"
    html = await fetch(c, url)
    if not html:
        return {"name": None, "description": None, "url": url, "valid": False}
    soup = BeautifulSoup(html, "lxml")
    og_t = soup.find("meta", property="og:title")
    og_d = soup.find("meta", property="og:description")
    return {
        "name": og_t["content"].strip() if og_t and og_t.get("content") else None,
        "description": og_d["content"].strip() if og_d and og_d.get("content") else None,
        "url": url,
        "valid": True,
    }


# ---------- Group model ----------
def make_group(
    *, name: str, invite_link: str, invite_code: str, region: str,
    description: Optional[str] = None, source_url: Optional[str] = None,
    discovered_via: str = "auto",
) -> dict:
    n = now_iso()
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "invite_link": invite_link,
        "invite_code": invite_code,
        "region": region,
        "category": CATEGORY,
        # status: "open" = visible, "hidden" = hidden by 2+ approval reports, "invalid" = dead link
        "status": "open",
        # NEW: messaging mode. "open" (anyone can post) or "readonly" (only admins post).
        # Default "open" until crowd-flagged.
        "chat_mode": "open",
        "description": description,
        "source_url": source_url,
        "discovered_via": discovered_via,
        "reports_works": 0,
        "reports_approval": 0,
        "reports_invalid": 0,
        "reports_readonly": 0,
        "last_checked": n,
        "created_at": n,
    }


def upsert_group(groups: list[dict], group: dict) -> bool:
    """Returns True if a new group was added, False if it already existed."""
    for g in groups:
        if g.get("invite_code") == group["invite_code"]:
            g["last_checked"] = group["last_checked"]
            if group.get("source_url") and not g.get("source_url"):
                g["source_url"] = group["source_url"]
            # backfill new field on older records
            g.setdefault("chat_mode", "open")
            g.setdefault("reports_readonly", 0)
            return False
    groups.append(group)
    return True


def find_group(groups: list[dict], group_id: Optional[str] = None,
               invite_code: Optional[str] = None) -> Optional[dict]:
    for g in groups:
        if group_id and g.get("id") == group_id:
            return g
        if invite_code and g.get("invite_code") == invite_code:
            return g
    return None


# ---------- Async client factory ----------
def http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(headers=HEADERS, follow_redirects=True)


def run(coro):
    return asyncio.run(coro)
