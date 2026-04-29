
import { getCurrentUser } from "../services/authService.js";
import { fetchComplaints } from "../services/complaintService.js"; // fetchMyComplaints doesn't exist on server
import { checkAuth, logoutUser } from "../utils/auth.js";

// ── Auth ──────────────────────────────────────────────────────
checkAuth();

document.getElementById("logout-btn").addEventListener("click", logoutUser);

const savedUser = localStorage.getItem("name");
if (savedUser) {
  document.getElementById("nav-username").textContent = `Hey, ${savedUser}`;
}

// ── Status config — matches server enum exactly ───────────────
const STATUS_META = {
  pending:     { label: "Pending",      cls: "pending"      },
  underReview: { label: "Under Review", cls: "under-review" },
  inProgress:  { label: "In Progress",  cls: "in-progress"  },
  resolved:    { label: "Resolved",     cls: "resolved"     },
};

// ── Helpers ───────────────────────────────────────────────────
function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(dateStr) {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Load user info ────────────────────────────────────────────
let currentUserId = null;

async function loadUserInfo() {
  try {
    const user = await getCurrentUser();
    // authController returns: user_id, name, email, role, created_at — NO username field
    const name  = user.name || savedUser || "User";
    const email = user.email || "No email";

    currentUserId = user.id; // needed to filter complaints below

    document.getElementById("profile-name").textContent   = esc(name);
    document.getElementById("profile-email").textContent  = esc(email);
    document.getElementById("nav-username").textContent   = `Hey, ${esc(name)} 👋`;
    document.getElementById("avatar-initials").textContent = name.charAt(0).toUpperCase();

    localStorage.setItem("name", name);
  } catch (err) {
    console.error("Failed to load user:", err);
  }
}

// ── Render complaints list ────────────────────────────────────
function renderMyComplaints(complaints) {
  const list = document.getElementById("my-complaints-list");
  if (!list) return;

  // Stat counters — status keys match server enum exactly
  document.getElementById("ps-total").textContent      = complaints.length;
  document.getElementById("ps-pending").textContent    = complaints.filter(c => c.status === "pending").length;
  document.getElementById("ps-inprogress").textContent = complaints.filter(c => c.status === "inProgress").length;
  document.getElementById("ps-resolved").textContent   = complaints.filter(c => c.status === "resolved").length;

  if (complaints.length === 0) {
    list.innerHTML = `
      <div class="empty-profile">
        You haven't filed any complaints yet.<br/>
        <a href="file-complaint.html">+ File your first complaint</a>
      </div>`;
    return;
  }

  list.innerHTML = "";

  complaints.forEach(c => {
    const meta    = STATUS_META[c.status] || { label: c.status, cls: "pending" };
    const snippet = (c.description?.slice(0, 60) ?? "") + ((c.description?.length ?? 0) > 60 ? "…" : "");

    const row = document.createElement("div");
    row.className  = "my-complaint-row";
    row.dataset.id = c.complaint_id;

    row.innerHTML = `
      <div class="row-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      </div>
      <div class="row-info">
        <div class="row-title">${esc(snippet)}</div>
        <div class="row-meta">
          <span>📍 ${esc(c.location || "Unknown location")}</span>
          <span>🕒 ${formatDate(c.created_at)}</span>
        </div>
      </div>
      <div class="row-right">
        <span class="badge ${meta.cls}">${meta.label}</span>
      </div>
    `;

    list.appendChild(row);
  });
}

// ── Loading / error states ────────────────────────────────────
function setListLoading(on) {
  const list = document.getElementById("my-complaints-list");
  if (list && on) list.innerHTML = '<div class="loading-msg">Loading your complaints…</div>';
}

function showListError(msg) {
  const list = document.getElementById("my-complaints-list");
  if (list) list.innerHTML = `<div class="error-msg">${esc(msg)}</div>`;
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  lucide.createIcons();
  setListLoading(true);

  // Load user first — we need currentUserId to filter complaints
  await loadUserInfo();

  if (!currentUserId) {
    showListError("Could not identify user. Please log in again.");
    return;
  }

  try {
    // No /user/:id endpoint exists — fetch all and filter client-side by user_id
    const all = await fetchComplaints();
    const mine = all.filter(c => String(c.user_id) === String(currentUserId));
    renderMyComplaints(mine);
  } catch (err) {
    console.error("Failed to load complaints:", err);
    showListError("Could not load your complaints. Is the server running?");
  }
}

init();