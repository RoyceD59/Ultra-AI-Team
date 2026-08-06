/**
 * Internal auth routes for ProjectHub team access.
 *
 * POST /api/auth/token
 *   Validates a passcode against SESSION_SECRET and issues a signed
 *   "team-session" JWT.  The JWT is used by the ProjectHub frontend to
 *   authenticate WhatsApp management and send routes.
 *
 * No credentials are stored in the database; the SESSION_SECRET env var
 * acts as the team passcode.  If SESSION_SECRET is not set the endpoint
 * returns 503 so the deployment fails loudly rather than silently accepting
 * any passcode.
 */

import { Router, type IRouter } from "express";
import { timingSafeEqual } from "crypto";
import { issueToken } from "../lib/jwt.js";

const router: IRouter = Router();

router.post("/auth/token", (req, res): void => {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    res
      .status(503)
      .json({ error: "Auth not configured — SESSION_SECRET must be set." });
    return;
  }

  const { passcode } = req.body ?? {};
  if (!passcode || typeof passcode !== "string" || passcode.trim() === "") {
    res.status(400).json({ error: "passcode is required." });
    return;
  }

  // Constant-time comparison prevents timing oracle attacks
  let match = false;
  try {
    const a = Buffer.from(secret);
    const b = Buffer.from(passcode.trim());
    match = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    match = false;
  }

  if (!match) {
    res.status(401).json({ error: "Invalid passcode." });
    return;
  }

  // Issue a JWT that identifies this as a ProjectHub team session.
  // exp: 8 hours from now (validated at the middleware level).
  const exp = Math.floor(Date.now() / 1000) + 8 * 60 * 60;
  const token = issueToken({
    id: "team",
    email: "team@projecthub.internal",
    type: "team-session",
    exp,
  });

  res.json({ token });
});

export default router;
