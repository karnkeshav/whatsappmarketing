"""
Discovery bot — runs in GitHub Actions or locally.
Accepts any Indian state, capital or major district as a region.
Supports per-category search (jobs / societies / education / …).
Skips groups whose name suggests admin-approval / read-only via heuristic.
"""
from __future__ import annotations
import argparse
import asyncio
from typing import Iterable, Optional

from lib import (
    DEFAULT_CATEGORY, DEFAULT_REGIONS, DISTRICT_TO_STATE, INDIAN_LOCATIONS,
    category_query, extract_codes, fetch, fetch_invite_meta, http_client,
    load_groups, looks_admin_restricted, make_group, normalise_category,
    normalise_region, now_iso, save_groups, save_state, startpage_search,
    upsert_group,
)

QUERIES = [
    '"chat.whatsapp.com" {cq} {region} group link',
    'whatsapp group link {cq} {region} 2025',
    '{region} {cq} whatsapp group join',
]


def build_query_terms(region: str, category_value: str) -> list[str]:
    cq = category_query(category_value)
    # If region is a district, also include its parent state in the query for richer results.
    parent = DISTRICT_TO_STATE.get(region)
    base = region if not parent else f"{region} {parent}"
    return [t.format(cq=cq, region=base) for t in QUERIES]


async def collect_candidate_pages(c, region: str, category_value: str) -> list[str]:
    out: list[str] = []
    for q in build_query_terms(region, category_value):
        out.extend(await startpage_search(c, q))
        await asyncio.sleep(1.0)
        if len(out) >= 40:
            break
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
    c, codes, region: str, category_value: str, groups: list[dict]
) -> tuple[int, int]:
    """Returns (added, skipped_admin)."""
    added = 0
    skipped = 0
    for code, src in codes:
        meta = await fetch_invite_meta(c, code)
        if not meta["valid"]:
            continue
        name = meta["name"] or f"{category_value.title()} group — {region}"
        # Heuristic skip: if name screams admin-only, don't add it.
        if looks_admin_restricted(name) or looks_admin_restricted(meta.get("description") or ""):
            skipped += 1
            await asyncio.sleep(0.15)
            continue
        grp = make_group(
            name=name,
            invite_link=meta["url"],
            invite_code=code,
            region=region,
            category=category_value,
            description=meta["description"],
            source_url=src,
            discovered_via="auto",
        )
        if upsert_group(groups, grp):
            added += 1
        await asyncio.sleep(0.2)
    return added, skipped


async def discover_region(
    c, region: str, category_value: str, max_per_region: int, groups: list[dict]
) -> tuple[int, int, int]:
    """Returns (candidates_found, groups_added, skipped_admin_heuristic)."""
    category_value = normalise_category(category_value)
    pages = await collect_candidate_pages(c, region, category_value)
    discovered = await extract_codes_from_pages(c, pages, cap=max_per_region * 3)
    added, skipped = await persist_discovered(
        c, list(discovered.items())[: max_per_region * 2], region, category_value, groups
    )
    return len(discovered), added, skipped


async def main(regions: list[str], category_value: str, max_per_region: int):
    groups = load_groups()
    state = {
        "is_running": True,
        "started_at": now_iso(),
        "finished_at": None,
        "found_count": 0,
        "open_count": 0,
        "skipped_count": 0,
        "category": category_value,
        "message": f"Scanning {', '.join(regions)} · category={category_value}",
    }
    save_state(state)

    total_found = total_added = total_skipped = 0
    try:
        async with http_client() as c:
            for r in regions:
                state["message"] = f"Searching {r} ({category_value})…"
                save_state(state)
                f, a, s = await discover_region(c, r, category_value, max_per_region, groups)
                total_found += f
                total_added += a
                total_skipped += s
                state["found_count"] = total_found
                state["open_count"] = total_added
                state["skipped_count"] = total_skipped
                save_state(state)
                save_groups(groups)
    finally:
        state["is_running"] = False
        state["finished_at"] = now_iso()
        state["message"] = (
            f"Scan finished — {total_added} added · {total_skipped} admin-restricted skipped · "
            f"{total_found} candidates"
        )
        save_state(state)
        save_groups(groups)
    print(state["message"])


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--regions", default=",".join(DEFAULT_REGIONS))
    p.add_argument("--category", default=DEFAULT_CATEGORY)
    p.add_argument("--max-per-region", type=int, default=12)
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    raw = [r.strip() for r in args.regions.split(",") if r.strip()]
    regions: list[str] = []
    unknown: list[str] = []
    for r in raw:
        canon = normalise_region(r)
        if canon:
            regions.append(canon)
        else:
            unknown.append(r)
    if unknown:
        raise SystemExit(
            f"Unknown locations: {unknown}. Must be an Indian state, capital or district. "
            f"See scripts/lib.py."
        )
    if not regions:
        raise SystemExit("No regions to scan.")
    asyncio.run(main(regions, normalise_category(args.category),
                     max(3, min(args.max_per_region, 30))))
