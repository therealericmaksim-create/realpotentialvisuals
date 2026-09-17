// Customer-facing presentation of order fields, shared by /orders and
// /order/[id] so the two can't drift apart.

// orders.id is a UUID; customers get its first block, which is short
// enough to read out over the phone and still unique in practice.
export function orderNumber(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

// Internal status values are workflow states, not things to show anyone
// as-is ('in_qc' means nothing to a customer). These are the display
// translations, used by both the customer pages and the admin.
//
// Note 'in_progress' -> "In Production": the stored value was going to be
// renamed to in_production, but SQLite cannot alter a CHECK constraint in
// place and the orders-table rebuild that would require failed against
// D1 (defer_foreign_keys resets between statements, so dropping the
// referenced orders table violated order_items/payments). Since no row
// had ever carried the value, renaming it bought nothing but risk — the
// label lives here instead. Anything user-visible must go through
// orderStatusLabel(); only queries and status comparisons use the raw
// value.
export const ORDER_STATUS_LABELS: Record<string, string> = {
  started: "Not completed",
  verified: "Not completed",
  queued: "Queued",
  placed: "Received",
  analyzing: "Being analyzed",
  in_curation: "With our curator",
  awaiting_selection: "Awaiting your selection",
  in_progress: "In Production",
  in_qc: "In quality review",
  complete: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  error: "Needs attention",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}
