import { Router, type IRouter } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { db, tasksTable, systemStatusTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  IngestWebhookBody,
  IngestWebhookResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

/** Verify X-Webhook-Signature header using HMAC-SHA256 over the raw body. */
function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader) return false;
  // Accept "sha256=<hex>" or bare hex
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;
  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// Validate incoming webhook from Team AI Embedded and other connected platforms.
// Required fields: assigneeId, resourceRequired, deliveryFormat
router.post("/webhook/ingest", async (req, res): Promise<void> => {
  // ── HMAC signature check ────────────────────────────────────────────────────
  const secret = process.env["PROJECTHUB_WEBHOOK_SECRET"];
  if (secret) {
    const rawBody: Buffer = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
    const sig = req.headers["x-webhook-signature"] as string | undefined;
    if (!verifyWebhookSignature(rawBody, sig, secret)) {
      res.status(401).json({ error: "Invalid or missing webhook signature" });
      return;
    }
  }
  const parsed = IngestWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { event, sourcePlatform, taskData } = parsed.data;
  const validationErrors: string[] = [];

  // Validation layer: mandatory field check before syncing
  if (taskData) {
    if (taskData.assigneeId == null) {
      validationErrors.push("taskData.assigneeId is required");
    }
    if (!taskData.resourceRequired) {
      validationErrors.push("taskData.resourceRequired is required");
    }
    if (!taskData.deliveryFormat) {
      validationErrors.push("taskData.deliveryFormat is required");
    }
  }

  if (validationErrors.length > 0) {
    req.log.warn({ validationErrors, sourcePlatform, event }, "Webhook validation failed");
    res.status(400).json(
      IngestWebhookResponse.parse({
        accepted: false,
        taskId: null,
        message: "Validation failed — missing required fields",
        validationErrors,
      })
    );
    return;
  }

  // Update system_status lastSync for the source platform
  try {
    await db
      .update(systemStatusTable)
      .set({ lastSync: new Date(), lastChecked: new Date(), status: "connected" })
      .where(eq(systemStatusTable.platform, sourcePlatform));
  } catch (_e) {
    // Non-fatal — platform may not be registered yet
  }

  // Create the task if taskData is provided
  let taskId: number | null = null;
  if (taskData && taskData.projectId && taskData.title) {
    try {
      const [task] = await db
        .insert(tasksTable)
        .values({
          projectId: taskData.projectId,
          title: taskData.title,
          description: taskData.description ?? "",
          status: (taskData.status as string) ?? "todo",
          priority: (taskData.priority as string) ?? "medium",
          assigneeId: taskData.assigneeId ?? null,
          dueDate: taskData.dueDate ?? null,
          sourcePlatform,
          resourceRequired: taskData.resourceRequired ?? null,
          deliveryFormat: taskData.deliveryFormat ?? null,
          notifyVia: taskData.notifyVia ?? null,
        })
        .returning();
      taskId = task?.id ?? null;
      req.log.info({ taskId, sourcePlatform, event }, "Webhook task ingested");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      req.log.error({ error: message }, "Failed to create task from webhook");
      res.status(500).json({ error: "Failed to ingest task" });
      return;
    }
  }

  res.json(
    IngestWebhookResponse.parse({
      accepted: true,
      taskId,
      message: `Event '${event}' from '${sourcePlatform}' accepted`,
      validationErrors: [],
    })
  );
});

export default router;
