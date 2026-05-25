"""
apply_reports.py — runs in GitHub Actions whenever an issue with label
'submit' or 'report' is opened. Reads the issue body, applies the action
to docs/data/groups.json, then commits + closes the issue.

Authentication: uses GITHUB_TOKEN env var (provided by Actions).
"""
from __future__ import annotations
import asyncio
import os
import re
import sys
from typing import Optional

import httpx

from lib import (
    REGIONS, extract_invite_code, fetch_invite_meta, find_group, http_client,
    load_groups, make_group, now_iso, save_groups, upsert_group,
)

GITHUB_API = "https://api.github.com"
HIDE_THRESHOLD = 2
VERIFY_THRESHOLD = 2

# Issue body markers:
KV_RE = re.compile(r"^[-*]\s*([a-zA-Z_]+)\s*:\s*(.+?)\s*$", re.MULTILINE)


def parse_issue_body(body: str) -> dict:
    return {m.group(1).lower(): m.group(2).strip() for m in KV_RE.finditer(body or "")}


# ---------- GitHub API ----------
class GH:
    def __init__(self, token: str, repo: str):
        self.token = token
        self.repo = repo  # "owner/name"
        self.h = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "wa-jobs-bot",
        }

    async def list_open_issues(self, c: httpx.AsyncClient, labels: str) -> list[dict]:
        r = await c.get(
            f"{GITHUB_API}/repos/{self.repo}/issues",
            params={"state": "open", "labels": labels, "per_page": 100},
            headers=self.h, timeout=30.0,
        )
        r.raise_for_status()
        return [i for i in r.json() if "pull_request" not in i]

    async def comment(self, c: httpx.AsyncClient, issue_number: int, body: str):
        await c.post(
            f"{GITHUB_API}/repos/{self.repo}/issues/{issue_number}/comments",
            headers=self.h, json={"body": body}, timeout=30.0,
        )

    async def close(self, c: httpx.AsyncClient, issue_number: int, reason: str = "completed"):
        await c.patch(
            f"{GITHUB_API}/repos/{self.repo}/issues/{issue_number}",
            headers=self.h, json={"state": "closed", "state_reason": reason},
            timeout=30.0,
        )

    async def add_label(self, c: httpx.AsyncClient, issue_number: int, labels: list[str]):
        await c.post(
            f"{GITHUB_API}/repos/{self.repo}/issues/{issue_number}/labels",
            headers=self.h, json={"labels": labels}, timeout=30.0,
        )


# ---------- Handlers ----------
async def handle_submit(c, gh: GH, issue: dict, groups: list[dict]) -> tuple[bool, str]:
    kv = parse_issue_body(issue.get("body") or "")
    link = kv.get("link", "")
    region = kv.get("region", "")
    if region not in REGIONS:
        return False, f"Region must be one of {REGIONS} (got '{region}')."
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
        return False, "Could not reach the WhatsApp invite preview. Try again later."
    grp = make_group(
        name=meta["name"] or "WhatsApp Group",
        invite_link=meta["url"],
        invite_code=code,
        region=region,
        description=meta["description"],
        source_url=issue.get("html_url"),
        discovered_via="user",
    )
    upsert_group(groups, grp)
    return True, f"Added **{grp['name']}** ({region}) to the directory."


async def handle_report(c, gh: GH, issue: dict, groups: list[dict]) -> tuple[bool, str]:
    kv = parse_issue_body(issue.get("body") or "")
    kind = kv.get("kind") or _kind_from_title(issue.get("title", ""))
    if kind not in {"works", "approval", "invalid"}:
        return False, f"Unknown report kind: {kind!r}."
    group_id = kv.get("group_id")
    g = find_group(groups, group_id=group_id) if group_id else None
    if g is None:
        return False, f"Group not found for id={group_id!r}."
    field = {"works": "reports_works", "approval": "reports_approval", "invalid": "reports_invalid"}[kind]
    g[field] = (g.get(field, 0) or 0) + 1
    g["last_checked"] = now_iso()
    if g.get("reports_approval", 0) >= HIDE_THRESHOLD:
        g["status"] = "hidden"
        return True, f"Counted '{kind}'. Group hidden (≥{HIDE_THRESHOLD} approval reports)."
    if g.get("reports_invalid", 0) >= HIDE_THRESHOLD:
        g["status"] = "invalid"
        return True, f"Counted '{kind}'. Group marked invalid (≥{HIDE_THRESHOLD} invalid reports)."
    return True, f"Counted '{kind}'. Current tally → works:{g['reports_works']} approval:{g['reports_approval']} invalid:{g['reports_invalid']}"


def _kind_from_title(title: str) -> Optional[str]:
    m = re.search(r"\[report:(works|approval|invalid)\]", title)
    return m.group(1) if m else None


# ---------- Main ----------
async def process_issues():
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")  # "owner/name"
    if not token or not repo:
        print("Missing GITHUB_TOKEN / GITHUB_REPOSITORY env. Exiting.", file=sys.stderr)
        sys.exit(1)

    gh = GH(token, repo)
    groups = load_groups()
    changed = False

    async with http_client() as bot_client, httpx.AsyncClient() as gh_client:
        # SUBMITS
        for issue in await gh.list_open_issues(gh_client, "submit"):
            ok, msg = await handle_submit(bot_client, gh, issue, groups)
            await gh.comment(gh_client, issue["number"], (":white_check_mark: " if ok else ":x: ") + msg)
            if ok:
                changed = True
                await gh.add_label(gh_client, issue["number"], ["processed"])
                await gh.close(gh_client, issue["number"])
            else:
                await gh.add_label(gh_client, issue["number"], ["needs-attention"])
        # REPORTS
        for issue in await gh.list_open_issues(gh_client, "report"):
            ok, msg = await handle_report(bot_client, gh, issue, groups)
            await gh.comment(gh_client, issue["number"], (":white_check_mark: " if ok else ":x: ") + msg)
            if ok:
                changed = True
                await gh.add_label(gh_client, issue["number"], ["processed"])
                await gh.close(gh_client, issue["number"])
            else:
                await gh.add_label(gh_client, issue["number"], ["needs-attention"])

    if changed:
        save_groups(groups)
        print("Applied changes to docs/data/groups.json")
    else:
        print("Nothing to do.")


if __name__ == "__main__":
    asyncio.run(process_issues())
