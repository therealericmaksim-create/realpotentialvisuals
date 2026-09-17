// Per-render workflow state (order_items.stage).
//
// This is the real pipeline. An order is just a basket: its renders move
// independently, so QC can send one back to the curator while another is
// already rendering, and an order can be five-sixths delivered. Anything
// that needs to know "where is this work" asks a render, never an order.
//
// orders.status is a rollup of these, kept only so the Orders list and
// anything reading an order as a whole still has one coarse answer.
//
// The vocabulary lives here rather than in a DB CHECK constraint on
// purpose — SQLite cannot alter a CHECK in place, and the table rebuild
// required to change one fails against D1, so a CHECK here would freeze
// the pipeline permanently. See migrations/0006.

export const ORDER_ITEM_STAGES = [
  // Paid, but not yet handed to a curator. "Push to Curator" on the order
  // page is what moves curated and premium renders on — that stays an
  // explicit staff decision, so a bad photo or a junk order can be caught
  // before a curator spends time on it.
  "received",
  // With a curator, waiting for a style to be chosen.
  "in_curation",
  // Style chosen; QC checks the choice and the render instruction.
  "in_qc",
  // QC approved it; the image needs generating, and then accepting.
  "in_production",
  // An operator accepted a generated image as the finished render. This is
  // the only stage the customer is shown a picture for.
  "complete",
  // Out of every queue on purpose. self_directed renders live here: the
  // customer picked their own style, and that path is deliberately
  // deferred work, so they must not surface in queues built for the
  // staffed tiers.
  "on_hold",
] as const;

export type OrderItemStage = (typeof ORDER_ITEM_STAGES)[number];

export function isOrderItemStage(value: string): value is OrderItemStage {
  return (ORDER_ITEM_STAGES as readonly string[]).includes(value);
}

// Admin-facing. Staff see the pipeline in its own terms.
export const STAGE_LABELS: Record<OrderItemStage, string> = {
  received: "Received",
  in_curation: "In Curation",
  in_qc: "In QC",
  in_production: "In Production",
  complete: "Complete",
  on_hold: "On hold",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as OrderItemStage] ?? stage;
}

// Customer-facing. The internal stage names are operational vocabulary
// ('in_qc' means nothing to someone who bought a picture of their house),
// so the customer gets plain progress language instead.
export const CUSTOMER_STAGE_LABELS: Record<OrderItemStage, string> = {
  received: "Received",
  in_curation: "Choosing your style",
  in_qc: "Being reviewed",
  in_production: "Being rendered",
  complete: "Ready",
  on_hold: "On hold",
};

export function customerStageLabel(stage: string): string {
  return CUSTOMER_STAGE_LABELS[stage as OrderItemStage] ?? stage;
}

// orders.status as a function of its renders' stages. Ordered by how far
// back in the pipeline the work is: whatever is least finished is what the
// order as a whole still needs.
//
// Only values already in the orders.status CHECK constraint are produced —
// that constraint cannot be changed (see migrations/0006), so the stage
// 'in_production' rolls up to the stored status 'in_progress', which the
// UI labels "In Production".
export function rollupOrderStatus(stages: string[]): string | null {
  const live = stages.filter((s) => s !== "on_hold");
  if (live.length === 0) return null;
  if (live.every((s) => s === "complete")) return "complete";
  if (live.some((s) => s === "in_curation")) return "in_curation";
  if (live.some((s) => s === "in_qc")) return "in_qc";
  if (live.some((s) => s === "in_production")) return "in_progress";
  if (live.some((s) => s === "received")) return "placed";
  return null;
}

// Recomputes and stores one order's rollup status. Called after anything
// that moves a render between stages, so the Orders list never disagrees
// with the queues.
export async function recomputeOrderStatus(
  db: D1Database,
  orderId: string,
  now: string
): Promise<string | null> {
  const rows = await db
    .prepare(`SELECT stage FROM order_items WHERE order_id = ?`)
    .bind(orderId)
    .all<{ stage: string }>();

  const next = rollupOrderStatus((rows.results ?? []).map((r) => r.stage));
  if (!next) return null;

  await db
    .prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(next, now, orderId)
    .run();
  return next;
}

// Every order touched by a job-level action, recomputed together.
export async function recomputeJobOrderStatuses(
  db: D1Database,
  jobId: string,
  now: string
): Promise<void> {
  const orders = await db
    .prepare(`SELECT id FROM orders WHERE job_id = ?`)
    .bind(jobId)
    .all<{ id: string }>();

  for (const o of orders.results ?? []) {
    await recomputeOrderStatus(db, o.id, now);
  }
}
