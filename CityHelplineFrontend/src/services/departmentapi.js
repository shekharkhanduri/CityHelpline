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

export async function fetchDepartments() {
  return fetchJson("/api/admin/departments", { headers: buildHeaders() });
}

export async function createDepartment(data) {
  return fetchJson("/api/admin/departments", {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(data),
  });
}

export async function updateDepartment(id, data) {
  return fetchJson(`/api/admin/departments/${id}`, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify(data),
  });
}

export async function deleteDepartment(id) {
  return fetchJson(`/api/admin/departments/${id}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
}