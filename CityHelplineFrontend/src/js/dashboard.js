
import { fetchComplaints } from "../services/complaintService.js";
import { getCurrentUser } from "../services/authService.js";
import { checkAuth, logoutUser } from "../utils/auth.js";
import CATEGORY_LABELS from '../utils/categories.js';

// ── Auth ──────────────────────────────────────────────────────
checkAuth();

document.getElementById("logout-btn").addEventListener("click", logoutUser);

// Show stored username immediately, then confirm with server
const savedUser = localStorage.getItem("username");
if (savedUser) {
  document.getElementById("nav-username").textContent = `Hey, ${savedUser} 👋`;
}

getCurrentUser()
  .then(user => {
    const name = user.name || savedUser || "User";
    document.getElementById("nav-username").textContent = `Hey, ${name} 👋`;
    localStorage.setItem("username", name);
  })
  .catch(() => {}); // non-fatal, savedUser fallback already shown

// ── State ─────────────────────────────────────────────────────
let allComplaints = [];
let currentFilter = "all";

// ── Status config — matches server enum exactly ───────────────
const STATUS_META = {
  pending:     { label: "Pending",      cls: "pending"      },
  underReview: { label: "Under Review", cls: "under-review" },
  inProgress:  { label: "In Progress",  cls: "in-progress"  },
  resolved:    { label: "Resolved",     cls: "resolved"     },
};

// ── Helpers ───────────────────────────────────────────────────
function formatTime(dateStr) {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Stats ─────────────────────────────────────────────────────
function updateStats(complaints) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("stat-total",      complaints.length);
  set("stat-pending",    complaints.filter(c => c.status === "pending").length);
  set("stat-review",     complaints.filter(c => c.status === "underReview").length);
  set("stat-inprogress", complaints.filter(c => c.status === "inProgress").length);
  set("stat-resolved",   complaints.filter(c => c.status === "resolved").length);
}
function renderCards(complaints) {
  const list = document.getElementById("complaints-list");
  if (!list) return;

  if (complaints.length === 0) {
    list.innerHTML = '<div class="empty-msg">No complaints found.</div>';
    return;
  }

  list.innerHTML = "";

  complaints.forEach((c) => {
    const meta     = STATUS_META[c.status] || { label: c.status, cls: "pending" };
    const title    = CATEGORY_LABELS[c.category_id] || "Other";
    const imgHtml  = c.image_url
      ? `<img class="card-img" src="${esc(c.image_url)}" alt="Evidence photo">`
      : "";

    const card = document.createElement("div");
    card.className  = "complaint-card";
    card.dataset.id = c.complaint_id;

    card.innerHTML = `
      <div class="card-top">
        <div class="card-title">${esc(title)}</div>
        <span class="badge ${meta.cls}">${meta.label}</span>
      </div>
      <div class="card-desc">${esc(c.description || "")}</div>
      ${imgHtml}
      <div class="card-meta">
        <span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          ${formatTime(c.created_at)}
        </span>
        <span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          ${esc(c.location || "Unknown location")}
        </span>
      </div>
    `;

    card.addEventListener("click", () => {
      document.querySelectorAll(".complaint-card").forEach(el => el.classList.remove("active"));
      card.classList.add("active");
      focusComplaint(c);
    });

    list.appendChild(card);
  });

  lucide.createIcons();
}


// ── Sync map markers via map.js global ───────────────────────
// map.js must be loaded before this file (plain <script> tag, not module)
// map.js exposes: initMap(), renderComplaints(), focusComplaint(), placeSelectedMarker()
function syncMap(complaints) {
  if (typeof renderComplaints === "function") {
    renderComplaints(complaints); // map.js — uses lattitude/longitude/complaint_id
  }
}

// ── Filter tabs ───────────────────────────────────────────────
function getFiltered() {
  if (currentFilter === "all") return allComplaints;
  return allComplaints.filter(c => c.status === currentFilter);
}

function applyFilter() {
  const filtered = getFiltered();
  renderCards(filtered);
  syncMap(filtered);
}

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter || "all";
    applyFilter();
  });
});

// ── Loading / error states ────────────────────────────────────
function setListLoading(on) {
  const list = document.getElementById("complaints-list");
  if (list && on) list.innerHTML = '<div class="loading-msg">Loading complaints…</div>';
}

function showListError(msg) {
  const list = document.getElementById("complaints-list");
  if (list) list.innerHTML = `<div class="error-msg">${esc(msg)}</div>`;
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  lucide.createIcons();
  setListLoading(true);

  const start = async (lat, lng) => {
    // map.js: initMap(lat, lng, onMapClickCb, onMarkerClickCb)
    initMap(lat, lng, null, (complaint) => {
      // Marker clicked on map → highlight the matching card in sidebar
      document.querySelectorAll(".complaint-card").forEach(el => el.classList.remove("active"));
      const card = document.querySelector(`.complaint-card[data-id="${complaint.complaint_id}"]`);
      if (card) {
        card.classList.add("active");
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    try {
      // complaintService.js → GET /api/complaints (public, no token needed)
      allComplaints = await fetchComplaints();
    } catch (err) {
      console.error("Failed to load complaints:", err);
      showListError("Could not load complaints. Is the server running?");
      return;
    }

    updateStats(allComplaints);
    renderCards(allComplaints);
    syncMap(allComplaints);
  };

  if (!navigator.geolocation) {
    await start(28.6139, 77.209);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => { await start(pos.coords.latitude, pos.coords.longitude); },
    async ()    => { await start(28.6139, 77.209); }
  );
}

init();