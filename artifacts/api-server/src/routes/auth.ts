/**
 * Internal auth routes for ProjectHub team access.
 *
 * POST /api/auth/token
 *   Validates a passcode and issues a signed "team-session" JWT.
 *   Checks the DB-stored bcrypt hash first; falls back to a constant-time
 *   comparison against SESSION_SECRET for deployments that haven't set a
 *   custom passcode yet (i.e. on first deploy).
 *
 * POST /api/auth/change-passcode
 *   Verifies the current passcode, then stores a bcrypt hash of the new one
 *   in the team_settings DB table.  Requires a valid team-session Bearer token.
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { issueToken, verifyToken } from "../lib/jwt.js";
import { db, teamSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Requires a valid "team-session" JWT.
 * Re-exported so other routers (whatsapp, contacts-sync) can use the same guard.
 */
export function requireTeamAuth(req: Request, res: Response, next: NextFunction): void {
  const claims = verifyToken(req.headers["authorization"]);
  if (!claims || claims.type !== "team-session") {
    res.status(401).json({ error: "Authentication required. Obtain a token via POST /api/auth/token." });
    return;
  }
  next();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Verify a submitted passcode against:
 * 1. A bcrypt hash stored in team_settings (preferred — set via change-passcode).
 * 2. Constant-time comparison against SESSION_SECRET (first-deploy fallback).
 */
async function verifyPasscode(submitted: string): Promise<boolean> {
  // 1 — Check for a DB-stored hash
  const [row] = await db
    .select()
    .from(teamSettingsTable)
    .where(eq(teamSettingsTable.id, "singleton"))
    .limit(1);

  if (row?.passcodeHash) {
    return bcrypt.compare(submitted, row.passcodeHash);
  }

  // 2 — Fall back to SESSION_SECRET (plain constant-time comparison)
  const secret = process.env["SESSION_SECRET"];
  if (!secret) return false;

  try {
    const a = Buffer.from(secret);
    const b = Buffer.from(submitted);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/token
 * Exchange the team passcode for a signed JWT.
 */
router.post("/auth/token", async (req, res): Promise<void> => {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    res.status(503).json({ error: "Auth not configured — SESSION_SECRET must be set." });
    return;
  }

  const { passcode } = req.body ?? {};
  if (!passcode || typeof passcode !== "string" || !passcode.trim()) {
    res.status(400).json({ error: "passcode is required." });
    return;
  }

  const ok = await verifyPasscode(passcode.trim());
  if (!ok) {
    res.status(401).json({ error: "Invalid passcode." });
    return;
  }

  const exp = Math.floor(Date.now() / 1000) + 8 * 60 * 60;
  const token = issueToken({
    id: "team",
    email: "team@projecthub.internal",
    type: "team-session",
    exp,
  });

  res.json({ token });
});

/**
 * POST /api/auth/change-passcode
 * Verify the current passcode and store a bcrypt hash of the new one.
 * Requires a valid team-session Bearer token.
 */
router.post("/auth/change-passcode", requireTeamAuth, async (req, res): Promise<void> => {
  const { currentPasscode, newPasscode } = req.body ?? {};

  if (!currentPasscode || typeof currentPasscode !== "string" || !currentPasscode.trim()) {
    res.status(400).json({ error: "currentPasscode is required." });
    return;
  }
  if (!newPasscode || typeof newPasscode !== "string" || !newPasscode.trim()) {
    res.status(400).json({ error: "newPasscode is required." });
    return;
  }
  if (newPasscode.trim().length < 8) {
    res.status(400).json({ error: "New passcode must be at least 8 characters." });
    return;
  }

  const ok = await verifyPasscode(currentPasscode.trim());
  if (!ok) {
    res.status(401).json({ error: "Current passcode is incorrect." });
    return;
  }

  const hash = await bcrypt.hash(newPasscode.trim(), 12);
  await db
    .insert(teamSettingsTable)
    .values({ id: "singleton", passcodeHash: hash, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: teamSettingsTable.id,
      set: { passcodeHash: hash, updatedAt: new Date() },
    });

  res.json({ ok: true });
});

export default router;
