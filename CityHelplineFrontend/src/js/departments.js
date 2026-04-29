import { checkAdminAccess, logoutUser } from "../utils/auth.js";
import { fetchDepartments, createDepartment, updateDepartment, deleteDepartment } from "../services/departmentapi.js"
import DEFAULT_DEPARTMENTS from "../utils/departments.js";


document.getElementById('logout-btn').addEventListener('click',logoutUser);
let editingId = null;

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

  await loadDepartments();

  document.getElementById('btn-add-dept').addEventListener('click', () => openModal(null));
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('dept-form').addEventListener('submit', onSubmitForm);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Replace inline onclick handlers (module scope isn't global)
  document.getElementById('dept-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = Number(btn.getAttribute('data-id'));
    if (!id) return;

    if (action === 'edit') {
      const dept = allDepts.find(d => Number(d.department_id) === id);
      openModal(dept || null);
      return;
    }

    if (action === 'delete') {
      const name = btn.getAttribute('data-name') || '';
      try {
        await doDelete(id, name);
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Delete failed', 'error');
      }
    }
  });
});

let allDepts = [];
async function loadDepartments() {
  const list = document.getElementById('dept-list');
  list.innerHTML = `<div class="loading"><div class="spinner"></div>Loading departments...</div>`;

  try {
    const data = await fetchDepartments();

    const apiDepartments = Array.isArray(data) ? data : (data.data || data.departments || []);
    const departments = (apiDepartments.length ? apiDepartments : DEFAULT_DEPARTMENTS).map(d => ({
      department_id: d.department_id ?? d.id,
      name: d.name,
      description: d.description,
      headEmail: d.headEmail,
    }));
    allDepts = departments;

    document.getElementById('dept-count').textContent = `${departments.length} total`;

    if (departments.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏛</div>
          <div class="empty-state-text">No departments yet. Add one above.</div>
        </div>`;
      return;
    }

    list.innerHTML = departments.map(d => `
      <div class="dept-item">
        <div>
          <div class="dept-name">${esc(d.name)}</div>
          ${d.description ? `<div class="dept-meta">${esc(d.description)}</div>` : ''}
          ${d.headEmail ? `<div class="dept-meta">📧 ${esc(d.headEmail)}</div>` : ''}
        </div>
        <div class="dept-actions">
          <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${d.department_id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${d.department_id}" data-name="${esc(d.name)}">Delete</button>
        </div>
      </div>
    `).join('');

  } catch (err) {
   showErr(err.message);
  }
}
function openModal(dept) {
  editingId = dept ? dept.department_id : null;
  document.getElementById('modal-title').textContent = dept ? 'Edit Department' : 'Add Department';
  document.getElementById('field-name').value = dept ? dept.name : '';
  document.getElementById('field-desc').value = dept ? (dept.description || '') : '';
  document.getElementById('field-head').value = dept ? (dept.headEmail || '') : '';
  document.getElementById('form-msg').innerHTML = '';
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('field-name').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  editingId = null;
}

async function onSubmitForm(e) {
  e.preventDefault();
  const name = document.getElementById('field-name').value.trim();
  const description = document.getElementById('field-desc').value.trim();
  const headEmail = document.getElementById('field-head').value.trim();

  if (!name) {
    document.getElementById('form-msg').innerHTML = `<div class="alert alert-error">Name is required</div>`;
    return;
  }

  const payload = { name };
  if (description) payload.description = description;
  if (headEmail) payload.headEmail = headEmail;

  const submitBtn = document.getElementById('modal-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    if (editingId) {
      await updateDepartment(editingId, payload);
    } else {
      await createDepartment(payload);
    }

    closeModal();
    await loadDepartments();
    showToast(editingId ? 'Department updated' : 'Department added', 'success');
  } catch (err) {
    document.getElementById('form-msg').innerHTML = `<div class="alert alert-error">⚠ ${esc(err.message || 'Save failed')}</div>`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save';
  }
}

async function doDelete(id, name) {
  if (!confirm(`Delete department "${name}"? This cannot be undone.`)) return;
  await deleteDepartment(id);
  showToast('Department deleted', 'success');
  await loadDepartments();
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