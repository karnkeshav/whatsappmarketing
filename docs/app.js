/* WA/Jobs — vanilla JS app. Reads JSON from this repo. No backend. */
(function () {
  "use strict";

  /* ---------------- LOCATIONS (mirrors scripts/lib.py INDIAN_LOCATIONS) ---------------- */
  const INDIAN_LOCATIONS = {
    "Andhra Pradesh": ["Amaravati", "Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Tirupati"],
    "Arunachal Pradesh": ["Itanagar", "Tawang", "Changlang", "Ziro"],
    "Assam": ["Dispur", "Guwahati", "Dibrugarh", "Silchar", "Jorhat", "Tezpur"],
    "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga"],
    "Chhattisgarh": ["Raipur", "Bilaspur", "Durg", "Bhilai", "Bastar"],
    "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa"],
    "Gujarat": ["Gandhinagar", "Ahmedabad", "Surat", "Vadodara", "Rajkot"],
    "Haryana": ["Chandigarh", "Gurugram", "Faridabad", "Panipat", "Ambala"],
    "Himachal Pradesh": ["Shimla", "Dharamshala", "Manali", "Mandi", "Solan"],
    "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar"],
    "Karnataka": ["Bengaluru", "Mysuru", "Hubballi-Dharwad", "Mangaluru", "Belagavi"],
    "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kannur"],
    "Madhya Pradesh": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain"],
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Thane", "Nashik", "Aurangabad"],
    "Manipur": ["Imphal", "Churachandpur", "Thoubal", "Ukhrul"],
    "Meghalaya": ["Shillong", "Tura", "Jowai", "Nongpoh"],
    "Mizoram": ["Aizawl", "Lunglei", "Champhai", "Kolasib"],
    "Nagaland": ["Kohima", "Dimapur", "Mokokchung", "Wokha"],
    "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Sambalpur", "Puri"],
    "Punjab": ["Chandigarh", "Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda"],
    "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner"],
    "Sikkim": ["Gangtok", "Namchi", "Geyzing", "Mangan"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Trichy", "Salem", "Tirunelveli"],
    "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam"],
    "Tripura": ["Agartala", "Dharmanagar", "Udaipur", "Kailasahar"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Noida", "Ghaziabad", "Varanasi", "Agra", "Prayagraj"],
    "Uttarakhand": ["Dehradun", "Haridwar", "Haldwani", "Roorkee", "Nainital"],
    "West Bengal": ["Kolkata", "Howrah", "Darjeeling", "Siliguri", "Asansol", "Durgapur"],
    "Andaman and Nicobar Islands": ["Port Blair", "Havelock Island", "Car Nicobar"],
    "Chandigarh": ["Chandigarh"],
    "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Silvassa", "Diu"],
    "Delhi": ["New Delhi", "North Delhi", "South Delhi", "West Delhi", "East Delhi"],
    "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Kathua"],
    "Ladakh": ["Leh", "Kargil"],
    "Lakshadweep": ["Kavaratti", "Minicoy", "Amini"],
    "Puducherry": ["Puducherry", "Karaikal", "Mahe", "Yanam"],
  };

  const ALL_LOCATIONS = (() => {
    const set = new Set();
    Object.entries(INDIAN_LOCATIONS).forEach(([state, districts]) => {
      set.add(state);
      districts.forEach(d => set.add(d));
    });
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
    filterState: "all",
    filterDistrict: "all",
    filterCategory: "all",
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
    populateFilterDropdowns();
    render();
  }

  /* ---------------- STATS / FILTER ---------------- */
  function isVisible(g) { return (g.status || "open") === "open"; }
  function chatModeOf(g) { return g.chat_mode || "open"; }

  function stats() {
    const visible = state.groups.filter(isVisible);
    const open = visible.filter(g => chatModeOf(g) === "open");
    const readonly = visible.filter(g => chatModeOf(g) === "readonly");
    const auto = visible.filter(g => g.discovered_via === "auto");
    const locations = new Set(visible.map(g => g.region));
    return { total: visible.length, openChat: open.length, readonly: readonly.length, auto: auto.length, locations: locations.size };
  }

  function getScannedLocations() {
    const states = new Set();
    const stateToDistricts = {};

    state.groups.filter(isVisible).forEach(g => {
      const reg = g.region;
      if (INDIAN_LOCATIONS[reg]) {
        states.add(reg);
      } else {
        for (const [s, dists] of Object.entries(INDIAN_LOCATIONS)) {
          if (dists.includes(reg)) {
            states.add(s);
            if (!stateToDistricts[s]) stateToDistricts[s] = new Set();
            stateToDistricts[s].add(reg);
            break;
          }
        }
      }
    });

    return {
      states: Array.from(states).sort(),
      stateToDistricts: Object.fromEntries(
        Object.entries(stateToDistricts).map(([s, dSet]) => [s, Array.from(dSet).sort()])
      )
    };
  }

  function visibleGroups() {
    let list = state.groups.filter(isVisible);

    // Category Filter
    if (state.filterCategory !== "all") {
      list = list.filter(g => (g.category || "jobs").toLowerCase() === state.filterCategory);
    }

    // State + District Filter
    if (state.filterState !== "all") {
      if (state.filterDistrict !== "all") {
        list = list.filter(g => g.region === state.filterDistrict);
      } else {
        const allowedDists = INDIAN_LOCATIONS[state.filterState] || [];
        list = list.filter(g => g.region === state.filterState || allowedDists.includes(g.region));
      }
    }

    // Open Chat Only Filter
    if (state.openChatOnly) {
      list = list.filter(g => chatModeOf(g) === "open");
    }

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
    if (!wrap) return;

    const parts = [];
    if (state.filterCategory !== "all") {
      parts.push(`<span class="chip" data-clear="category">Category: ${esc(state.filterCategory)} &times;</span>`);
    }
    if (state.filterState !== "all") {
      parts.push(`<span class="chip" data-clear="state">State: ${esc(state.filterState)} &times;</span>`);
    }
    if (state.filterDistrict !== "all") {
      parts.push(`<span class="chip" data-clear="district">District: ${esc(state.filterDistrict)} &times;</span>`);
    }
    if (state.openChatOnly) {
      parts.push(`<span class="chip" data-clear="open-chat">Open Chat Only &times;</span>`);
    }

    if (parts.length === 0) {
      wrap.innerHTML = `<span class="label-eyebrow" style="padding: 6px 0;">All groups displayed (open panel to filter)</span>`;
      return;
    }

    wrap.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span class="label-eyebrow">Active filters:</span>
        ${parts.join("")}
        <button class="chip" data-clear="all" style="background: var(--ink); color: #fff;">Clear All</button>
      </div>`;

    wrap.querySelectorAll("[data-clear]").forEach(el => {
      el.addEventListener("click", () => {
        const action = el.dataset.clear;
        if (action === "category") {
          state.filterCategory = "all";
          if ($("#filter-category-select")) $("#filter-category-select").value = "all";
        } else if (action === "state") {
          state.filterState = "all";
          state.filterDistrict = "all";
          if ($("#filter-state-select")) $("#filter-state-select").value = "all";
          if ($("#filter-district-select")) {
            $("#filter-district-select").value = "all";
            $("#filter-district-select").disabled = true;
          }
        } else if (action === "district") {
          state.filterDistrict = "all";
          if ($("#filter-district-select")) $("#filter-district-select").value = "all";
        } else if (action === "open-chat") {
          state.openChatOnly = false;
          if ($("#open-chat-only")) $("#open-chat-only").checked = false;
          if ($("#open-chat-only-drawer")) $("#open-chat-only-drawer").checked = false;
        } else if (action === "all") {
          state.filterCategory = "all";
          state.filterState = "all";
          state.filterDistrict = "all";
          state.openChatOnly = false;
          if ($("#filter-category-select")) $("#filter-category-select").value = "all";
          if ($("#filter-state-select")) $("#filter-state-select").value = "all";
          if ($("#filter-district-select")) {
            $("#filter-district-select").value = "all";
            $("#filter-district-select").disabled = true;
          }
          if ($("#open-chat-only")) $("#open-chat-only").checked = false;
          if ($("#open-chat-only-drawer")) $("#open-chat-only-drawer").checked = false;
        }
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
    const category = (g.category || "jobs").toLowerCase();
    const catBadge = `<span class="status-tag tag-${category}">${esc(category)}</span>`;
    const ctaCls = isReadOnly ? "card-cta card-cta-readonly" : "card-cta";
    const ctaText = isReadOnly ? "Open · contact admin →" : "Open in WhatsApp →";
    return `
    <article class="${cardCls}" data-id="${esc(g.id)}">
      <div class="card-head">
        <span class="label-eyebrow">${esc(g.region)}</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${catBadge}
          ${statusHtml}
        </div>
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
      <p>Try clearing your filters, or run a new scan from the Control Panel.</p>
      <button class="btn btn-neon" onclick="document.getElementById('sidebar-drawer').classList.add('open'); document.getElementById('drawer-overlay').classList.add('open');">Open Control Panel</button>
    </div>`;
  }

  /* ---------------- LOCATIONS & CONTROL PANEL ---------------- */
  function populateScanDropdowns() {
    const stateSelect = $("#scan-state-select");
    const distSelect = $("#scan-district-select");
    if (!stateSelect || !distSelect) return;

    const states = Object.keys(INDIAN_LOCATIONS).sort();
    stateSelect.innerHTML = `<option value="">Choose State</option>` + 
      states.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");

    stateSelect.addEventListener("change", () => {
      const selectedState = stateSelect.value;
      if (!selectedState) {
        distSelect.innerHTML = `<option value="">Choose State first</option>`;
        distSelect.disabled = true;
        return;
      }
      const dists = INDIAN_LOCATIONS[selectedState] || [];
      distSelect.innerHTML = dists.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
      distSelect.disabled = false;
    });
  }

  function populateFilterDropdowns() {
    const stateSelect = $("#filter-state-select");
    const distSelect = $("#filter-district-select");
    if (!stateSelect || !distSelect) return;

    const { states, stateToDistricts } = getScannedLocations();

    const currentSelectedState = state.filterState;
    const currentSelectedDist = state.filterDistrict;

    stateSelect.innerHTML = `<option value="all">All States</option>` + 
      states.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");

    if (states.includes(currentSelectedState)) {
      stateSelect.value = currentSelectedState;
    } else {
      state.filterState = "all";
      stateSelect.value = "all";
    }

    const updateDistricts = () => {
      const selectedState = stateSelect.value;
      state.filterState = selectedState;

      if (selectedState === "all") {
        distSelect.innerHTML = `<option value="all">All Districts</option>`;
        distSelect.disabled = true;
        state.filterDistrict = "all";
      } else {
        const dists = stateToDistricts[selectedState] || [];
        distSelect.innerHTML = `<option value="all">All Districts</option>` + 
          dists.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
        distSelect.disabled = false;

        if (dists.includes(currentSelectedDist)) {
          distSelect.value = currentSelectedDist;
          state.filterDistrict = currentSelectedDist;
        } else {
          distSelect.value = "all";
          state.filterDistrict = "all";
        }
      }
    };

    updateDistricts();

    stateSelect.addEventListener("change", () => {
      updateDistricts();
      renderFilters();
      renderGrid();
    });

    distSelect.addEventListener("change", () => {
      state.filterDistrict = distSelect.value;
      renderFilters();
      renderGrid();
    });
  }

  function fillDatalist() {
    $("#locations-datalist").innerHTML = ALL_LOCATIONS.map(x => `<option value="${esc(x)}">`).join("");
  }

  function openScanIssue(stateVal, distVal, catVal) {
    if (!stateVal) {
      toast("Please select a State to scan", true);
      return;
    }
    const region = distVal || stateVal;
    const title = `[scan] ${region}`;
    const body =
`<!-- Auto-generated by the WA/Jobs site. Do not edit the lines below. -->
- kind: scan-request
- region: ${region}
- category: ${catVal}
- max_per_region: 12

(Optional notes…)`;
    const url = `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${encodeURIComponent("scan-request")}`;
    window.open(url, "_blank", "noopener");
    toast(`Opening GitHub issue to scan ${region} for ${catVal}`);
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
      if ($("#open-chat-only-drawer")) $("#open-chat-only-drawer").checked = e.target.checked;
      renderGrid();
    });
    if ($("#open-chat-only-drawer")) {
      $("#open-chat-only-drawer").addEventListener("change", e => {
        state.openChatOnly = e.target.checked;
        $("#open-chat-only").checked = e.target.checked;
        renderGrid();
      });
    }
  }

  function bindSubmit() {
    $("#submit-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const link = $("#submit-link").value.trim();
      const region = $("#submit-region-input").value.trim();
      const category = $("#submit-category-select").value;
      if (!/^https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{18,30}/.test(link)) {
        toast("Please paste a valid chat.whatsapp.com link", true);
        return;
      }
      if (!ALL_LOCATIONS.some(l => l.toLowerCase() === region.toLowerCase())) {
        toast("Region must be an Indian state or capital", true);
        return;
      }
      const title = `[submit] ${region} — new ${category} group`;
      const body =
`<!-- Auto-generated by the WA/Jobs submit form. Do not edit the lines below. -->
- kind: submit
- region: ${region}
- category: ${category}
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

  function bindDrawer() {
    const drawer = $("#sidebar-drawer");
    const overlay = $("#drawer-overlay");
    const openBtn = $("#open-drawer-btn");
    const navOpenBtn = $("#nav-drawer-toggle");
    const closeBtn = $("#close-drawer-btn");

    function openDrawer() {
      drawer.classList.add("open");
      overlay.classList.add("open");
    }

    function closeDrawer() {
      drawer.classList.remove("open");
      overlay.classList.remove("open");
    }

    if (openBtn) openBtn.addEventListener("click", openDrawer);
    if (navOpenBtn) navOpenBtn.addEventListener("click", openDrawer);
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (overlay) overlay.addEventListener("click", closeDrawer);
  }

  function init() {
    $("#year").textContent = new Date().getFullYear();
    fillDatalist();
    bindOpenChatToggle();
    bindSubmit();
    bindRefresh();
    bindDrawer();
    populateScanDropdowns();

    if ($("#filter-category-select")) {
      $("#filter-category-select").addEventListener("change", e => {
        state.filterCategory = e.target.value;
        renderFilters();
        renderGrid();
      });
    }

    if ($("#run-scan-btn")) {
      $("#run-scan-btn").addEventListener("click", () => {
        const stateVal = $("#scan-state-select").value;
        const distVal = $("#scan-district-select").value;
        const catVal = $("#scan-category-select").value;
        openScanIssue(stateVal, distVal, catVal);
      });
    }

    loadData();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
