/* WA/Jobs — vanilla JS app. Reads JSON from this repo. No backend. */
(function () {
  "use strict";

  /* ---------------- LOCATIONS (mirrors scripts/lib.py INDIAN_LOCATIONS) ---------------- */
  const INDIAN_LOCATIONS = {
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
  };

  const ALL_LOCATIONS = (() => {
    const set = new Set();
    Object.entries(INDIAN_LOCATIONS).forEach(([s, c]) => { set.add(s); set.add(c); });
    return Array.from(set).sort();
  })();

  /* ---------------- CONFIG ---------------- */
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
  const DATA_GROUPS = "./data/groups.json";
  const DATA_STATE = "./data/scan_state.json";

  /* ---------------- STATE ---------------- */
  const state = {
    region: "all",
    openChatOnly: false,
    groups: [],
    scan: null,
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
    const el = $("#toast"); el.textContent = msg;
    el.className = isError ? "toast error" : "toast"; el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 3500);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
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
  function isVisible(g) {
    if ((g.status || "open") !== "open") return false;
    if ((g.reports_approval || 0) >= 1) return false;
    return true;
  }
  function chatModeOf(g) { return g.chat_mode || "open"; }

  function stats() {
    const visible = state.groups.filter(isVisible);
    const open = visible.filter(g => chatModeOf(g) === "open");
    const readonly = visible.filter(g => chatModeOf(g) === "readonly");
    const auto = visible.filter(g => g.discovered_via === "auto");
    const locations = new Set(visible.map(g => g.region));
    return { total: visible.length, openChat: open.length, readonly: readonly.length, auto: auto.length, locations: locations.size };
  }

  function activeRegions() {
    const seen = new Map();
    state.groups.filter(isVisible).forEach(g => seen.set(g.region, (seen.get(g.region) || 0) + 1));
    return Array.from(seen.entries()).sort((a, b) => b[1] - a[1]);
  }

  function visibleGroups() {
    let list = state.groups.filter(isVisible);
    if (state.region !== "all") list = list.filter(g => g.region === state.region);
    if (state.openChatOnly) list = list.filter(g => chatModeOf(g) === "open");
    return list;
  }

  /* ---------------- RENDER ---------------- */
  function render() {
    const s = stats();
    $("#stat-total").textContent = s.total;
    $("#stat-locations").textContent = s.locations;
    $("#stat-open-chat").textContent = s.openChat;
    $("#stat-readonly").textContent = s.readonly;
    $("#stat-auto").textContent = s.auto;
    if (state.scan && state.scan.finished_at) {
      $("#last-scan").textContent = `Last bot run: ${timeAgo(state.scan.finished_at)} · ${state.scan.message || ""}`;
    }
    renderFilters();
    renderGrid();
  }

  function renderFilters() {
    const wrap = $("#region-filters");
    const regions = activeRegions();
    const chips = [`<button class="chip" data-region="all" data-active="${state.region === "all"}">All Regions <span class="chip-count">${regions.reduce((a,[,n])=>a+n,0)}</span></button>`];
    regions.forEach(([r, n]) => {
      chips.push(`<button class="chip" data-region="${esc(r)}" data-active="${state.region === r}"><span class="dot"></span>${esc(r)} <span class="chip-count">${n}</span></button>`);
    });
    wrap.innerHTML = chips.join("");
    wrap.querySelectorAll(".chip").forEach(btn => {
      btn.addEventListener("click", () => {
        state.region = btn.dataset.region;
        renderFilters();
        renderGrid();
      });
    });
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
    const mode = chatModeOf(g);
    const isReadOnly = mode === "readonly";
    const cardCls = isReadOnly ? "card card-readonly" : "card";
    const statusHtml = isReadOnly
      ? `<span class="status readonly"><span class="dot"></span>Read-only · DM admin</span>`
      : `<span class="status"><span class="dot"></span>Open chat</span>`;
    const ctaCls = isReadOnly ? "card-cta card-cta-readonly" : "card-cta";
    const ctaText = isReadOnly ? "Open · contact admin →" : "Open in WhatsApp →";
    return `
    <article class="${cardCls}" data-id="${esc(g.id)}">
      <div class="card-head">
        <span class="label-eyebrow">${esc(g.region)}</span>
        ${statusHtml}
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
          <span class="label-eyebrow">Feedback:</span>
          <button class="chip" data-report="works"    data-id="${esc(g.id)}" data-name="${esc(g.name||"")}" title="I joined without admin approval">👍 Worked</button>
          <button class="chip" data-report="approval" data-id="${esc(g.id)}" data-name="${esc(g.name||"")}" title="Needed admin approval to join">⛔ Needed approval</button>
          <button class="chip" data-report="readonly" data-id="${esc(g.id)}" data-name="${esc(g.name||"")}" title="Only admins can send messages">🔇 Admins only</button>
          <button class="chip" data-report="invalid"  data-id="${esc(g.id)}" data-name="${esc(g.name||"")}" title="Link expired/invalid">⚠</button>
        </div>
      </div>
      <a class="${ctaCls}" href="${esc(g.invite_link)}" target="_blank" rel="noreferrer">
        ${ctaText}
      </a>
    </article>`;
  }

  function emptyHtml() {
    return `
    <div class="empty">
      <div class="label-eyebrow">No groups in this filter</div>
      <h3>The directory is empty for this view.</h3>
      <p>Pick a different region, or trigger a scan from the Locations section above.</p>
      <a class="btn btn-neon" href="#locations">Browse Locations</a>
    </div>`;
  }

  /* ---------------- LOCATIONS SECTION ---------------- */
  function renderLocationsGrid() {
    const grid = $("#locations-grid");
    const items = Object.entries(INDIAN_LOCATIONS).sort((a, b) => a[0].localeCompare(b[0]));
    grid.innerHTML = items.map(([s, c]) => `
      <div class="loc-row">
        <button class="chip chip-state" data-scan="${esc(s)}" title="Scan ${esc(s)} (state)">${esc(s)}</button>
        <button class="chip chip-capital" data-scan="${esc(c)}" title="Scan ${esc(c)} (capital)">${esc(c)}</button>
      </div>
    `).join("");
    grid.querySelectorAll("button[data-scan]").forEach(btn => {
      btn.addEventListener("click", () => openScanIssue(btn.dataset.scan));
    });
  }

  function fillDatalist() {
    $("#locations-datalist").innerHTML = ALL_LOCATIONS.map(x => `<option value="${esc(x)}">`).join("");
  }

  function openScanIssue(region) {
    const title = `[scan] ${region}`;
    const body =
`<!-- Auto-generated by the WA/Jobs site. Do not edit the lines below. -->
- kind: scan-request
- region: ${region}
- max_per_region: 12

(Optional notes…)`;
    const url = `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent("scan-request")}`;
    window.open(url, "_blank", "noopener");
    toast(`Opening GitHub issue to scan ${region}`);
  }

  /* ---------------- INTERACTIONS ---------------- */
  function bindCardActions() {
    $$('button[data-report]').forEach(btn => {
      btn.addEventListener("click", () => openReportIssue(btn));
    });
  }
  function openReportIssue(btn) {
    const id = btn.dataset.id, name = btn.dataset.name, kind = btn.dataset.report;
    const labels = { works:"Worked", approval:"Needed approval", readonly:"Only admins post (read-only)", invalid:"Invalid / expired" };
    const title = `[report:${kind}] ${name || id}`;
    const body =
`<!-- Auto-generated by the WA/Jobs site. Do not edit the lines below. -->
- group_id: ${id}
- kind: ${kind}
- name: ${name}
- url: ${location.href}

**Report:** ${labels[kind]}

(Add any extra notes here — optional)`;
    const url = `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent("report,"+kind)}`;
    window.open(url, "_blank", "noopener");
    toast(`Opening GitHub issue: ${labels[kind]}`);
  }

  function bindOpenChatToggle() {
    $("#open-chat-only").addEventListener("change", e => {
      state.openChatOnly = e.target.checked;
      renderGrid();
    });
  }

  function bindSubmit() {
    $("#submit-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const link = $("#submit-link").value.trim();
      const region = $("#submit-region-input").value.trim();
      if (!/^https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{18,30}/.test(link)) {
        toast("Please paste a valid chat.whatsapp.com link", true);
        return;
      }
      if (!ALL_LOCATIONS.some(l => l.toLowerCase() === region.toLowerCase())) {
        toast("Region must be an Indian state or capital", true);
        return;
      }
      const title = `[submit] ${region} — new group`;
      const body =
`<!-- Auto-generated by the WA/Jobs submit form. Do not edit the lines below. -->
- kind: submit
- region: ${region}
- link: ${link}

(Add any extra notes — optional)`;
      const url = `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent("submit")}`;
      window.open(url, "_blank", "noopener");
      toast("Opening GitHub issue — confirm to submit");
      $("#submit-link").value = "";
    });
  }

  function bindRefresh() {
    $("#refresh-btn").addEventListener("click", () => { toast("Refreshing…"); loadData(); });
    $("#repo-link").href = REPO_URL;
  }

  function init() {
    $("#year").textContent = new Date().getFullYear();
    renderLocationsGrid();
    fillDatalist();
    bindOpenChatToggle();
    bindSubmit();
    bindRefresh();
    loadData();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
