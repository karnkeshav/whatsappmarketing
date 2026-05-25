"""
Shared helpers for the WA/Jobs GitHub-Action bot.
- INDIAN_LOCATIONS = state → capital
- INDIAN_DISTRICTS = state → list of major districts/cities
- CATEGORIES       = available categories (jobs, societies, …)
- search Startpage / crawl pages / read & write docs/data/groups.json
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

# ---------- LOCATIONS ----------
INDIAN_LOCATIONS = {
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
    "Andaman and Nicobar Islands": "Port Blair",
    "Chandigarh": "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu": "Daman",
    "Delhi": "New Delhi",
    "Jammu and Kashmir": "Srinagar",
    "Ladakh": "Leh",
    "Lakshadweep": "Kavaratti",
    "Puducherry": "Puducherry",
}

# Major districts/cities per state — kept short & well-known for searchability.
INDIAN_DISTRICTS: dict[str, list[str]] = {
    "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Tirupati", "Nellore", "Kurnool", "Kakinada", "Rajahmundry"],
    "Arunachal Pradesh": ["Itanagar", "Tawang", "Pasighat", "Naharlagun"],
    "Assam": ["Guwahati", "Dibrugarh", "Silchar", "Jorhat", "Tezpur", "Nagaon"],
    "Bihar": ["Patna", "Gaya", "Muzaffarpur", "Bhagalpur", "Darbhanga", "Purnia", "Begusarai", "Ara"],
    "Chhattisgarh": ["Raipur", "Bilaspur", "Bhilai", "Korba", "Durg", "Rajnandgaon", "Jagdalpur"],
    "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda"],
    "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Gandhinagar", "Anand"],
    "Haryana": ["Gurugram", "Faridabad", "Panipat", "Ambala", "Hisar", "Karnal", "Rohtak", "Sonipat"],
    "Himachal Pradesh": ["Shimla", "Manali", "Dharamshala", "Solan", "Mandi", "Kullu", "Bilaspur"],
    "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Hazaribagh", "Deoghar", "Giridih"],
    "Karnataka": ["Bengaluru", "Mysuru", "Mangaluru", "Hubli", "Belagavi", "Davangere", "Tumakuru", "Shivamogga"],
    "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Alappuzha", "Palakkad", "Kannur"],
    "Madhya Pradesh": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Dewas", "Satna"],
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane", "Solapur", "Kolhapur", "Navi Mumbai"],
    "Manipur": ["Imphal", "Bishnupur", "Churachandpur", "Thoubal"],
    "Meghalaya": ["Shillong", "Tura", "Jowai", "Nongstoin"],
    "Mizoram": ["Aizawl", "Lunglei", "Champhai", "Serchhip"],
    "Nagaland": ["Kohima", "Dimapur", "Mokokchung", "Mon"],
    "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri"],
    "Punjab": ["Chandigarh", "Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali"],
    "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner", "Alwar"],
    "Sikkim": ["Gangtok", "Namchi", "Mangan", "Geyzing"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Erode", "Vellore"],
    "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam", "Mahbubnagar", "Secunderabad"],
    "Tripura": ["Agartala", "Udaipur", "Dharmanagar", "Kailashahar"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Varanasi", "Agra", "Meerut", "Ghaziabad", "Noida", "Allahabad", "Bareilly"],
    "Uttarakhand": ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rishikesh", "Nainital"],
    "West Bengal": ["Kolkata", "Howrah", "Siliguri", "Durgapur", "Asansol", "Darjeeling"],
    "Andaman and Nicobar Islands": ["Port Blair", "Diglipur"],
    "Chandigarh": ["Chandigarh"],
    "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Diu", "Silvassa"],
    "Delhi": ["New Delhi", "Dwarka", "Rohini", "Saket", "Connaught Place"],
    "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla"],
    "Ladakh": ["Leh", "Kargil"],
    "Lakshadweep": ["Kavaratti"],
    "Puducherry": ["Puducherry", "Karaikal"],
}

# Categories: keyword used for search + label shown to user
CATEGORIES = [
    {"value": "jobs",        "label": "Jobs",         "query": "jobs"},
    {"value": "societies",   "label": "Societies",    "query": "society apartment residents"},
    {"value": "education",   "label": "Education",    "query": "education students study"},
    {"value": "real-estate", "label": "Real Estate",  "query": "real estate property"},
    {"value": "business",    "label": "Business",     "query": "business networking trade"},
    {"value": "news",        "label": "News",         "query": "news updates"},
]
CATEGORY_BY_VALUE = {c["value"]: c for c in CATEGORIES}
DEFAULT_CATEGORY = "jobs"

# Valid scan targets — states + capitals + every district (case-insensitive)
def _all_valid_targets() -> set[str]:
    s = set(INDIAN_LOCATIONS.keys()) | set(INDIAN_LOCATIONS.values())
    for districts in INDIAN_DISTRICTS.values():
        s.update(districts)
    return s

VALID_LOCATIONS = sorted(_all_valid_targets())
VALID_LOWER = {x.lower(): x for x in VALID_LOCATIONS}

# Reverse lookup: district → state. (If the same name appears in 2 states we keep the first.)
DISTRICT_TO_STATE: dict[str, str] = {}
for _state, _ds in INDIAN_DISTRICTS.items():
    for _d in _ds:
        DISTRICT_TO_STATE.setdefault(_d, _state)

DEFAULT_REGIONS = ["Hyderabad", "Bihar", "Delhi", "Jharkhand"]

# Heuristic skip list — if a group name contains any of these, we don't add it.
ADMIN_HEURISTIC_KEYWORDS = [
    "admin approval", "approval required", "approval-required",
    "private group", "members only", "members-only",
    "official only", "official-only",
    "by invitation", "invite only", "invitation only",
    "verified members", "internal only", "internal use",
    "closed group", "closed-group", "restricted",
    "broadcast only", "announcement only", "announcements only",
    "read only", "read-only", "channel only",
]

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
    if not name:
        return None
    return VALID_LOWER.get(name.strip().lower())


def normalise_category(value: str) -> str:
    v = (value or "").strip().lower().replace("_", "-")
    return v if v in CATEGORY_BY_VALUE else DEFAULT_CATEGORY


def category_query(value: str) -> str:
    return CATEGORY_BY_VALUE.get(normalise_category(value), CATEGORY_BY_VALUE[DEFAULT_CATEGORY])["query"]


def looks_admin_restricted(name: str) -> bool:
    if not name:
        return False
    low = name.lower()
    return any(kw in low for kw in ADMIN_HEURISTIC_KEYWORDS)


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
    state: Optional[str] = None, district: Optional[str] = None,
    category: str = DEFAULT_CATEGORY,
    description: Optional[str] = None, source_url: Optional[str] = None,
    discovered_via: str = "auto",
) -> dict:
    n = now_iso()
    # Resolve state/district from region if not explicitly given
    if state is None:
        if region in INDIAN_LOCATIONS:
            state = region
        elif region in DISTRICT_TO_STATE:
            state = DISTRICT_TO_STATE[region]
        else:
            # capital → state
            for st, cap in INDIAN_LOCATIONS.items():
                if cap == region:
                    state = st
                    break
    if district is None:
        if region not in INDIAN_LOCATIONS:  # not a state — treat as district/capital
            district = region
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "invite_link": invite_link,
        "invite_code": invite_code,
        "region": region,
        "state": state,
        "district": district,
        "category": normalise_category(category),
        "status": "open",
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
    for g in groups:
        if g.get("invite_code") == group["invite_code"]:
            g["last_checked"] = group["last_checked"]
            if group.get("source_url") and not g.get("source_url"):
                g["source_url"] = group["source_url"]
            g.setdefault("chat_mode", "open")
            g.setdefault("reports_readonly", 0)
            g.setdefault("state", group.get("state"))
            g.setdefault("district", group.get("district"))
            g.setdefault("category", group.get("category", DEFAULT_CATEGORY))
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


def http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(headers=HEADERS, follow_redirects=True)


def run(coro):
    return asyncio.run(coro)
