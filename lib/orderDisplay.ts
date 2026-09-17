// Customer-facing presentation of order fields, shared by /orders and
// /order/[id] so the two can't drift apart.

// orders.id is a UUID; customers get its first block, which is short
// enough to read out over the phone and still unique in practice.
export function orderNumber(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

// Internal status values are workflow states, not things to show a paying
// customer ('in_qc' means nothing to them). These are the customer-facing
// translations.
export const ORDER_STATUS_LABELS: Record<string, string> = {
  started: "Not completed",
  verified: "Not completed",
  queued: "Queued",
  placed: "Received",
  analyzing: "Being analyzed",
  in_curation: "With our curator",
  awaiting_selection: "Awaiting your selection",
  in_production: "Being rendered",
  in_qc: "In quality review",
  complete: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  error: "Needs attention",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}
