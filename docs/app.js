/* WA/Jobs — vanilla JS app. Reads JSON from this repo. No backend. */
(function () {
  "use strict";

  /* ---------------- CONFIG ---------------- */
  // Auto-detect repo from current GitHub Pages URL (e.g. https://karnkeshav.github.io/whatsappmarketing/)
  // Falls back to default if running locally.
  const DEFAULT_REPO = { owner: "karnkeshav", name: "whatsappmarketing", branch: "main" };
  const REPO = (function () {
    const host = location.hostname;
    const parts = location.pathname.split("/").filter(Boolean);
    if (host.endsWith(".github.io") && parts.length > 0) {
      return { owner: host.split(".")[0], name: parts[0], branch: "main" };
    }
    return DEFAULT_REPO;
  })();
  const REPO_URL = `https://github.com/${REPO.owner}/${REPO.name}`;
  // When served by GitHub Pages, ./data is the same site → no CORS issue. Locally too.
  const DATA_GROUPS = "./data/groups.json";
  const DATA_STATE = "./data/scan_state.json";

  /* ---------------- STATE ---------------- */
  const state = {
    region: "all",
    groups: [],
    scan: null,
    submitRegion: "Hyderabad",
  };

  /* ---------------- HELPERS ---------------- */
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  function timeAgo(iso) {
    if (!iso) return "—";
    const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60); if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60); if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  }

  function toast(msg, isError) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = isError ? "toast error" : "toast";
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 3500);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------------- DATA LOADING ---------------- */
  async function fetchJson(url) {
    const r = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  }

  async function loadData() {
    try {
      const [groups, scan] = await Promise.all([
        fetchJson(DATA_GROUPS).catch(() => []),
        fetchJson(DATA_STATE).catch(() => null),
      ]);
      state.groups = Array.isArray(groups) ? groups : [];
      state.scan = scan;
    } catch (e) {
      console.error("load fail", e);
      state.groups = [];
    }
    render();
  }

  /* ---------------- STATS / FILTER ---------------- */
  function stats() {
    const open = state.groups.filter(g => (g.status || "open") === "open");
    const per = { Hyderabad: 0, Bihar: 0, Delhi: 0, Jharkhand: 0 };
    for (const g of open) if (per[g.region] != null) per[g.region]++;
    return { total: open.length, per };
  }

  function visibleGroups() {
    const list = state.groups.filter(g => (g.status || "open") === "open");
    if (state.region === "all") return list;
    return list.filter(g => g.region === state.region);
  }

  /* ---------------- RENDER ---------------- */
  function render() {
    const s = stats();
    $("#stat-total").textContent = s.total;
    $("#stat-hyderabad").textContent = s.per.Hyderabad;
    $("#stat-delhi").textContent = s.per.Delhi;
    $("#stat-bihar").textContent = s.per.Bihar;
    $("#stat-jharkhand").textContent = s.per.Jharkhand;

    if (state.scan && state.scan.finished_at) {
      $("#last-scan").textContent = `Last bot run: ${timeAgo(state.scan.finished_at)} · ${state.scan.message || ""}`;
    }
    renderGrid();
  }

  function renderGrid() {
    const list = visibleGroups();
    const grid = $("#groups-grid");
    if (list.length === 0) {
      grid.innerHTML = emptyHtml();
      return;
    }
    grid.innerHTML = list.map(cardHtml).join("");
    bindCardActions();
  }

  function cardHtml(g) {
    const works = g.reports_works || 0;
    const verified = works > 0 ? `${works} confirmed` : "Unverified";
    const src = g.discovered_via === "user" ? "Submitted" : "Auto-found";
    return `
    <article class="card" data-id="${esc(g.id)}">
      <div class="card-head">
        <span class="label-eyebrow">${esc(g.region)}</span>
        <span class="status"><span class="dot"></span>Open</span>
      </div>
      <div class="card-body">
        <h3 class="card-name">${esc(g.name || "WhatsApp Group")}</h3>
        <p class="card-desc">${esc(g.description || "Public WhatsApp group")}</p>
        <div class="card-meta">
          <span class="pill">✓ ${esc(verified)}</span>
          <span class="pill">⏱ ${esc(timeAgo(g.last_checked))}</span>
          <span class="pill">${esc(src)}</span>
        </div>
        <div class="card-actions">
          <span class="label-eyebrow">Did it work?</span>
          <button class="chip" data-report="works"   data-id="${esc(g.id)}" data-name="${esc(g.name||"")}" title="I joined without admin approval">👍 Yes</button>
          <button class="chip" data-report="approval" data-id="${esc(g.id)}" data-name="${esc(g.name||"")}" title="Needed admin approval">👎 Needed approval</button>
          <button class="chip" data-report="invalid"  data-id="${esc(g.id)}" data-name="${esc(g.name||"")}" title="Link expired/invalid">⚠</button>
        </div>
      </div>
      <a class="card-cta" href="${esc(g.invite_link)}" target="_blank" rel="noreferrer">
        Open in WhatsApp →
      </a>
    </article>`;
  }

  function emptyHtml() {
    return `
    <div class="empty">
      <div class="label-eyebrow">No groups yet</div>
      <h3>The directory is empty.</h3>
      <p>Trigger the GitHub Action to scan, or submit a group below.</p>
      <a class="btn btn-neon" href="${REPO_URL}/actions/workflows/discover.yml" target="_blank" rel="noreferrer">Trigger Discovery Action</a>
    </div>`;
  }

  /* ---------------- INTERACTIONS ---------------- */
  function bindCardActions() {
    $$('button[data-report]').forEach(btn => {
      btn.addEventListener("click", () => openReportIssue(btn));
    });
  }

  function openReportIssue(btn) {
    const id = btn.dataset.id;
    const name = btn.dataset.name;
    const kind = btn.dataset.report;
    const kindLabel = kind === "works" ? "Worked" : kind === "approval" ? "Needed admin approval" : "Invalid / expired";
    const title = `[report:${kind}] ${name || id}`;
    const body =
`<!-- This issue was auto-generated by the WA/Jobs site. Do not edit the lines below. -->
- group_id: ${id}
- kind: ${kind}
- name: ${name}
- url: ${location.href}

**Report:** ${kindLabel}

(Add any extra notes here — optional)`;
    const url = `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent("report,"+kind)}`;
    window.open(url, "_blank", "noopener");
    toast(`Opening GitHub issue: ${kindLabel}`);
  }

  function bindFilters() {
    $$("#region-filters .chip").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#region-filters .chip").forEach(b => b.dataset.active = "false");
        btn.dataset.active = "true";
        state.region = btn.dataset.region;
        renderGrid();
      });
    });
  }

  function bindSubmit() {
    $$("#submit-regions .chip").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#submit-regions .chip").forEach(b => b.dataset.active = "false");
        btn.dataset.active = "true";
        state.submitRegion = btn.dataset.region;
      });
    });
    $("#submit-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const link = $("#submit-link").value.trim();
      if (!/^https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{18,30}/.test(link)) {
        toast("Please paste a valid chat.whatsapp.com link", true);
        return;
      }
      const title = `[submit] ${state.submitRegion} — new group`;
      const body =
`<!-- This issue was auto-generated by the WA/Jobs submit form. Do not edit the lines below. -->
- kind: submit
- region: ${state.submitRegion}
- link: ${link}

(Add any extra notes — optional)`;
      const url = `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent("submit")}`;
      window.open(url, "_blank", "noopener");
      toast("Opening GitHub issue — confirm to submit");
      $("#submit-link").value = "";
    });
  }

  function bindScanBtn() {
    const triggerUrl = `${REPO_URL}/actions/workflows/discover.yml`;
    $("#trigger-scan").href = triggerUrl;
    $("#repo-link").href = REPO_URL;
  }

  function bindRefresh() {
    $("#refresh-btn").addEventListener("click", () => {
      toast("Refreshing…");
      loadData();
    });
  }

  /* ---------------- INIT ---------------- */
  function init() {
    $("#year").textContent = new Date().getFullYear();
    bindFilters();
    bindSubmit();
    bindScanBtn();
    bindRefresh();
    loadData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
