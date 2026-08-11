/**
 * Team authentication utilities for ProjectHub.
 *
 * The ProjectHub frontend must obtain a "team-session" JWT by posting the
 * team passcode to POST /api/auth/token.  The token is stored in localStorage
 * and attached as a Bearer header to authenticated requests.
 */

const STORAGE_KEY = "projecthub_team_token";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Read the stored JWT (or null if absent). */
export function getTeamToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

/** Persist a token received from the auth endpoint. */
export function setTeamToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
}

/** Remove the stored token (logout). */
export function clearTeamToken(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Alias used by sign-out flows; clears the token. */
export function clearTeamAuth(): void {
  clearTeamToken();
}

/**
 * Returns the `Authorization: Bearer <token>` header object if a token is
 * stored, or `null` if the user has not yet authenticated.
 */
export function getAuthHeaders(): Record<string, string> | null {
  const token = getTeamToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

/**
 * Attempt to exchange a passcode for a team-session JWT.
 * Throws if the request fails (wrong passcode → 401, network error, etc.).
 * On success, persists the token and returns it.
 */
export async function loginWithPasscode(passcode: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `Auth failed (${res.status})`);
  }
  const data = await res.json() as { token: string };
  setTeamToken(data.token);
  return data.token;
}

/**
 * Change the team passcode.
 * Verifies the current passcode server-side before storing the new bcrypt hash.
 * Throws on wrong current passcode or network error.
 */
export async function changePasscode(
  currentPasscode: string,
  newPasscode: string,
): Promise<void> {
  const token = getTeamToken();
  const res = await fetch(`${BASE}/api/auth/change-passcode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ currentPasscode, newPasscode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `Failed to change passcode (${res.status})`);
  }
}

/**
 * Decode the token's exp claim (unix seconds).
 * Uses atob() for browser-safe base64url decoding — no Node.js Buffer required.
 * Returns null if the token is malformed or has no exp.
 */
function tokenExp(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // base64url → base64: replace URL-safe chars and add padding
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * True when there is a stored token AND it has not expired (with a 60-second
 * grace window so the UI doesn't flash right at the boundary).
 */
export function isTeamAuthenticated(): boolean {
  const token = getTeamToken();
  if (!token) return false;
  const exp = tokenExp(token);
  if (exp === null) return true; // no exp claim → treat as valid
  return exp > Math.floor(Date.now() / 1000) + 60;
}

/**
 * Called when a 401 is received from the API.
 * Clears the stored token and dispatches a window event so auth-aware
 * components (AuthGuard) can redirect to /login.
 */
export function handleUnauthorizedResponse(): void {
  clearTeamToken();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("projecthub:unauthorized"));
  }
}
