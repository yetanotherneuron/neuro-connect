const SERVER_KEY = "nc_server";
const TOKEN_KEY = "nc_token";
const USER_KEY = "nc_user";

export function loadServerUrl(fallback = "http://127.0.0.1:7420") {
  return localStorage.getItem(SERVER_KEY) || fallback;
}

export function saveServerUrl(url: string) {
  localStorage.setItem(SERVER_KEY, url.replace(/\/$/, ""));
}

export function loadSession(): { token: string; userJson: string } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const userJson = localStorage.getItem(USER_KEY);
  if (!token || !userJson) return null;
  return { token, userJson };
}

export function persistSession(token: string, userJson: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, userJson);
}

export function wipeSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
