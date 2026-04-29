import { checkAdminAccess, logoutUser } from "../utils/auth.js";
import { fetchDepartments } from "../services/departmentapi.js";
import { updateComplaintStatus, assignDepartment } from "../services/adminapi.js";
import { fetchComplaintById } from "../services/complaintService.js";
import CATEGORY_LABELS from "../utils/categories.js";
import DEFAULT_DEPARTMENTS from "../utils/departments.js";

let complaintData = null;
let allDepartments = [];

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.getElementById('logout-btn')?.addEventListener('click', logoutUser);

document.addEventListener('DOMContentLoaded', async () => {
  const user = checkAdminAccess();
  if (!user) return;
  document.getElementById('nav-user').textContent = user.email || 'Admin';

  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get('id'));
  if (!id) {
    window.location.href = '404.html';
    return;
  }

  await loadDepartments();
  await loadComplaint(id);

  // Replace inline onclick with module-safe handlers
  document.getElementById('detail-content')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    try {
      if (action === 'assign') await doAssign();
      if (action === 'status') await doUpdateStatus(btn.getAttribute('data-status'));
    } catch (err) {
      console.error(err);
      showActionMsg(err.message || 'Action failed', 'error');
    }
  });
});

async function loadDepartments() {
  try {
    const data = await fetchDepartments();
    const apiDepartments = Array.isArray(data) ? data : (data.data || data.departments || []);
    allDepartments = (apiDepartments.length ? apiDepartments : DEFAULT_DEPARTMENTS).map(d => ({
      department_id: d.department_id ?? d.id,
      name: d.name,
    }));
  } catch (err) {
    console.error(err);
    allDepartments = DEFAULT_DEPARTMENTS;
  }
}

async function loadComplaint(id) {
  const container = document.getElementById('detail-content');
  container.innerHTML = `<div class="loading"><div class="spinner"></div>Loading complaint...</div>`;

  try {
    const c = await fetchComplaintById(id);
    complaintData = c;
    renderDetail(complaintData);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error">⚠ ${esc(err.message || 'Failed to load complaint')}</div>`;
  }
}

