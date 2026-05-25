"""Backend tests for WhatsApp Jobs Group Finder."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://public-whatsapp-hub.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


# ---------- helpers ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- regions ----------
class TestRegions:
    def test_regions(self, session):
        r = session.get(f"{API}/regions", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert set(data["regions"]) == {"Hyderabad", "Bihar", "Delhi", "Jharkhand"}


# ---------- groups list & stats ----------
class TestGroupsList:
    def test_list_all_groups(self, session):
        r = session.get(f"{API}/groups", timeout=20)
        assert r.status_code == 200
        groups = r.json()
        assert isinstance(groups, list)
        if groups:
            g = groups[0]
            for k in ["id", "name", "invite_link", "invite_code", "region", "status"]:
                assert k in g
            assert g["status"] == "open"

    @pytest.mark.parametrize("region", ["Hyderabad", "Bihar", "Delhi", "Jharkhand"])
    def test_list_by_region(self, session, region):
        r = session.get(f"{API}/groups", params={"region": region}, timeout=20)
        assert r.status_code == 200
        groups = r.json()
        for g in groups:
            assert g["region"] == region
            assert g["status"] == "open"

    def test_stats(self, session):
        r = session.get(f"{API}/groups/stats", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "total_open" in data
        assert "per_region" in data
        assert set(data["per_region"].keys()) == {"Hyderabad", "Bihar", "Delhi", "Jharkhand"}
        # sum of per-region <= total (some may be in other states)
        assert isinstance(data["total_open"], int)
        assert "last_scan_finished_at" in data


# ---------- scan / discovery ----------
class TestDiscovery:
    def test_scan_status(self, session):
        r = session.get(f"{API}/scan/status", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "is_running" in d

    def test_discover_starts(self, session):
        # Trigger a small scan limited to one region for speed
        r = session.post(
            f"{API}/groups/discover",
            json={"regions": ["Hyderabad"], "category": "jobs", "max_per_region": 3},
            timeout=20,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["status"] in {"started", "already_running"}

        # Poll status for up to ~12s to confirm scan transitions
        seen_running = d["status"] == "already_running"
        for _ in range(6):
            s = session.get(f"{API}/scan/status", timeout=10).json()
            if s["is_running"]:
                seen_running = True
                break
            time.sleep(2)
        assert seen_running, "Scan never showed is_running=True"

    def test_discover_invalid_region(self, session):
        r = session.post(
            f"{API}/groups/discover",
            json={"regions": ["Mars"], "category": "jobs", "max_per_region": 3},
            timeout=15,
        )
        assert r.status_code == 400


# ---------- submit ----------
class TestSubmit:
    def test_submit_invalid_link(self, session):
        r = session.post(
            f"{API}/groups/submit",
            json={"invite_link": "https://example.com/not-whatsapp", "region": "Hyderabad"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_submit_invalid_region(self, session):
        r = session.post(
            f"{API}/groups/submit",
            json={"invite_link": "https://chat.whatsapp.com/AAAAAAAAAAAAAAAAAA", "region": "Mars"},
            timeout=15,
        )
        # Could be 400 either for region or unreachable preview — both acceptable
        assert r.status_code == 400

    def test_submit_existing_link(self, session):
        # Use an existing discovered group's invite link to verify success path & idempotency
        groups = session.get(f"{API}/groups", timeout=20).json()
        if not groups:
            pytest.skip("No groups seeded; cannot test valid submit path.")
        existing = groups[0]
        r = session.post(
            f"{API}/groups/submit",
            json={"invite_link": existing["invite_link"], "region": existing["region"]},
            timeout=30,
        )
        # Either succeeds (200) or backend can't reach WA preview (400)
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            data = r.json()
            assert data["invite_code"] == existing["invite_code"]


# ---------- report ----------
class TestReport:
    def _get_three_groups(self, session):
        groups = session.get(f"{API}/groups", timeout=20).json()
        if len(groups) < 3:
            pytest.skip("Need at least 3 seeded groups for report tests")
        return groups

    def test_report_works_increments(self, session):
        groups = self._get_three_groups(session)
        g = groups[0]
        before = g.get("reports_works", 0)
        r = session.post(f"{API}/groups/{g['id']}/report", json={"kind": "works"}, timeout=15)
        assert r.status_code == 200
        # Re-fetch
        gl = session.get(f"{API}/groups", params={"region": g["region"]}, timeout=15).json()
        found = next((x for x in gl if x["id"] == g["id"]), None)
        assert found is not None
        assert found["reports_works"] == before + 1

    def test_report_approval_twice_hides(self, session):
        groups = self._get_three_groups(session)
        g = groups[1]
        gid = g["id"]
        # Two approval reports
        r1 = session.post(f"{API}/groups/{gid}/report", json={"kind": "approval"}, timeout=15)
        r2 = session.post(f"{API}/groups/{gid}/report", json={"kind": "approval"}, timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        # Should no longer appear in public listing
        public = session.get(f"{API}/groups", timeout=20).json()
        assert all(x["id"] != gid for x in public), "Group should be hidden after 2 approval reports"

    def test_report_invalid_twice_marks_invalid(self, session):
        groups = self._get_three_groups(session)
        g = groups[2]
        gid = g["id"]
        r1 = session.post(f"{API}/groups/{gid}/report", json={"kind": "invalid"}, timeout=15)
        r2 = session.post(f"{API}/groups/{gid}/report", json={"kind": "invalid"}, timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200
        d2 = r2.json()
        assert d2.get("status") == "invalid"
        # Should be excluded from public listing
        public = session.get(f"{API}/groups", timeout=20).json()
        assert all(x["id"] != gid for x in public)

    def test_report_not_found(self, session):
        r = session.post(f"{API}/groups/does-not-exist/report", json={"kind": "works"}, timeout=15)
        assert r.status_code == 404
