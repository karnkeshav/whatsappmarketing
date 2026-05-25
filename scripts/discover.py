"""
Discovery bot — runs in GitHub Actions.
Searches the public web for chat.whatsapp.com invite links for each region,
validates that the invite is reachable, and appends new ones to docs/data/groups.json.
"""
from __future__ import annotations
import argparse
import asyncio
import os
from typing import Iterable

from lib import (
    CATEGORY, REGIONS, extract_codes, fetch, fetch_invite_meta,
    http_client, load_groups, load_state, make_group, now_iso,
    save_groups, save_state, startpage_search, upsert_group,
)

QUERIES = [
    '"chat.whatsapp.com" {category} {region} group link',
    'whatsapp group link {category} {region} 2025',
    '{region} {category} whatsapp group join',
]


async def collect_candidate_pages(c, region: str, category: str) -> list[str]:
    out: list[str] = []
    for tmpl in QUERIES:
        q = tmpl.format(region=region, category=category)
        out.extend(await startpage_search(c, q))
        await asyncio.sleep(1.0)
        if len(out) >= 40:
            break
    # dedupe preserving order
    return list(dict.fromkeys(out))


async def extract_codes_from_pages(c, pages: Iterable[str], cap: int) -> dict[str, str]:
    discovered: dict[str, str] = {}
    for url in list(pages)[:25]:
        html = await fetch(c, url)
        if not html:
            continue
        for code in extract_codes(html):
            discovered.setdefault(code, url)
        if len(discovered) >= cap:
            break
        await asyncio.sleep(0.4)
    return discovered


async def persist_discovered(
    c, codes: list[tuple[str, str]], region: str, category: str, groups: list[dict]
) -> int:
    added = 0
    for code, src in codes:
        meta = await fetch_invite_meta(c, code)
        if not meta["valid"]:
            continue
        grp = make_group(
            name=meta["name"] or f"{category.title()} group — {region}",
            invite_link=meta["url"],
            invite_code=code,
            region=region,
            description=meta["description"],
            source_url=src,
            discovered_via="auto",
        )
        if upsert_group(groups, grp):
            added += 1
        await asyncio.sleep(0.2)
    return added


async def discover_region(c, region: str, category: str, max_per_region: int,
                          groups: list[dict]) -> tuple[int, int]:
    pages = await collect_candidate_pages(c, region, category)
    discovered = await extract_codes_from_pages(c, pages, cap=max_per_region * 2)
    added = await persist_discovered(
        c, list(discovered.items())[:max_per_region], region, category, groups
    )
    return len(discovered), added


async def main(regions: list[str], category: str, max_per_region: int):
    groups = load_groups()
    state = {
        "is_running": True,
        "started_at": now_iso(),
        "finished_at": None,
        "found_count": 0,
        "open_count": 0,
        "message": f"Scanning {', '.join(regions)} for '{category}'",
    }
    save_state(state)

    total_found = 0
    total_added = 0
    try:
        async with http_client() as c:
            for r in regions:
                state["message"] = f"Searching {r}…"
                save_state(state)
                f, a = await discover_region(c, r, category, max_per_region, groups)
                total_found += f
                total_added += a
                state["found_count"] = total_found
                state["open_count"] = total_added
                save_state(state)
                save_groups(groups)  # incremental save so partial progress is preserved
    finally:
        state["is_running"] = False
        state["finished_at"] = now_iso()
        state["message"] = f"Scan finished — {total_added} new groups (of {total_found} candidates)"
        save_state(state)
        save_groups(groups)

    print(f"Done. Added {total_added} new groups from {total_found} candidates.")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--regions", default=",".join(REGIONS),
                   help="Comma-separated region list (default: all)")
    p.add_argument("--category", default=CATEGORY)
    p.add_argument("--max-per-region", type=int, default=12)
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    regions = [r.strip() for r in args.regions.split(",") if r.strip()]
    invalid = [r for r in regions if r not in REGIONS]
    if invalid:
        raise SystemExit(f"Unknown regions: {invalid}. Allowed: {REGIONS}")
    asyncio.run(main(regions, args.category, max(3, min(args.max_per_region, 30))))
