import { checkAdminAccess, logoutUser, } from "../utils/auth.js";
import { fetchDepartments } from "../services/departmentapi.js";
import { assignDepartment, fetchAdminComplaints, updateComplaintStatus } from "../services/adminapi.js";
import CATEGORY_LABELS from "../utils/categories.js";
import DEFAULT_DEPARTMENTS from "../utils/departments.js";

document.getElementById('logout-btn').addEventListener('click', logoutUser);

const PAGE_LIMIT = 20;
let currentOffset = 0;
let totalCount = 0;
let currentFilters = { status: '', department_id: '' };
let allDepartments = [];

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = checkAdminAccess();
  if (!user) return;

  document.getElementById('nav-user').textContent = user.email || 'Admin';

  await loadDepartmentsForFilters();
  await loadComplaints();

  document.getElementById('filter-status').addEventListener('change', onFilterChange);
  document.getElementById('filter-department').addEventListener('change', onFilterChange);
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (currentOffset > 0) {
      currentOffset = Math.max(0, currentOffset - PAGE_LIMIT);
      loadComplaints();
    }
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    if (currentOffset + PAGE_LIMIT < totalCount) {
      currentOffset += PAGE_LIMIT;
      loadComplaints();
    }
  });

  // Replace inline onclick handlers (module scope isn't global)
  document.getElementById('complaints-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = Number(btn.getAttribute('data-id'));
    if (!id) return;

    try {
      if (action === 'assign') await doAssign(id);
      if (action === 'status') await doUpdateStatus(id);
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Action failed', 'error');
    }
  });
});

function onFilterChange() {
  currentFilters.status = document.getElementById('filter-status').value;
  currentFilters.department_id = document.getElementById('filter-department').value;
  currentOffset = 0;
  loadComplaints();
}

async function loadDepartmentsForFilters() {
  try{
    const data = await fetchDepartments();
    const apiDepartments = Array.isArray(data) ? data : (data.data || data.departments || []);
    // Normalize shape: backend uses department_id, some older code uses id
    allDepartments = (apiDepartments.length ? apiDepartments : DEFAULT_DEPARTMENTS).map(d => ({
      department_id: d.department_id ?? d.id,
      name: d.name,
      description: d.description,
    }));
    const sel = document.getElementById('filter-department');
    allDepartments.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.department_id;
      opt.textContent = d.name;
      sel.appendChild(opt);
    });
  }catch(err){
     showErr(err.message);
  }
}

async function loadComplaints() {
  const tbody = document.getElementById('complaints-tbody');
  const paginationInfo = document.getElementById('pagination-info');
  tbody.innerHTML = `<tr><td colspan="8"><div class="loading"><div class="spinner"></div>Loading...</div></td></tr>`;

  try{
    const data = await fetchAdminComplaints({
      ...currentFilters,
      limit: PAGE_LIMIT,
      offset: currentOffset
    });


    const complaints = Array.isArray(data) ? data : (data.data || data.complaints || []);
    totalCount = data.total || data.count || complaints.length;

    const from = totalCount === 0 ? 0 : currentOffset + 1;
    const to = Math.min(currentOffset + PAGE_LIMIT, totalCount);
    paginationInfo.textContent = totalCount === 0 ? 'No results' : `${from}–${to} of ${totalCount}`;
    document.getElementById('btn-prev').disabled = currentOffset === 0;
    document.getElementById('btn-next').disabled = to >= totalCount;
    
    if (complaints.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No complaints found</div></div></td></tr>`;
      return;
    }
    

    tbody.innerHTML = complaints.map(c => `
      <tr>
        <td class="id-cell">${c.complaint_id}</td>
        <td>${CATEGORY_LABELS[c.category_id] || '—'}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.location || c.address || '—')}</td>
        <td><span class="badge badge-${c.status}">${formatStatus(c.status)}</span></td>
        <td><span class="badge badge-${c.priority?.toLowerCase()}">${c.priority || '—'}</span></td>
        <td>${allDepartments.find(d => d.department_id == c.department_id)?.name || '—'}</td>
        <td style="font-family:var(--mono);font-size:12px;color:var(--text2);">${formatDate(c.created_at)}</td>
        <td>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <a href="complaintDetail.html?id=${c.complaint_id}" class="btn btn-sm btn-secondary">View</a>
            <div style="display:flex;gap:4px;align-items:center;">
              <select class="filter-select" style="min-width:130px;padding:5px 8px;font-size:12px;" id="dept-sel-${c.complaint_id}">
                <option value="">Assign dept…</option>
                ${allDepartments.map(d => `<option value="${d.department_id}" ${c.department_id == d.department_id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
              </select>
              <button class="btn btn-sm btn-secondary" data-action="assign" data-id="${c.complaint_id}">Set</button>
            </div>
            <div style="display:flex;gap:4px;align-items:center;">
              <select class="filter-select" style="min-width:130px;padding:5px 8px;font-size:12px;" id="status-sel-${c.complaint_id}">
                ${getStatusOptions(c.status)}
              </select>
              <button class="btn btn-sm btn-secondary" data-action="status" data-id="${c.complaint_id}">Set</button>
            </div>
          </div>
        </td>
      </tr>
    `).join('');

  }catch (err){
      showErr(err.message);
  }
}

function getStatusOptions(current) {
  const flow = ['pending', 'underReview', 'inProgress', 'resolved'];
  const idx = flow.indexOf(current);
  const next = flow[idx + 1];
  let opts = `<option value="${current}">${formatStatus(current)} (current)</option>`;
  if (next) opts += `<option value="${next}">${formatStatus(next)}</option>`;
  return opts;
}

async function doAssign(id) {
  const sel = document.getElementById(`dept-sel-${id}`);
  const deptId = sel.value;
  if (!deptId) return;
  await assignDepartment(id, deptId);
  showToast('Department assigned', 'success');
  loadComplaints();
}

async function doUpdateStatus(id) {
  const sel = document.getElementById(`status-sel-${id}`);
  const status = sel.value;
  await updateComplaintStatus(id, status);
  showToast('Status updated', 'success');
  loadComplaints();
}

function formatStatus(s) {
  const map = { pending: 'Pending', underReview: 'Under Review', inProgress: 'In Progress', resolved: 'Resolved' };
  return map[s] || s;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function showToast(msg, type) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'toast';
  t.className = `alert alert-${type === 'error' ? 'error' : 'success'}`;
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;min-width:260px;box-shadow:var(--shadow);';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}