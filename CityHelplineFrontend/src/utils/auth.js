

export function getToken() {
  return localStorage.getItem("token");
}

function base64UrlDecode(str) {
  const b64 = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const decoded = atob(b64 + pad);
  try {
    // Handle UTF-8 payloads
    return decodeURIComponent(Array.prototype.map.call(decoded, (c) =>
      "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
    ).join(""));
  } catch {
    return decoded;
  }
}

export function getJwtPayload(token = getToken()) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

export function isTokenExpired(payload) {
  if (!payload || typeof payload.exp !== "number") return false;
  // exp is seconds since epoch
  return Date.now() >= payload.exp * 1000;
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("name");
  localStorage.removeItem("role");
}

export function checkAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = "../pages/login.html";
    return false;
  }
  const payload = getJwtPayload(token);
  if (payload && isTokenExpired(payload)) {
    clearSession();
    window.location.href = "../pages/login.html";
    return false;
  }
  return payload || true;
}

export function logoutUser() {
  clearSession();
  window.location.href = "../pages/login.html";
}

export function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export function checkAdminAccess() {
  const token = getToken();
  if (!token) {
    window.location.href = './unauthorized.html';
    return false;
  }
  try {
    const payload = getJwtPayload(token);
    if (!payload) throw new Error("Invalid token");
    if (isTokenExpired(payload)) {
      clearSession();
      window.location.href = './unauthorized.html';
      return false;
    }
    if (payload.role !== 'admin') {
      window.location.href = './unauthorized.html';
      return false;
    }
    return payload;
  } catch {
    window.location.href = './unauthorized.html';
    return false;
  }
}