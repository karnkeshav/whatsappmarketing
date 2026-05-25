"""
WhatsApp Jobs Group Finder — Backend
- Discovers public chat.whatsapp.com invite codes via Startpage search + aggregator-page crawling
- WhatsApp's invite preview is fully JS-rendered, so we CANNOT reliably check admin-approval status
  via a simple HTTP request without using a real WhatsApp account (which would risk a ban).
  → We rely on:
     1. Source signals: links that appear in known public job-group directories are highly likely
        to be open-join (admin-approval groups aren't publicly indexed because admins curate them).
     2. Crowd validation: every card has "Worked" / "Needed approval" buttons that adjust visibility.
        After ≥2 'needs_approval' reports a group is hidden from the public listing.
"""
from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
import os, re, uuid, asyncio, logging, httpx
from bs4 import BeautifulSoup
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
log = logging.getLogger("wa-finder")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="WhatsApp Jobs Group Finder")
api = APIRouter(prefix="/api")

# ---------- Constants ----------
REGIONS = ["Hyderabad", "Bihar", "Delhi", "Jharkhand"]
INVITE_REGEX = re.compile(
    r"https?://chat\.whatsapp\.com/(?:invite/)?([A-Za-z0-9_-]{18,30})", re.IGNORECASE
)
HEADERS_DESKTOP = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Domains we exclude from result-page crawling (search engine / social platforms)
EXCLUDED_DOMAINS = {
    "startpage.com", "google.com", "bing.com", "yahoo.com", "duckduckgo.com",
    "facebook.com", "instagram.com", "twitter.com", "x.com", "t.me",
    "youtube.com", "youtu.be", "pinterest.com", "linkedin.com",
    "tiktok.com", "reddit.com", "schema.org", "w3.org", "system1.com",
    "googleapis.com", "gstatic.com", "wikipedia.org",
}

