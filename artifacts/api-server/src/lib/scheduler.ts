/**
 * Scheduled jobs for the AI Monitor and maintenance tasks.
 * - Daily 08:00 UTC: push project report to Ultra Clear AI orchestrator.
 * - Daily 02:00 UTC: prune old uc_ai_feedback rows beyond retention window.
 */
import cron from "node-cron";
import { logger } from "./logger";
import { generateReport, setLatestReport } from "../routes/ai/monitor";
import { db, ucAiFeedbackTable, sheetSyncsTable } from "@workspace/db";
import { lt, desc, eq } from "drizzle-orm";
import { runSheetSync } from "../routes/contacts-sync.js";

export function startScheduler() {
  // Daily at 08:00 UTC — generate a fresh report and push to the orchestrator
  cron.schedule("0 8 * * *", async () => {
    logger.info("Scheduler: generating daily AI project report");
    try {
      const report = await generateReport();
      setLatestReport(report);
      logger.info("Scheduler: daily report generated successfully");

      const webhookUrl = process.env.AI_ORCHESTRATOR_WEBHOOK_URL;
      if (!webhookUrl) {
        logger.info(
          "Scheduler: AI_ORCHESTRATOR_WEBHOOK_URL not set, skipping push",
        );
        return;
      }

      const secret = process.env.PROJECTHUB_WEBHOOK_SECRET;
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "Authorization": `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({
          source: "projecthub",
          type: "daily_project_status_report",
          report,
        }),
      });

      if (res.ok) {
        logger.info(
          { status: res.status },
          "Scheduler: daily report pushed to Ultra Clear AI",
        );
      } else {
        logger.error(
          { status: res.status, body: await res.text() },
          "Scheduler: orchestrator webhook returned error",
        );
      }
    } catch (err) {
      logger.error({ err }, "Scheduler: failed to generate or push report");
    }
  }, { timezone: "UTC" });

  logger.info("Scheduler: daily AI report job registered (08:00 UTC)");

  // ─── Daily 02:00 UTC: prune old feedback rows ─────────────────────────────
  // Retention window is configurable via UC_FEEDBACK_RETENTION_DAYS (default 90).
  // Runs at 02:00 UTC to avoid peak hours.
  cron.schedule("0 2 * * *", async () => {
    const retentionDays = Math.max(
      1,
      parseInt(process.env["UC_FEEDBACK_RETENTION_DAYS"] ?? "90", 10) || 90,
    );
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    logger.info({ retentionDays, cutoff }, "Scheduler: pruning old AI feedback rows");
    try {
      const deleted = await db
        .delete(ucAiFeedbackTable)
        .where(lt(ucAiFeedbackTable.createdAt, cutoff));
      logger.info({ deleted }, "Scheduler: AI feedback pruning complete");
    } catch (err) {
      logger.error({ err }, "Scheduler: AI feedback pruning failed");
    }
  }, { timezone: "UTC" });

  logger.info(
    "Scheduler: daily AI feedback pruning job registered (02:00 UTC, default 90-day retention)",
  );

  // ─── Daily 06:00 UTC: sync contacts from Google Sheets ───────────────────
  // Reads the most-recently-configured sheet_syncs row and applies creates/updates
  // to the contacts table. Skips silently if no sheet is connected.
  cron.schedule("0 6 * * *", async () => {
    logger.info("Scheduler: starting daily Google Sheets contacts sync");
    try {
      const [sync] = await db
        .select()
        .from(sheetSyncsTable)
        .orderBy(desc(sheetSyncsTable.createdAt))
        .limit(1);

      if (!sync) {
        logger.info("Scheduler: no Google Sheet connected — skipping contacts sync");
        return;
      }

      const gidMatch = sync.sheetUrl.match(/[#&?]gid=(\d+)/);
      const gid = gidMatch?.[1];

      const result = await runSheetSync(sync.sheetUrl, gid);

      await db
        .update(sheetSyncsTable)
        .set({ lastSyncedAt: new Date() })
        .where(eq(sheetSyncsTable.id, sync.id));

      logger.info(
        { created: result.created, updated: result.updated, skipped: result.skipped, failed: result.failed },
        "Scheduler: Google Sheets contacts sync complete",
      );
    } catch (err) {
      logger.error({ err }, "Scheduler: Google Sheets contacts sync failed");
    }
  }, { timezone: "UTC" });

  logger.info("Scheduler: daily Google Sheets contacts sync registered (06:00 UTC)");
}
