// Single place for talking to the backend: base URL, auth headers,
// token refresh, and consistent error handling.

const SERVICE_NAME = "project-tracker";
const API_ROOT = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");
export const BASE_URL = `${API_ROOT}/api/${SERVICE_NAME}`;

const ACCESS_KEY = "pt_access_token";
const REFRESH_KEY = "pt_refresh_token";

export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details; // per-field messages, e.g. { email: "is already in use" }
  }
}

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  save({ access_token, refresh_token }) {
    if (access_token) localStorage.setItem(ACCESS_KEY, access_token);
    if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// The auth context registers a handler so the app can log out when a session can't be renewed
let onSessionExpired = () => {};
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

// If several requests fail with 401 at once, they share a single refresh call
let refreshInFlight = null;

async function refreshTokens() {
  if (!tokenStore.refresh) return false;
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokenStore.refresh }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        tokenStore.save(await res.json());
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function parseBody(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export async function request(path, { method = "GET", body, query, auth = true, retry = true } = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });

  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && tokenStore.access) headers.Authorization = `Bearer ${tokenStore.access}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  // Access token expired: refresh once, then retry the original request
  if (res.status === 401 && auth && retry && (await refreshTokens())) {
    return request(path, { method, body, query, auth, retry: false });
  }

  const data = await parseBody(res);
  if (!res.ok) {
    if (res.status === 401 && auth) {
      tokenStore.clear();
      onSessionExpired();
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.details);
  }
  return data;
}

export const api = {
  get: (path, query) => request(path, { query }),
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  del: (path) => request(path, { method: "DELETE" }),
};