# ---------- Models ----------
class WhatsAppGroup(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    invite_link: str
    invite_code: str
    region: str
    category: str = "jobs"
    status: Literal["open", "hidden", "invalid"] = "open"
    description: Optional[str] = None
    source_url: Optional[str] = None
    discovered_via: Literal["auto", "user"] = "auto"
    reports_works: int = 0
    reports_approval: int = 0
    reports_invalid: int = 0
    last_checked: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SubmitGroupReq(BaseModel):
    invite_link: str
    region: str


class DiscoverReq(BaseModel):
    regions: Optional[List[str]] = None
    category: str = "jobs"
    max_per_region: int = 15


class ReportReq(BaseModel):
    kind: Literal["works", "approval", "invalid"]


class ScanState(BaseModel):
    id: str = "global"
    is_running: bool = False
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    found_count: int = 0
    open_count: int = 0
    message: str = ""


# ---------- Helpers ----------
async def _fetch(c: httpx.AsyncClient, url: str) -> Optional[str]:
    try:
        r = await c.get(url, timeout=15.0)
        if r.status_code == 200 and r.text:
            return r.text
    except Exception as e:
        log.debug(f"fetch failed {url[:80]} :: {e}")
    return None


def _is_excluded(u: str) -> bool:
    host = ""
    try:
        host = urlparse(u).netloc.lower()
    except Exception:
        return True
    if not host:
        return True
    return any(host == d or host.endswith("." + d) for d in EXCLUDED_DOMAINS) or "whatsapp.com" in host


def _extract_codes(html: str) -> set:
    return {m.group(1) for m in INVITE_REGEX.finditer(html)}


def _extract_invite_code(link: str) -> Optional[str]:
    m = INVITE_REGEX.search(link)
    return m.group(1) if m else None


async def startpage_search(c: httpx.AsyncClient, query: str) -> List[str]:
    """Free Startpage search — proxies Google. No API key."""
    try:
        r = await c.get(
            "https://www.startpage.com/do/search",
            params={"q": query, "cat": "web"},
            timeout=20.0,
        )
        if r.status_code != 200:
            return []
    except Exception as e:
        log.warning(f"startpage err: {e}")
        return []
    soup = BeautifulSoup(r.text, "lxml")
    urls = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("http") and not _is_excluded(href):
            urls.append(href.split("#")[0])
    # dedupe preserving order
    seen, out = set(), []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out[:25]


async def fetch_invite_meta(c: httpx.AsyncClient, code: str) -> dict:
    """Pull og:title from WhatsApp invite preview to get group name (best-effort)."""
    url = f"https://chat.whatsapp.com/{code}"
    html = await _fetch(c, url)
    name = None
    desc = None
    valid = True
    if html:
        soup = BeautifulSoup(html, "lxml")
        og_t = soup.find("meta", property="og:title")
        og_d = soup.find("meta", property="og:description")
        name = og_t["content"].strip() if og_t and og_t.get("content") else None
        desc = og_d["content"].strip() if og_d and og_d.get("content") else None
    else:
        valid = False
    return {"name": name, "description": desc, "url": url, "valid": valid}


# ---------- Scan State ----------
async def _get_scan_state() -> ScanState:
    doc = await db.scan_state.find_one({"id": "global"}, {"_id": 0})
    return ScanState(**doc) if doc else ScanState()


async def _save_scan_state(state: ScanState):
    await db.scan_state.update_one({"id": "global"}, {"$set": state.model_dump()}, upsert=True)


async def _persist_group(group: WhatsAppGroup):
    existing = await db.groups.find_one({"invite_code": group.invite_code}, {"_id": 0})
    if existing:
        # Update last_checked and source_url if new
        await db.groups.update_one(
            {"invite_code": group.invite_code},
            {"$set": {"last_checked": group.last_checked, "source_url": group.source_url or existing.get("source_url")}},
        )
        return False
    await db.groups.insert_one(group.model_dump())
    return True


# ---------- Discovery ----------
def _build_queries(region: str, category: str) -> list[str]:
    return [
        f'"chat.whatsapp.com" {category} {region} group link',
        f'whatsapp group link {category} {region} 2025',
        f'{region} {category} whatsapp group join',
    ]


async def _collect_candidate_pages(c: httpx.AsyncClient, region: str, category: str) -> list[str]:
    candidates: list[str] = []
    for q in _build_queries(region, category):
        candidates.extend(await startpage_search(c, q))
        await asyncio.sleep(1.0)
        if len(candidates) >= 40:
            break
    return list(dict.fromkeys(candidates))  # dedupe, keep order


async def _extract_codes_from_pages(c: httpx.AsyncClient, pages: list[str], cap: int) -> dict[str, str]:
    discovered: dict[str, str] = {}
    for url in pages[:25]:
        html = await _fetch(c, url)
        if not html:
            continue
        for code in _extract_codes(html):
            discovered.setdefault(code, url)
        if len(discovered) >= cap:
            break
        await asyncio.sleep(0.4)
    return discovered


async def _persist_discovered(items: list[tuple[str, str]], region: str, category: str,
                              c: httpx.AsyncClient) -> int:
    open_count = 0
    for code, src in items:
        meta = await fetch_invite_meta(c, code)
        if not meta["valid"]:
            continue
        grp = WhatsAppGroup(
            name=meta["name"] or f"{category.title()} group — {region}",
            invite_link=meta["url"],
            invite_code=code,
            region=region,
            category=category,
            status="open",
            description=meta["description"],
            source_url=src,
            discovered_via="auto",
        )
        if await _persist_group(grp):
            open_count += 1
        await asyncio.sleep(0.2)
    return open_count


async def _discover_for_region(c: httpx.AsyncClient, region: str, category: str, max_results: int) -> tuple[int, int]:
    pages = await _collect_candidate_pages(c, region, category)
    discovered = await _extract_codes_from_pages(c, pages, cap=max_results * 2)
    open_count = await _persist_discovered(
        list(discovered.items())[:max_results], region, category, c
    )
    return len(discovered), open_count


async def _run_discovery(regions_: List[str], category: str, max_per_region: int):
    state = ScanState(
        is_running=True,
        started_at=datetime.now(timezone.utc).isoformat(),
        message=f"Scanning {', '.join(regions_)} for '{category}'",
    )
    await _save_scan_state(state)
    total_found = 0
    total_open = 0
    try:
        async with httpx.AsyncClient(headers=HEADERS_DESKTOP, follow_redirects=True) as c:
            for r in regions_:
                state.message = f"Searching {r}…"
                await _save_scan_state(state)
                f, o = await _discover_for_region(c, r, category, max_per_region)
                total_found += f
                total_open += o
                state.found_count = total_found
                state.open_count = total_open
                await _save_scan_state(state)
    except Exception as e:
        log.exception("discovery failed")
        state.message = f"Error: {e}"
    state.is_running = False
    state.finished_at = datetime.now(timezone.utc).isoformat()
    state.message = f"Scan finished — {total_open} new groups (of {total_found} candidates)"
    await _save_scan_state(state)


# ---------- Routes ----------
@api.get("/")
async def root():
    return {"service": "WhatsApp Jobs Group Finder", "status": "ok"}


@api.get("/regions")
async def regions():
    return {"regions": REGIONS}


@api.get("/groups", response_model=List[WhatsAppGroup])
async def list_groups(region: Optional[str] = None, limit: int = 200):
    q: dict = {"status": "open"}
    if region and region.lower() != "all":
        q["region"] = region
    docs = await db.groups.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [WhatsAppGroup(**d) for d in docs]


@api.get("/groups/stats")
async def stats():
    total_open = await db.groups.count_documents({"status": "open"})
    per_region = {}
    for r in REGIONS:
        per_region[r] = await db.groups.count_documents({"status": "open", "region": r})
    scan = await _get_scan_state()
    return {
        "total_open": total_open,
        "per_region": per_region,
        "last_scan_finished_at": scan.finished_at,
        "is_scanning": scan.is_running,
    }


@api.get("/scan/status", response_model=ScanState)
async def scan_status():
    return await _get_scan_state()


@api.post("/groups/discover")
async def discover(req: DiscoverReq, bg: BackgroundTasks):
    regions_ = req.regions or REGIONS
    invalid = [r for r in regions_ if r not in REGIONS]
    if invalid:
        raise HTTPException(400, f"Unknown regions: {invalid}")
    state = await _get_scan_state()
    if state.is_running:
        return {"status": "already_running", "scan": state.model_dump()}
    bg.add_task(_run_discovery, regions_, req.category, max(3, min(req.max_per_region, 30)))
    return {"status": "started", "regions": regions_, "category": req.category}


@api.post("/groups/submit", response_model=WhatsAppGroup)
async def submit_group(req: SubmitGroupReq):
    code = _extract_invite_code(req.invite_link)
    if not code:
        raise HTTPException(400, "Not a valid chat.whatsapp.com invite link")
    if req.region not in REGIONS:
        raise HTTPException(400, f"Region must be one of {REGIONS}")
    async with httpx.AsyncClient(headers=HEADERS_DESKTOP, follow_redirects=True) as c:
        meta = await fetch_invite_meta(c, code)
    if not meta["valid"]:
        raise HTTPException(400, "Could not reach WhatsApp invite preview")
    grp = WhatsAppGroup(
        name=meta["name"] or "WhatsApp Group",
        invite_link=meta["url"],
        invite_code=code,
        region=req.region,
        category="jobs",
        status="open",
        description=meta["description"],
        discovered_via="user",
    )
    await _persist_group(grp)
    saved = await db.groups.find_one({"invite_code": code}, {"_id": 0})
    return WhatsAppGroup(**saved)


@api.post("/groups/{group_id}/report")
async def report(group_id: str, req: ReportReq):
    doc = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Group not found")
    field = {"works": "reports_works", "approval": "reports_approval", "invalid": "reports_invalid"}[req.kind]
    new_val = (doc.get(field, 0) or 0) + 1
    update = {field: new_val, "last_checked": datetime.now(timezone.utc).isoformat()}
    # Hide group if ≥2 approval or invalid reports
    approval = doc.get("reports_approval", 0) + (1 if req.kind == "approval" else 0)
    invalid_ = doc.get("reports_invalid", 0) + (1 if req.kind == "invalid" else 0)
    if approval >= 2 or invalid_ >= 2:
        update["status"] = "hidden" if approval >= 2 else "invalid"
    await db.groups.update_one({"id": group_id}, {"$set": update})
    return {"ok": True, **update}


# ---------- Mount ----------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def _close_db():
    client.close()
