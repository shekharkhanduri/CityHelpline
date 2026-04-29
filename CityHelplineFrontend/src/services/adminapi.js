// Functions in this file:
// - fetchDashboard: Fetches admin dashboard data
// - fetchAdminComplaints: Retrieves complaints with optional filters
// - assignDepartment: Assigns a department to a complaint
// - updateComplaintStatus: Updates the status of a complaint

import { API_BASE } from "../js/config.js";
import { buildHeaders, clearSession } from "../utils/auth.js";

async function parseError(res) {
  try {
    const data = await res.clone().json();
    return data?.message || data?.error || `Request failed (${res.status})`;
  } catch {
    try {
      const text = await res.clone().text();
      return text?.slice(0, 180) || `Request failed (${res.status})`;
    } catch {
      return `Request failed (${res.status})`;
    }
  }
}

async function fetchJson(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...(init.headers || {}) } });
  if (res.status === 401 || res.status === 403) {
    clearSession();
    window.location.href = "./unauthorized.html";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchDashboard() {
  return fetchJson("/api/admin/dashboard", { headers: buildHeaders() });
}
export async function fetchAdminComplaints(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.department_id) query.set('department_id', params.department_id);
  if (params.limit) query.set('limit', params.limit);
  if (params.offset) query.set('offset', params.offset);
  return fetchJson(`/api/admin/complaints?${query}`, { headers: buildHeaders() });
}

export async function assignDepartment(complaintId, departmentId) {
  return fetchJson(`/api/admin/complaints/${complaintId}/assign`, {
    method: "PATCH",
    headers: buildHeaders(),
    body: JSON.stringify({ departmentId }),
  });
}

export async function updateComplaintStatus(complaintId, status) {
  return fetchJson(`/api/admin/complaints/${complaintId}/status`, {
    method: "PATCH",
    headers: buildHeaders(),
    body: JSON.stringify({ status }),
  });
}