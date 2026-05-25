"""
apply_reports.py — runs in GitHub Actions on issues. Detects the issue kind from
either the LABEL or the TITLE PREFIX (resilient to GitHub silently dropping the
`?labels=` URL param when a label doesn't exist yet). Applies the action,
commits docs/data/groups.json, and closes the issue.
"""
from __future__ import annotations
import asyncio
import os
import re
import sys
from typing import Optional

import httpx

from lib import (
    CATEGORY, extract_invite_code, fetch_invite_meta, find_group, http_client,
    load_groups, make_group, normalise_region, now_iso, save_groups,
    upsert_group,
)
import discover as discover_mod

GITHUB_API = "https://api.github.com"
HIDE_THRESHOLD = 2
READONLY_THRESHOLD = 2

KV_RE = re.compile(r"^[-*]\s*([a-zA-Z_]+)\s*:\s*(.+?)\s*$", re.MULTILINE)
REPORT_KIND_RE = re.compile(r"\[report:(works|approval|invalid|readonly)\]", re.IGNORECASE)


def parse_issue_body(body: str) -> dict:
    return {m.group(1).lower(): m.group(2).strip() for m in KV_RE.finditer(body or "")}


def detect_kind(issue: dict) -> Optional[str]:
    """Returns one of 'submit' | 'report' | 'scan-request' | None."""
    title = (issue.get("title") or "").lower()
    labels = {(lab.get("name") or "").lower() for lab in (issue.get("labels") or [])}

    if "scan-request" in labels or title.startswith("[scan]"):
        return "scan-request"
    if "submit" in labels or title.startswith("[submit]"):
        return "submit"
    if "report" in labels or title.startswith("[report:"):
        return "report"
    # body-marker fallback
    body = (issue.get("body") or "").lower()
    if "kind: scan-request" in body:
        return "scan-request"
    if "kind: submit" in body:
        return "submit"
    if "kind: works" in body or "kind: approval" in body or "kind: invalid" in body or "kind: readonly" in body:
        return "report"
    return None


def report_kind(issue: dict) -> Optional[str]:
    """Extracts works|approval|invalid|readonly from title or body."""
    m = REPORT_KIND_RE.search(issue.get("title") or "")
    if m:
        return m.group(1).lower()
    kv = parse_issue_body(issue.get("body") or "")
    k = (kv.get("kind") or "").lower()
    if k in {"works", "approval", "invalid", "readonly"}:
        return k
    return None


# ---------- GitHub API ----------
class GH:
    def __init__(self, token: str, repo: str):
        self.token = token
        self.repo = repo
        self.h = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "wa-jobs-bot",
        }

    async def list_all_open_issues(self, c) -> list[dict]:
        out: list[dict] = []
        page = 1
        while True:
            r = await c.get(
                f"{GITHUB_API}/repos/{self.repo}/issues",
                params={"state": "open", "per_page": 100, "page": page},
                headers=self.h, timeout=30.0,
            )
            r.raise_for_status()
            batch = [i for i in r.json() if "pull_request" not in i]
            out.extend(batch)
            if len(batch) < 100:
                break
            page += 1
        return out

    async def comment(self, c, issue_number: int, body: str):
        await c.post(
            f"{GITHUB_API}/repos/{self.repo}/issues/{issue_number}/comments",
            headers=self.h, json={"body": body}, timeout=30.0,
        )

    async def close(self, c, issue_number: int, reason: str = "completed"):
        await c.patch(
            f"{GITHUB_API}/repos/{self.repo}/issues/{issue_number}",
            headers=self.h, json={"state": "closed", "state_reason": reason},
            timeout=30.0,
        )

    async def add_labels(self, c, issue_number: int, labels: list[str]):
        await c.post(
            f"{GITHUB_API}/repos/{self.repo}/issues/{issue_number}/labels",
            headers=self.h, json={"labels": labels}, timeout=30.0,
        )


# ---------- Handlers ----------
async def handle_submit(c, issue: dict, groups: list[dict]) -> tuple[bool, str]:
    kv = parse_issue_body(issue.get("body") or "")
    link = kv.get("link", "")
    region = normalise_region(kv.get("region", ""))
    if not region:
        return False, "Region must be an Indian state or capital."
    category = kv.get("category", "jobs").strip().lower()
    if category not in {"jobs", "societies"}:
        category = "jobs"
    code = extract_invite_code(link)
    if not code:
        return False, f"Not a valid chat.whatsapp.com invite link: {link!r}"
    existing = find_group(groups, invite_code=code)
    if existing:
        if existing.get("status") != "open":
            existing["status"] = "open"
            existing["last_checked"] = now_iso()
        return True, f"Already in directory: **{existing.get('name','(unknown)')}** — re-opened if hidden."
    meta = await fetch_invite_meta(c, code)
    if not meta["valid"]:
        return False, "Could not reach the WhatsApp invite preview."
    grp = make_group(
        name=meta["name"] or "WhatsApp Group",
        invite_link=meta["url"],
        invite_code=code,
        region=region,
        description=meta["description"],
        source_url=issue.get("html_url"),
        discovered_via="user",
        category=category,
    )
    upsert_group(groups, grp)
    return True, f"Added **{grp['name']}** ({region}) to the directory."


