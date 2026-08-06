/**
 * WhatsApp session manager using @whiskeysockets/baileys.
 *
 * Maintains a single long-lived WhatsApp Web socket connection.
 * On first boot (or after logout) it generates a QR code that the user
 * scans with their phone.  Credentials are stored in AUTH_DIR so the
 * session survives server restarts.
 *
 * External API:
 *   getWhatsAppStatus()               → { state, qr? }
 *   sendWhatsAppMessage(to, msg)      → Promise<string> (message key ID)
 *   initWhatsApp()                    → idempotent boot
 *   disconnectWhatsApp()              → logout + wipe session
 */

import { join } from "path";
import { toDataURL } from "qrcode";
import pino from "pino";
import { eq, isNull, or, ne, and } from "drizzle-orm";
import { db, notificationLogsTable } from "@workspace/db";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  type WASocket,
  WAMessageUpdate,
} from "@whiskeysockets/baileys";

// Credentials are stored in AUTH_DIR so they survive hot-reloads and process
// restarts.  The path is controlled by the WHATSAPP_SESSION_DIR env var so it
// can point to a persistent volume in production (e.g. a mounted directory or
// a symlink to object storage).  In development it defaults to a local folder
// alongside the repo (git-ignored — no secrets in VCS).
const AUTH_DIR =
  process.env.WHATSAPP_SESSION_DIR ?? join(process.cwd(), ".whatsapp-session");

// Silent pino logger for Baileys internals — we don't want its verbose output
// flooding the server console.
const baileysLogger = pino({ level: "silent" });

// ─── Module-level state ───────────────────────────────────────────────────────

export type WaState = "disconnected" | "connecting" | "qr" | "connected";

let sock: WASocket | null = null;
let currentQrDataUri: string | null = null;
let connectionState: WaState = "disconnected";
let isInitializing = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Public accessors ─────────────────────────────────────────────────────────

export function getWhatsAppStatus(): { state: WaState; qr: string | null } {
  return { state: connectionState, qr: currentQrDataUri };
}

/**
 * Send a WhatsApp message to the given phone number.
 * Returns the Baileys message key ID which can be stored to correlate
 * delivery/read receipts later.
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string
): Promise<string> {
  if (!sock || connectionState !== "connected") {
    throw new Error("WhatsApp session is not connected");
  }
  // Normalise number → JID: +254712345678 → 254712345678@s.whatsapp.net
  const digits = to.replace(/^\+/, "").replace(/\D/g, "");
  const jid = `${digits}@s.whatsapp.net`;
  const result = await sock.sendMessage(jid, { text });
  // result?.key?.id is the unique message ID Baileys assigns
  return result?.key?.id ?? "";
}

// ─── Receipt event handler ────────────────────────────────────────────────────

/**
 * Baileys WAMessageStatus enum values (from proto.WebMessageInfo.Status):
 *   PENDING      = 1
 *   SERVER_ACK   = 2
 *   DELIVERY_ACK = 3  → we map to "delivered"
 *   READ         = 4  → we map to "read"
 *   PLAYED       = 5  → we map to "read"
 */
async function handleMessageUpdates(updates: WAMessageUpdate[]): Promise<void> {
  for (const { key, update } of updates) {
    const msgId = key?.id;
    const status = update?.status;
    if (!msgId || status == null) continue;

    let deliveryStatus: "delivered" | "read" | null = null;
    if (status >= 4) {
      deliveryStatus = "read";
    } else if (status === 3) {
      deliveryStatus = "delivered";
    }
    if (!deliveryStatus) continue;

    try {
      // Only upgrade, never downgrade: delivered → read is allowed; read → delivered is not.
      const whereClause =
        deliveryStatus === "read"
          ? and(
              eq(notificationLogsTable.whatsappMessageId, msgId),
              or(
                isNull(notificationLogsTable.deliveryStatus),
                ne(notificationLogsTable.deliveryStatus, "read")
              )
            )
          : and(
              eq(notificationLogsTable.whatsappMessageId, msgId),
              isNull(notificationLogsTable.deliveryStatus)
            );

      await db
        .update(notificationLogsTable)
        .set({ deliveryStatus })
        .where(whereClause);
    } catch {
      // Non-fatal: receipt tracking should not crash the main flow
    }
  }
}

// ─── Session lifecycle ────────────────────────────────────────────────────────

export async function initWhatsApp(): Promise<void> {
  if (isInitializing || connectionState === "connected") return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  isInitializing = true;
  connectionState = "connecting";
  currentQrDataUri = null;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger as never),
      },
      printQRInTerminal: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: baileysLogger as any,
      // Prevent Baileys from loading the browser media cache — keeps memory low
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          currentQrDataUri = await toDataURL(qr, { errorCorrectionLevel: "M", margin: 2 });
          connectionState = "qr";
          isInitializing = false;
        } catch {
          // If QR generation fails just stay in connecting state
        }
      }

      if (connection === "close") {
        const statusCode =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        sock = null;
        currentQrDataUri = null;
        connectionState = "disconnected";
        isInitializing = false;

        if (shouldReconnect) {
          // Back off 5 s before reconnecting so we don't hammer the WA servers
          reconnectTimer = setTimeout(() => initWhatsApp(), 5_000);
        }
      }

      if (connection === "open") {
        currentQrDataUri = null;
        connectionState = "connected";
        isInitializing = false;
      }
    });

    sock.ev.on("creds.update", saveCreds);

    // ── Delivery & read receipts ─────────────────────────────────────────────
    // Baileys fires "messages.update" when the remote party receives or reads
    // a message we sent.  We match by the Baileys message key ID stored in the
    // notification_logs table and upgrade the delivery_status column.
    sock.ev.on("messages.update", (updates) => {
      // Fire-and-forget; errors are swallowed inside handleMessageUpdates
      void handleMessageUpdates(updates as WAMessageUpdate[]);
    });
  } catch (err) {
    console.error("[whatsapp] Init failed:", err);
    connectionState = "disconnected";
    isInitializing = false;
    // Retry after 10 s on unexpected init error
    reconnectTimer = setTimeout(() => initWhatsApp(), 10_000);
  }
}

export async function disconnectWhatsApp(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // Ignore — socket may already be closed
    }
    sock = null;
  }
  currentQrDataUri = null;
  connectionState = "disconnected";
  isInitializing = false;
}
