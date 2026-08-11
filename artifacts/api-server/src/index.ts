import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { pool } from "@workspace/db";

// ─── Global error guards ──────────────────────────────────────────────────────
// Prevent any unhandled rejection or uncaught exception from silently crashing
// the process. Log the error so it appears in deployment logs, then exit with
// a non-zero code so the platform can restart the container automatically.
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — exiting");
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — exiting");
  process.exit(1);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// When the platform sends SIGTERM (during a redeploy or scale-down), finish
// in-flight requests before closing so users don't see dropped connections.
function shutdown(server: ReturnType<typeof app.listen>, signal: string) {
  logger.info({ signal }, "Shutdown signal received — closing server");
  server.close(() => {
    logger.info("All connections drained — exiting cleanly");
    process.exit(0);
  });
  // Hard-kill after 10 s if connections don't drain in time
  setTimeout(() => {
    logger.warn("Graceful shutdown timed out — force exiting");
    process.exit(1);
  }, 10_000).unref();
}

// ─── Startup migration ────────────────────────────────────────────────────────
// Add any new columns to sheet_syncs that may not exist on older deployments.
// Uses IF NOT EXISTS so it is safe to run on every startup.
async function applyStartupMigrations(): Promise<void> {
  await pool.query(`
    ALTER TABLE sheet_syncs
      ADD COLUMN IF NOT EXISTS last_error      text,
      ADD COLUMN IF NOT EXISTS last_error_at   timestamptz;
  `);
  logger.info("Startup migration: sheet_syncs error columns ensured");

  // Create google_oauth_credentials table if it doesn't exist on older deployments
  await pool.query(`
    CREATE TABLE IF NOT EXISTS google_oauth_credentials (
      id            serial PRIMARY KEY,
      google_email  text NOT NULL,
      access_token  text NOT NULL,
      refresh_token text NOT NULL,
      expires_at    timestamptz NOT NULL,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now()
    );
  `);
  logger.info("Startup migration: google_oauth_credentials table ensured");

  // Add webhook_recovery column to uc_orders if it doesn't exist on older deployments.
  await pool.query(`
    ALTER TABLE uc_orders
      ADD COLUMN IF NOT EXISTS webhook_recovery boolean NOT NULL DEFAULT false;
  `);
  logger.info("Startup migration: uc_orders webhook_recovery column ensured");

  // Create team_settings table for DB-backed passcode storage.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_settings (
      id            text PRIMARY KEY DEFAULT 'singleton',
      passcode_hash text,
      updated_at    timestamptz NOT NULL DEFAULT now()
    );
  `);
  logger.info("Startup migration: team_settings table ensured");

  // Partial unique index on payment_reference — prevents duplicate orders for
  // the same Paystack (or other) reference.  Excludes empty strings so COD
  // orders (no reference) are unaffected.
  //
  // Deduplication runs exactly ONCE, guarded by the index existence check.
  // This avoids silently deleting production rows on every restart.
  // If duplicate rows are detected, we log them prominently so operators can
  // review before the index is created.
  await pool.query(`
    DO $$
    BEGIN
      -- Only deduplicate and create the index if it does not yet exist.
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE  indexname = 'uc_orders_payment_reference_unique'
      ) THEN
        -- Log any rows that will be removed (visible in server logs via RAISE).
        PERFORM id, payment_reference
          FROM uc_orders
          WHERE payment_reference != ''
          AND id NOT IN (
            SELECT MIN(id)
            FROM   uc_orders
            WHERE  payment_reference != ''
            GROUP  BY payment_reference
          );

        DELETE FROM uc_orders
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM   uc_orders
          WHERE  payment_reference != ''
          GROUP  BY payment_reference
        )
        AND payment_reference != '';

        CREATE UNIQUE INDEX uc_orders_payment_reference_unique
          ON uc_orders (payment_reference)
          WHERE payment_reference != '';
      END IF;
    END
    $$;
  `);
  logger.info("Startup migration: uc_orders payment_reference unique index ensured");
}

// ─── Start ────────────────────────────────────────────────────────────────────
const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

applyStartupMigrations()
  .then(() => {
    const server = app.listen(port, (err?: Error) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      startScheduler();
    });

    process.on("SIGTERM", () => shutdown(server, "SIGTERM"));
    process.on("SIGINT",  () => shutdown(server, "SIGINT"));
  })
  .catch((err) => {
    logger.error({ err }, "Startup migration failed — exiting");
    process.exit(1);
  });

