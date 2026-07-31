/**
 * UC Impact Metrics
 *
 * GET  /api/uc/impact         — live stats (auto + admin offset)
 * POST /api/uc/impact/override — admin: set offset adjustments
 *
 * Calculations
 *   litresFiltered = Σ (order_item.quantity × PRODUCT_LITRES[productId])
 *                   for completed / processing orders, excluding CAT_SHOWER products
 *   plasticsAvoided = litresFiltered × 2   (500 ml bottle = 0.5 L → 1 L = 2 bottles)
 *   totalUsers      = COUNT(DISTINCT userId) from those same orders
 *
 * Admin offset is additive on top of the auto-calculated value, stored in
 * artifacts/api-server/data/impact-override.json for persistence across requests.
 */
import { Router, type Request, type Response, type IRouter } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  db,
  ucOrdersTable,
  ucOrderItemsTable,
} from "@workspace/db";
import { eq, inArray, not } from "drizzle-orm";

const router: IRouter = Router();

// ─── Product litre capacity map ───────────────────────────────────────────────
// Excludes CAT_SHOWER (ids 15,16,17,18,19) and shower/skin accessories (24,25).
// 0 = non-filtering product (carry sleeve, filter shell, gift bundle with no filter).

const PRODUCT_LITRES: Record<number, number> = {
  1:  150,   // Hydra Flux bottle
  2:  150,   // Truva Go bottle
  3:  150,   // Viva Drop bottle
  4:  150,   // Flex bottle
  5:  150,   // Timbo bottle
  6:  150,   // Gym Buddy bottle
  7:  400,   // Survivor Straw
  8:  150,   // Breeze bottle
  9:  400,   // EcoSmart Elite
  11: 1750,  // Sweet Home faucet (avg 1500–2000 L rated)
  12: 1500,  // Counter Reverse Osmosis
  13: 400,   // Electric Pitcher
  14: 10000, // RO Home System (full membrane cycle)
  20: 300,   // Gift & Bundle (conservative mixed estimate)
  21: 0,     // Bottle Carry Sleeve
  22: 150,   // Bottle Filter Cartridge (replacement)
  23: 1750,  // Faucet Filter Cartridge (replacement)
  26: 400,   // Survivor Straw Cartridge (replacement)
  27: 0,     // Filter Shell
  29: 50000, // Aqua Stream 1200 (commercial)
};

// Statuses that count as "fulfilled" for impact purposes
const FULFILLED_STATUSES = ["completed", "processing", "on-hold"];

// ─── Override file ─────────────────────────────────────────────────────────────
const OVERRIDE_FILE = path.resolve("artifacts/api-server/data/impact-override.json");

interface ImpactOverride {
  litresOffset:  number;
  usersOffset:   number;
  lastUpdatedBy: string;
  lastUpdatedAt: string;
}

const DEFAULT_OVERRIDE: ImpactOverride = {
  litresOffset:  0,
  usersOffset:   0,
  lastUpdatedBy: "system",
  lastUpdatedAt: "",
};

let _override: ImpactOverride | null = null;

async function readOverride(): Promise<ImpactOverride> {
  if (_override !== null) return _override;
  try {
    const raw = await fs.readFile(OVERRIDE_FILE, "utf8");
    _override = JSON.parse(raw) as ImpactOverride;
  } catch {
    _override = { ...DEFAULT_OVERRIDE };
  }
  return _override;
}

async function writeOverride(o: ImpactOverride): Promise<void> {
  _override = o;
  await fs.writeFile(OVERRIDE_FILE, JSON.stringify(o, null, 2), "utf8");
}

// ─── Auto-calculate from DB ───────────────────────────────────────────────────

async function calcImpactFromDb(): Promise<{ totalUsers: number; litresFiltered: number }> {
  // Get all fulfilled order ids + distinct user ids
  const orders = await db
    .select({ id: ucOrdersTable.id, userId: ucOrdersTable.userId })
    .from(ucOrdersTable)
    .where(inArray(ucOrdersTable.status, FULFILLED_STATUSES));

  if (orders.length === 0) return { totalUsers: 0, litresFiltered: 0 };

  const orderIds  = orders.map(o => o.id);
  const userIds   = new Set(orders.map(o => o.userId));
  const totalUsers = userIds.size;

  // Sum litres from line items
  const items = await db
    .select({
      productId: ucOrderItemsTable.productId,
      quantity:  ucOrderItemsTable.quantity,
    })
    .from(ucOrderItemsTable)
    .where(inArray(ucOrderItemsTable.orderId, orderIds));

  let litresFiltered = 0;
  for (const item of items) {
    const capacity = PRODUCT_LITRES[item.productId] ?? 0;
    litresFiltered += capacity * item.quantity;
  }

  return { totalUsers, litresFiltered };
}

// ─── GET /api/uc/impact ───────────────────────────────────────────────────────

router.get("/uc/impact", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [{ totalUsers: dbUsers, litresFiltered: dbLitres }, override] = await Promise.all([
      calcImpactFromDb(),
      readOverride(),
    ]);

    const totalUsers      = dbUsers      + (override.usersOffset  ?? 0);
    const litresFiltered  = dbLitres     + (override.litresOffset ?? 0);
    const plasticsAvoided = litresFiltered * 2; // 1 L = 2 × 500 ml bottles

    res.json({
      totalUsers:      Math.max(0, totalUsers),
      litresFiltered:  Math.max(0, litresFiltered),
      plasticsAvoided: Math.max(0, plasticsAvoided),
      autoStats: {
        totalUsers:     dbUsers,
        litresFiltered: dbLitres,
      },
      override: {
        litresOffset:  override.litresOffset,
        usersOffset:   override.usersOffset,
        lastUpdatedBy: override.lastUpdatedBy,
        lastUpdatedAt: override.lastUpdatedAt,
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[uc/impact] calculation error:", err);
    res.status(500).json({ error: "Failed to calculate impact metrics" });
  }
});

// ─── POST /api/uc/impact/override ─────────────────────────────────────────────

router.post("/uc/impact/override", async (req: Request, res: Response): Promise<void> => {
  const { litresOffset, usersOffset, updatedBy } = req.body as {
    litresOffset?: unknown;
    usersOffset?:  unknown;
    updatedBy?:    unknown;
  };

  if (
    litresOffset !== undefined &&
    (typeof litresOffset !== "number" || !isFinite(litresOffset))
  ) {
    res.status(400).json({ error: "litresOffset must be a finite number" });
    return;
  }
  if (
    usersOffset !== undefined &&
    (typeof usersOffset !== "number" || !isFinite(usersOffset))
  ) {
    res.status(400).json({ error: "usersOffset must be a finite number" });
    return;
  }

  const current = await readOverride();
  const next: ImpactOverride = {
    litresOffset:  typeof litresOffset === "number" ? Math.round(litresOffset) : current.litresOffset,
    usersOffset:   typeof usersOffset  === "number" ? Math.round(usersOffset)  : current.usersOffset,
    lastUpdatedBy: typeof updatedBy    === "string" ? updatedBy : "admin",
    lastUpdatedAt: new Date().toISOString(),
  };

  await writeOverride(next);
  res.json({ ok: true, override: next });
});

export default router;