function renderDetail(c) {
  const container = document.getElementById('detail-content');
  const flow = ['pending', 'underReview', 'inProgress', 'resolved'];
  const idx = flow.indexOf(c.status);
  const nextStatus = flow[idx + 1];

  const complaintId = c.complaint_id ?? c.id;
  document.getElementById('detail-title').textContent = `Complaint #${complaintId}`;

  const departmentName = allDepartments.find(d => d.department_id == c.department_id)?.name || '—';

  container.innerHTML = `
    <div class="detail-grid">
      <div>
        <div class="card section">
          <div class="card-title">Complaint Information</div>
          <div class="grid-2">
            <div class="detail-field">
              <div class="detail-label">ID</div>
              <div class="detail-value mono">#${complaintId}</div>
            </div>
            <div class="detail-field">
              <div class="detail-label">Category</div>
              <div class="detail-value">${esc(CATEGORY_LABELS[c.category_id] || '—')}</div>
            </div>
            <div class="detail-field">
              <div class="detail-label">Status</div>
              <div class="detail-value"><span class="badge badge-${c.status}">${formatStatus(c.status)}</span></div>
            </div>
            <div class="detail-field">
              <div class="detail-label">Priority</div>
              <div class="detail-value"><span class="badge badge-${c.priority?.toLowerCase()}">${c.priority || '—'}</span></div>
            </div>
            <div class="detail-field">
              <div class="detail-label">Department</div>
              <div class="detail-value">${esc(departmentName)}</div>
            </div>
            <div class="detail-field">
              <div class="detail-label">Validation Status</div>
              <div class="detail-value">
                <span class="badge badge-${esc(c.validation_status || c.validationStatus || 'pending')}">
                  ${esc(c.validation_status || c.validationStatus || 'pending')}
                </span>
              </div>
            </div>
            <div class="detail-field" style="grid-column:1/-1">
              <div class="detail-label">Location / Address</div>
              <div class="detail-value">${esc(c.location || c.address || '—')}</div>
            </div>
            ${c.lattitude && c.longitude ? `
            <div class="detail-field">
              <div class="detail-label">Latitude</div>
              <div class="detail-value mono">${esc(c.lattitude)}</div>
            </div>
            <div class="detail-field">
              <div class="detail-label">Longitude</div>
              <div class="detail-value mono">${esc(c.longitude)}</div>
            </div>` : ''}
            <div class="detail-field" style="grid-column:1/-1">
              <div class="detail-label">Description</div>
              <div class="detail-value" style="line-height:1.7;">${esc(c.description || '—')}</div>
            </div>
            <div class="detail-field">
              <div class="detail-label">Submitted</div>
              <div class="detail-value mono">${formatDate(c.created_at || c.createdAt)}</div>
            </div>
          </div>
        </div>

        ${c.image_url ? `
        <div class="card section">
          <div class="card-title">Attached Image</div>
          <img src="${esc(c.image_url)}" alt="Complaint image" class="complaint-image">
        </div>` : ''}
      </div>

      <div>
        <div class="card section">
          <div class="card-title">Admin Actions</div>

          <div id="action-msg"></div>

          <div class="form-group">
            <label>Assign Department</label>
            <select id="assign-dept" style="margin-bottom:8px;">
              <option value="">Select department...</option>
              ${allDepartments.map(d => `<option value="${d.department_id}" ${c.department_id == d.department_id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
            </select>
            <button class="btn btn-primary" style="width:100%" data-action="assign">Assign Department</button>
          </div>

          ${nextStatus ? `
          <div class="form-group" style="border-top:1px solid var(--border);padding-top:16px;margin-top:8px;">
            <label>Update Status</label>
            <div class="alert alert-info" style="margin-bottom:12px;font-size:12px;">
              Next step: <strong>${formatStatus(nextStatus)}</strong>
            </div>
            <button class="btn btn-primary" style="width:100%;background:var(--success);" data-action="status" data-status="${nextStatus}">
              Move to ${formatStatus(nextStatus)}
            </button>
          </div>` : `
          <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:8px;">
            <div class="alert alert-success">✓ This complaint is fully resolved</div>
          </div>`}

          <div style="margin-top:12px;">
            <a class="btn btn-sm btn-secondary" style="width:100%;justify-content:center;" href="departments.html">
              + Create / manage departments
            </a>
          </div>
        </div>

        ${c.submittedBy || c.user ? `
        <div class="card section">
          <div class="card-title">Submitted By</div>
          <div class="detail-field">
            <div class="detail-label">Name</div>
            <div class="detail-value">${c.submittedBy?.name || c.user?.name || '—'}</div>
          </div>
          <div class="detail-field">
            <div class="detail-label">Email</div>
            <div class="detail-value">${c.submittedBy?.email || c.user?.email || '—'}</div>
          </div>
        </div>` : ''}
      </div>
    </div>
  `;
}

async function doAssign() {
  const deptId = document.getElementById('assign-dept').value;
  if (!deptId) { showActionMsg('Please select a department', 'error'); return; }
  const complaintId = complaintData?.complaint_id ?? complaintData?.id;
  await assignDepartment(complaintId, Number(deptId));
  showActionMsg('Department assigned successfully', 'success');
  await loadComplaint(complaintId);
}

async function doUpdateStatus(status) {
  const complaintId = complaintData?.complaint_id ?? complaintData?.id;
  await updateComplaintStatus(complaintId, status);
  showActionMsg(`Status updated to ${formatStatus(status)}`, 'success');
  await loadComplaint(complaintId);
}

function showActionMsg(msg, type) {
  const el = document.getElementById('action-msg');
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : 'success'}" style="margin-bottom:12px;">${msg}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 4000);
}

function formatStatus(s) {
  const map = { pending: 'Pending', underReview: 'Under Review', inProgress: 'In Progress', resolved: 'Resolved' };
  return map[s] || s;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}