/**
 * ProjectHub team authentication helpers.
 *
 * Stores the signed JWT in localStorage and exposes helpers for:
 *  - email/password login
 *  - invite-based registration
 *  - password change / forgot-password / reset-password
 *  - admin operations (invite, list users, role changes)
 *  - token lifecycle (get, clear, expiry check)
 */

const TOKEN_KEY = "projecthub:token";
const API = "/api";

// ─── Token storage ────────────────────────────────────────────────────────────

export function getTeamToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setTeamToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* no-op */ }
}
export function clearTeamToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* no-op */ }
}

/** Returns Authorization header object for use in fetch calls, or null if not authenticated. */
export function getAuthHeaders(): Record<string, string> | null {
  const token = getTeamToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

// ─── User info (decoded from JWT payload — no extra round-trip) ────────────────

export interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tokenExp(token: string): number | null {
  const p = decodeJwtPayload(token);
  return typeof p?.exp === "number" ? p.exp : null;
}

export function getTeamUser(): TeamUser | null {
  const token = getTeamToken();
  if (!token) return null;
  const p = decodeJwtPayload(token);
  if (!p || !p["id"] || !p["email"]) return null;
  return {
    id: String(p["id"]),
    email: String(p["email"]),
    name: typeof p["name"] === "string" ? p["name"] : String(p["email"]),
    role: p["role"] === "admin" ? "admin" : "member",
  };
}

export function isTeamAdmin(): boolean {
  return getTeamUser()?.role === "admin";
}

/**
 * True when there is a stored token AND it has not expired (60-second grace).
 */
export function isTeamAuthenticated(): boolean {
  const token = getTeamToken();
  if (!token) return false;
  const exp = tokenExp(token);
  if (exp === null) return true;
  return exp > Math.floor(Date.now() / 1000) + 60;
}

// ─── Auth state helpers ───────────────────────────────────────────────────────

export function clearTeamAuth(): void {
  clearTeamToken();
}

export function handleUnauthorizedResponse(): void {
  clearTeamToken();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("projecthub:unauthorized"));
  }
}

// ─── Auth API helpers ─────────────────────────────────────────────────────────

async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = getTeamToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorizedResponse();
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ─── Public auth flows ────────────────────────────────────────────────────────

export async function loginWithEmail(email: string, password: string): Promise<TeamUser> {
  const data = await apiFetch<{ token: string; user: TeamUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setTeamToken(data.token);
  return data.user;
}

/** Register via an invite link token */
export async function register(inviteToken: string, name: string, password: string): Promise<TeamUser> {
  const data = await apiFetch<{ token: string; user: TeamUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ token: inviteToken, name, password }),
  });
  setTeamToken(data.token);
  return data.user;
}

/** Sends a password reset email. Always resolves (server hides whether email exists). */
export async function forgotPassword(email: string): Promise<void> {
  await apiFetch("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/** Reset password using a token from the email link */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

// ─── Authenticated flows ──────────────────────────────────────────────────────

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ─── Admin flows ──────────────────────────────────────────────────────────────

export interface TeamUserRecord {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  isActive: boolean;
  createdAt: string;
}

export async function listUsers(): Promise<TeamUserRecord[]> {
  return apiFetch<TeamUserRecord[]>("/auth/users");
}

export interface InviteResult {
  inviteUrl: string;
  email: string;
  expiresAt: string;
}

export async function inviteUser(email: string): Promise<InviteResult> {
  return apiFetch<InviteResult>("/auth/invitations", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function updateUserRole(userId: string, role: "admin" | "member"): Promise<TeamUserRecord> {
  return apiFetch<TeamUserRecord>(`/auth/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function updateUser(userId: string, updates: { name?: string; isActive?: boolean }): Promise<TeamUserRecord> {
  return apiFetch<TeamUserRecord>(`/auth/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export interface AdminResetResult {
  resetUrl: string;
  email: string;
  expiresAt: string;
}

export async function adminResetPassword(userId: string): Promise<AdminResetResult> {
  return apiFetch<AdminResetResult>(`/auth/users/${userId}/reset-password`, {
    method: "POST",
  });
}

// ─── Legacy: passcode-based token (kept for WhatsApp external auth) ─────────

export async function loginWithPasscode(passcode: string): Promise<void> {
  const data = await apiFetch<{ token: string }>("/auth/token", {
    method: "POST",
    body: JSON.stringify({ passcode }),
  });
  setTeamToken(data.token);
}

/** @deprecated Use changePassword() instead */
export async function changePasscode(currentPasscode: string, newPasscode: string): Promise<void> {
  await apiFetch("/auth/change-passcode", {
    method: "POST",
    body: JSON.stringify({ currentPasscode, newPasscode }),
  });
}
