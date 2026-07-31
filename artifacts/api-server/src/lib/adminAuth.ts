/**
 * Shared admin-auth helper for UC routes.
 *
 * isAdminRequest   — returns true only when the bearer token resolves to a DB-
 *                    anchored admin user. Fails closed on any error.
 * requireAdmin     — convenience wrapper: sends 401 and returns false when the
 *                    caller is not an admin, so route handlers can early-return.
 *
 * Admin is NEVER derived from JWT claims alone — the dev-login fallback can
 * mint tokens with arbitrary emails.  The DB row is always consulted.
 */
import { type Request, type Response } from "express";
import { db, ucUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyToken } from "./jwt.js";

function adminEmailList(): string[] {
  return (process.env["UC_ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAdminRequest(authHeader: string | undefined): Promise<boolean> {
  const claims = verifyToken(authHeader);
  if (!claims) return false;

  const numericId = Number(claims.id);
  if (isNaN(numericId) || numericId <= 0 || numericId >= 1_000_000_000) return false;

  try {
    const dbUser = await db.query.ucUsersTable.findFirst({
      where: eq(ucUsersTable.id, numericId),
    });
    if (!dbUser) return false;
    return dbUser.isAdmin || adminEmailList().includes(dbUser.email.toLowerCase());
  } catch {
    return false; // DB unavailable → fail closed
  }
}

/** Sends 401 and returns false when the caller is not an admin. */
export async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const ok = await isAdminRequest(req.headers["authorization"]);
  if (!ok) {
    res.status(401).json({ error: "Admin authentication required" });
    return false;
  }
  return true;
}
