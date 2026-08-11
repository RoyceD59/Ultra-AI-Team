/**
 * Google Sheets sync endpoints for the Contacts feature.
 *
 *   GET  /api/contacts/sync/sheets  — return current sheet config + last-sync status
 *   POST /api/contacts/sync/sheets  — save sheet config (body: { sheetUrl, sheetLabel, gid? })
 *   POST /api/contacts/sync/sheets/run — trigger an immediate sync, returns counts
 *   GET  /api/contacts/sync/sheets/tabs — return tab list for a given URL (query: url)
 *
 * All mutating routes require a valid ProjectHub session JWT.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  sheetSyncsTable,
  contactsTable,
  contactMethodsTable,
} from "@workspace/db";
import { verifyToken } from "../lib/jwt.js";
import { logger } from "../lib/logger.js";
import {
  fetchSheetRows,
  type RawRow,
} from "../lib/sheets.js";

const router: IRouter = Router();

// ─── Auth guard ───────────────────────────────────────────────────────────────

function requireTeamAuth(req: Request, res: Response): boolean {
  const claims = verifyToken(req.headers["authorization"] as string | undefined);
  if (!claims) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  if (claims.type !== "team-session") {
    res.status(403).json({ error: "Team session required" });
    return false;
  }
  return true;
}

// ─── Row mapping (mirrors ImportContactsDialog.tsx mapRow) ────────────────────

interface MappedRow {
  fullName: string;
  tags: string[];
  email?: string;
  phone?: string;
  phoneChannel: "sms" | "whatsapp";
  recordId?: string;
}

function mapRow(row: RawRow): MappedRow | null {
  const str = (v: unknown) =>
    v === null || v === undefined ? "" : String(v).trim();

  const fullName = str(row["full_name"]);
  if (!fullName) return null;

  const tags: string[] = [];

  const primary = str(row["Primary_Product"]);
  if (primary) tags.push(primary);

  const secondary = str(row["Secondary_product"]);
  if (secondary) tags.push(secondary);

  const active = str(row["Customer_active"]).toLowerCase();
  if (active === "yes" || active === "true" || active === "1") {
    tags.push("active");
  } else if (active === "no" || active === "false" || active === "0") {
    tags.push("inactive");
  }

  const consent = str(row["Consent"]).toLowerCase();
  if (consent === "yes" || consent === "true" || consent === "1") {
    tags.push("consent:yes");
  } else if (consent === "no" || consent === "false" || consent === "0") {
    tags.push("consent:no");
  }

  const recordId = str(row["Unique Record_ID"]);
  if (recordId) tags.push(`id:${recordId}`);

  const preferred = str(row["Preferred_contact"]).toLowerCase();
  const phoneChannel: "sms" | "whatsapp" =
    preferred === "whatsapp" ? "whatsapp" : "sms";

  return {
    fullName,
    tags,
    email: str(row["email"]) || undefined,
    phone: str(row["phone"]) || undefined,
    phoneChannel,
    recordId: recordId || undefined,
  };
}

// ─── Core sync logic (shared by manual trigger + scheduler) ──────────────────

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

export async function runSheetSync(
  sheetUrl: string,
  gid?: string
): Promise<SyncResult> {
  const rawRows = await fetchSheetRows(sheetUrl, gid);
  const rows = rawRows.map(mapRow).filter((r): r is MappedRow => r !== null);

  // Build a map of existing record-ID → contact id
  const allContacts = await db
    .select({ id: contactsTable.id, tags: contactsTable.tags })
    .from(contactsTable);

  const recordIdToContactId = new Map<string, number>();
  for (const c of allContacts) {
    for (const tag of c.tags ?? []) {
      if (tag.startsWith("id:")) {
        recordIdToContactId.set(tag.slice(3), c.id);
      }
    }
  }

  // Build existing email set (for dedup on create path)
  const existingMethods = await db
    .select({ channelValue: contactMethodsTable.channelValue })
    .from(contactMethodsTable)
    .where(eq(contactMethodsTable.channelType, "email"));
  const existingEmails = new Set(
    existingMethods.map((m) => m.channelValue.toLowerCase())
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const batchEmails = new Set<string>();

  for (const row of rows) {
    const existingId = row.recordId
      ? recordIdToContactId.get(row.recordId)
      : undefined;

    if (existingId !== undefined) {
      // ── Update existing contact + reconcile contact methods ──────────────
      try {
        await db.transaction(async (tx) => {
          // 1. Update core fields
          await tx
            .update(contactsTable)
            .set({ fullName: row.fullName, tags: row.tags })
            .where(eq(contactsTable.id, existingId));

          // 2. Fetch existing methods for this contact
          const existingContactMethods = await tx
            .select()
            .from(contactMethodsTable)
            .where(eq(contactMethodsTable.contactId, existingId));

          const existingEmail = existingContactMethods.find(
            (m) => m.channelType === "email"
          );
          const existingPhone = existingContactMethods.find(
            (m) => m.channelType === "sms" || m.channelType === "whatsapp"
          );

          // 3. Reconcile email method
          if (row.email) {
            if (existingEmail) {
              // Update if value changed
              if (existingEmail.channelValue.toLowerCase() !== row.email.toLowerCase()) {
                await tx
                  .update(contactMethodsTable)
                  .set({ channelValue: row.email })
                  .where(eq(contactMethodsTable.id, existingEmail.id));
              }
            } else {
              // Create new email method
              await tx.insert(contactMethodsTable).values({
                contactId: existingId,
                channelType: "email",
                channelValue: row.email,
                isPreferred: row.phoneChannel !== "whatsapp",
              });
            }
          }

          // 4. Reconcile phone method
          if (row.phone) {
            if (existingPhone) {
              // Update value and/or channel type if changed
              const channelChanged = existingPhone.channelType !== row.phoneChannel;
              const valueChanged = existingPhone.channelValue !== row.phone;
              if (channelChanged || valueChanged) {
                await tx
                  .update(contactMethodsTable)
                  .set({ channelType: row.phoneChannel, channelValue: row.phone })
                  .where(eq(contactMethodsTable.id, existingPhone.id));
              }
            } else {
              // Create new phone method
              await tx.insert(contactMethodsTable).values({
                contactId: existingId,
                channelType: row.phoneChannel,
                channelValue: row.phone,
                isPreferred: true,
              });
            }
          }
        });

        updated++;
      } catch (err) {
        logger.error({ err, existingId }, "Sheet sync: failed to update contact");
        failed++;
      }
      continue;
    }

    // ── Create new contact ───────────────────────────────────────────────────
    const normEmail = row.email ? row.email.toLowerCase() : null;
    if (normEmail && (existingEmails.has(normEmail) || batchEmails.has(normEmail))) {
      skipped++;
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        const [contact] = await tx
          .insert(contactsTable)
          .values({
            fullName: row.fullName,
            role: "",
            organization: "",
            tags: row.tags,
          })
          .returning();

        if (row.email) {
          await tx.insert(contactMethodsTable).values({
            contactId: contact.id,
            channelType: "email",
            channelValue: row.email,
            isPreferred: row.phoneChannel !== "whatsapp",
          });
        }

        if (row.phone) {
          await tx.insert(contactMethodsTable).values({
            contactId: contact.id,
            channelType: row.phoneChannel,
            channelValue: row.phone,
            isPreferred: true,
          });
        }
      });

      if (normEmail) {
        existingEmails.add(normEmail);
        batchEmails.add(normEmail);
      }
      if (row.recordId) recordIdToContactId.set(row.recordId, -1); // mark seen
      created++;
    } catch (err) {
      logger.error({ err }, "Sheet sync: failed to create contact");
      failed++;
    }
  }

  return { created, updated, skipped, failed };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /contacts/sync/sheets — return current sheet config
router.get("/contacts/sync/sheets", async (_req, res): Promise<void> => {
  const [sync] = await db
    .select()
    .from(sheetSyncsTable)
    .orderBy(desc(sheetSyncsTable.createdAt))
    .limit(1);

  if (!sync) {
    res.json({ connected: false });
    return;
  }

  res.json({
    connected: true,
    id: sync.id,
    sheetUrl: sync.sheetUrl,
    sheetLabel: sync.sheetLabel,
    lastSyncedAt: sync.lastSyncedAt,
    lastError: sync.lastError ?? null,
    lastErrorAt: sync.lastErrorAt ?? null,
  });
});

// POST /contacts/sync/sheets — save/update sheet config
router.post("/contacts/sync/sheets", async (req, res): Promise<void> => {
  if (!requireTeamAuth(req, res)) return;

  const { sheetUrl, sheetLabel, gid } = req.body as {
    sheetUrl?: string;
    sheetLabel?: string;
    gid?: string;
  };

  if (!sheetUrl || typeof sheetUrl !== "string") {
    res.status(400).json({ error: "sheetUrl is required" });
    return;
  }

  // Validate it's a Google Sheets URL
  if (!sheetUrl.includes("docs.google.com/spreadsheets")) {
    res.status(400).json({
      error:
        "URL must be a Google Sheets share link (docs.google.com/spreadsheets/...)",
    });
    return;
  }

  // Store the GID in the URL if provided so we remember which tab
  let storedUrl = sheetUrl;
  if (gid && !storedUrl.includes(`gid=${gid}`)) {
    storedUrl = storedUrl.split("#")[0] + `#gid=${gid}`;
  }

  const [sync] = await db
    .insert(sheetSyncsTable)
    .values({
      sheetUrl: storedUrl,
      sheetLabel: sheetLabel ?? "",
    })
    .returning();

  res.status(201).json({
    connected: true,
    id: sync.id,
    sheetUrl: sync.sheetUrl,
    sheetLabel: sync.sheetLabel,
    lastSyncedAt: sync.lastSyncedAt,
  });
});

// POST /contacts/sync/sheets/run — trigger immediate sync
router.post("/contacts/sync/sheets/run", async (req, res): Promise<void> => {
  if (!requireTeamAuth(req, res)) return;

  const [sync] = await db
    .select()
    .from(sheetSyncsTable)
    .orderBy(desc(sheetSyncsTable.createdAt))
    .limit(1);

  if (!sync) {
    res.status(400).json({ error: "No Google Sheet connected. Connect one first." });
    return;
  }

  try {
    // Extract GID from stored URL if present
    const gidMatch = sync.sheetUrl.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch?.[1];

    const result = await runSheetSync(sync.sheetUrl, gid);

    // Update lastSyncedAt and clear any previous error state
    await db
      .update(sheetSyncsTable)
      .set({ lastSyncedAt: new Date(), lastError: null, lastErrorAt: null })
      .where(eq(sheetSyncsTable.id, sync.id));

    res.json({ ...result, syncedAt: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, "Sheet sync: manual sync failed");
    const message = err instanceof Error ? err.message : "Sync failed";

    // Record the failure so the warning badge reflects current health
    await db
      .update(sheetSyncsTable)
      .set({ lastError: message, lastErrorAt: new Date() })
      .where(eq(sheetSyncsTable.id, sync.id))
      .catch(() => { /* best-effort — don't mask the original error */ });

    res.status(502).json({ error: message });
  }
});

export default router;