async def handle_report(issue: dict, groups: list[dict]) -> tuple[bool, str]:
    kind = report_kind(issue)
    if kind not in {"works", "approval", "invalid", "readonly"}:
        return False, f"Unknown report kind: {kind!r}."
    kv = parse_issue_body(issue.get("body") or "")
    group_id = kv.get("group_id")
    g = find_group(groups, group_id=group_id) if group_id else None
    if g is None:
        return False, f"Group not found for id={group_id!r}."
    field = {
        "works": "reports_works",
        "approval": "reports_approval",
        "invalid": "reports_invalid",
        "readonly": "reports_readonly",
    }[kind]
    g.setdefault("reports_readonly", 0)
    g.setdefault("chat_mode", "open")
    g[field] = (g.get(field, 0) or 0) + 1
    g["last_checked"] = now_iso()

    if g.get("reports_approval", 0) >= HIDE_THRESHOLD:
        g["status"] = "hidden"
        return True, f"Counted '{kind}'. Group **hidden** (≥{HIDE_THRESHOLD} approval reports)."
    if g.get("reports_invalid", 0) >= HIDE_THRESHOLD:
        g["status"] = "invalid"
        return True, f"Counted '{kind}'. Group marked **invalid** (≥{HIDE_THRESHOLD} invalid reports)."
    if g.get("reports_readonly", 0) >= READONLY_THRESHOLD and g.get("chat_mode") != "readonly":
        g["chat_mode"] = "readonly"
        return True, f"Counted '{kind}'. Group flagged as **read-only** but stays visible so users can DM the admin."
    return True, (
        f"Counted '{kind}'. Tally → works:{g['reports_works']} "
        f"approval:{g['reports_approval']} invalid:{g['reports_invalid']} "
        f"readonly:{g.get('reports_readonly', 0)}"
    )


async def handle_scan_request(c, issue: dict, groups: list[dict]) -> tuple[bool, str]:
    # Region can come from the structured kv block, OR fall back to the title `[scan] <name>`.
    kv = parse_issue_body(issue.get("body") or "")
    region_raw = kv.get("region") or ""
    if not region_raw:
        title = issue.get("title") or ""
        m = re.match(r"\[scan\]\s*(.+)", title, re.IGNORECASE)
        if m:
            region_raw = m.group(1).strip()
    region = normalise_region(region_raw)
    if not region:
        return False, f"Region {region_raw!r} is not a recognised Indian state or capital."
    category = kv.get("category", "jobs").strip().lower()
    if category not in {"jobs", "societies"}:
        category = "jobs"
    try:
        max_per = max(3, min(int(kv.get("max_per_region", "12") or 12), 30))
    except ValueError:
        max_per = 12
    found, added = await discover_mod.discover_region(c, region, category, max_per, groups)
    return True, f"Scanned **{region}** — {added} new groups added (of {found} candidates)."


# ---------- Main ----------
async def process_issues():
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")
    if not token or not repo:
        print("Missing GITHUB_TOKEN / GITHUB_REPOSITORY env.", file=sys.stderr)
        sys.exit(1)

    gh = GH(token, repo)
    groups = load_groups()
    changed = False

    async with http_client() as bot, httpx.AsyncClient() as gh_c:
        all_issues = await gh.list_all_open_issues(gh_c)
        # Skip already-processed issues
        pending = []
        for i in all_issues:
            labels = {(lab.get("name") or "").lower() for lab in (i.get("labels") or [])}
            if "processed" in labels:
                continue
            pending.append(i)

        print(f"Found {len(pending)} pending open issue(s).")

        for issue in pending:
            kind = detect_kind(issue)
            if not kind:
                continue
            try:
                if kind == "submit":
                    ok, msg = await handle_submit(bot, issue, groups)
                    issue_label = "submit"
                elif kind == "report":
                    ok, msg = await handle_report(issue, groups)
                    issue_label = "report"
                elif kind == "scan-request":
                    ok, msg = await handle_scan_request(bot, issue, groups)
                    issue_label = "scan-request"
                else:
                    continue
            except Exception as e:
                ok, msg, issue_label = False, f"Bot error: {e!r}", "needs-attention"

            await gh.comment(gh_c, issue["number"],
                             (":white_check_mark: " if ok else ":x: ") + msg)

            # Ensure the issue carries the canonical kind label + status label.
            try:
                await gh.add_labels(
                    gh_c, issue["number"],
                    [issue_label, "processed" if ok else "needs-attention"],
                )
            except Exception as e:
                print(f"label add failed for #{issue['number']}: {e}")

            if ok:
                changed = True
                try:
                    await gh.close(gh_c, issue["number"])
                except Exception as e:
                    print(f"close failed for #{issue['number']}: {e}")

    if changed:
        save_groups(groups)
        print("Applied changes to docs/data/groups.json")
    else:
        print("Nothing to commit.")


if __name__ == "__main__":
    asyncio.run(process_issues())
