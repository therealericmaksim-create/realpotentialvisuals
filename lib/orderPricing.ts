// Server-side line-item and total calculation for a saved order — the
// authoritative source Stripe Checkout Sessions are built from. Mirrors the
// client-side summary in app/start/page.tsx, but reads from D1 rows instead
// of live form state, so a tampered client-submitted total can never reach
// Stripe.
//
// v0.10.0 (2026-09-15): every render ordered is one row in order_items —
// there's no more fixed "Starter Package" bundle. This function is now a
// straightforward per-row loop instead of the old bundle-vs-additional-style
// branching.

import {
  RENDER_PRICE,
  TIER_LABELS,
  EXTRA_LABELS,
  EXTRA_PRICE,
  STRUCTURAL_BREAKDOWN_LABEL,
  STRUCTURAL_BREAKDOWN_PRICE,
  LOGO_PRICE,
  type ExtraKey,
  type RenderTier,
} from "./pricing";

const EXTRA_KEYS: ExtraKey[] = ["night", "seasonal", "holiday"];

export type OrderLineItem = { label: string; amountCents: number };

export type OrderPricingRow = {
  logo_key: string | null;
};

export type OrderItemPricingRow = {
  tier: RenderTier;
  style_name: string | null;
  night: number;
  seasonal: number;
  holiday: number;
  breakdown: number;
};

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function computeOrderLineItems(
  order: OrderPricingRow,
  items: OrderItemPricingRow[]
): OrderLineItem[] {
  const lines: OrderLineItem[] = [];

  items.forEach((item, i) => {
    const tierLabel = TIER_LABELS[item.tier];
    const name = item.style_name?.trim() ? item.style_name : `render #${i + 1}`;
    const label = `${tierLabel} — ${name}`;

    lines.push({ label, amountCents: toCents(RENDER_PRICE[item.tier]) });

    const itemFlags: Record<ExtraKey, number> = {
      night: item.night,
      seasonal: item.seasonal,
      holiday: item.holiday,
    };
    for (const key of EXTRA_KEYS) {
      if (itemFlags[key]) {
        lines.push({
          label: `${EXTRA_LABELS[key]} — ${label}`,
          amountCents: toCents(EXTRA_PRICE),
        });
      }
    }
    if (item.breakdown) {
      lines.push({
        label: `${STRUCTURAL_BREAKDOWN_LABEL} — ${label}`,
        amountCents: toCents(STRUCTURAL_BREAKDOWN_PRICE),
      });
    }
  });

  if (order.logo_key) {
    lines.push({ label: "Add Your Logo", amountCents: toCents(LOGO_PRICE) });
  }

  return lines;
}

export function computeOrderTotalCents(
  order: OrderPricingRow,
  items: OrderItemPricingRow[]
): number {
  return computeOrderLineItems(order, items).reduce(
    (sum, line) => sum + line.amountCents,
    0
  );
}
