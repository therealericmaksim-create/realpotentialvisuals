// Per-render workflow state (order_items.stage).
//
// This is the real pipeline. An order is just a basket: its renders move
// independently, so QC can send one back to the curator while another is
// already rendering. orders.status is now a rollup of these, kept only so
// the Orders list and anything reading an order as a whole still has a
// single coarse answer.
//
// The vocabulary lives here rather than in a DB CHECK constraint on
// purpose — SQLite cannot alter a CHECK in place, and the table rebuild
// required to change one fails against D1, so a CHECK here would freeze
// the pipeline permanently. See migrations/0006.

export const ORDER_ITEM_STAGES = [
  // Paid, but nobody has sent it to a curator yet. "Push to Curator" on
  // the order page is what moves it on — curation stays an explicit staff
  // decision rather than something that happens automatically on payment.
  "new",
  // Waiting for a curator to choose the style.
  "awaiting_curation",
  // Style chosen; QC has to check the choice and the render instruction.
  "awaiting_qc",
  // QC approved it; the image needs generating.
  "in_production",
  // Delivered to the customer.
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

export const STAGE_LABELS: Record<OrderItemStage, string> = {
  new: "Not started",
  awaiting_curation: "Awaiting curation",
  awaiting_qc: "Awaiting QC",
  in_production: "In Production",
  complete: "Delivered",
  on_hold: "On hold",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as OrderItemStage] ?? stage;
}

// orders.status as a function of its renders' stages. Ordered by urgency:
// whatever is furthest back in the pipeline is what the order as a whole
// still needs. Returns null when there is nothing to derive from (an order
// with no curated/premium renders), leaving the existing status alone.
//
// Only values already in the orders.status CHECK constraint are produced —
// that constraint cannot be changed (see migrations/0006), so 'in_progress'
// remains the stored value for what the UI labels "In Production".
export function rollupOrderStatus(stages: string[]): string | null {
  const live = stages.filter((s) => s !== "on_hold");
  if (live.length === 0) return null;
  if (live.some((s) => s === "awaiting_curation")) return "in_curation";
  if (live.some((s) => s === "awaiting_qc")) return "in_qc";
  if (live.some((s) => s === "in_production")) return "in_progress";
  if (live.every((s) => s === "complete")) return "complete";
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
