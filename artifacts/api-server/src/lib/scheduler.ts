/**
 * Scheduled jobs for the AI Monitor.
 * Runs a daily push to the Ultra Clear AI orchestrator at 08:00 UTC.
 */
import cron from "node-cron";
import { logger } from "./logger";
import { generateReport, setLatestReport } from "../routes/ai/monitor";

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

      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "Origin": "https://team-horizon--jerryaroyce.replit.app",
          "Referer": "https://team-horizon--jerryaroyce.replit.app/",
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
  });

  logger.info("Scheduler: daily AI report job registered (08:00 UTC)");
}
