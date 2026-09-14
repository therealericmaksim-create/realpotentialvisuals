// Server-side line-item and total calculation for a saved order — the
// authoritative source Stripe Checkout Sessions are built from. Mirrors the
// client-side summary in app/start/page.tsx, but reads from D1 rows instead
// of live form state, so a tampered client-submitted total can never reach
// Stripe.

import {
  STARTER_PRICE,
  ADD_STYLE_PRICE,
  PREMIUM_PRICE,
  LOGO_PRICE,
  EXTRA_LABELS,
  EXTRA_STARTER_BUNDLE_PRICE,
  EXTRA_ADDITIONAL_STYLE_PRICE,
  STRUCTURAL_BREAKDOWN_LABEL,
  STRUCTURAL_BREAKDOWN_PRICE,
  type ExtraKey,
} from "./pricing";

const EXTRA_KEYS: ExtraKey[] = ["night", "seasonal", "holiday"];

export type OrderLineItem = { label: string; amountCents: number };

export type OrderPricingRow = {
  starter_night: number;
  starter_seasonal: number;
  starter_holiday: number;
  starter_breakdown: number;
  premium_enabled: number;
  logo_key: string | null;
};

export type OrderItemPricingRow = {
  style_name: string;
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
  const lines: OrderLineItem[] = [
    { label: "Starter Package", amountCents: toCents(STARTER_PRICE) },
  ];

  const starterFlags: Record<ExtraKey, number> = {
    night: order.starter_night,
    seasonal: order.starter_seasonal,
    holiday: order.starter_holiday,
  };
  for (const key of EXTRA_KEYS) {
    if (starterFlags[key]) {
      lines.push({
        label: `${EXTRA_LABELS[key]} — all 3 Starter renders`,
        amountCents: toCents(EXTRA_STARTER_BUNDLE_PRICE[key]),
      });
    }
  }
  if (order.starter_breakdown) {
    lines.push({
      label: `${STRUCTURAL_BREAKDOWN_LABEL} — all 3 Starter renders`,
      amountCents: toCents(STRUCTURAL_BREAKDOWN_PRICE * 3),
    });
  }

  items.forEach((item, i) => {
    const name = item.style_name || `Additional style #${i + 1}`;
    lines.push({ label: name, amountCents: toCents(ADD_STYLE_PRICE) });

    const itemFlags: Record<ExtraKey, number> = {
      night: item.night,
      seasonal: item.seasonal,
      holiday: item.holiday,
    };
    for (const key of EXTRA_KEYS) {
      if (itemFlags[key]) {
        lines.push({
          label: `${EXTRA_LABELS[key]} — ${name}`,
          amountCents: toCents(EXTRA_ADDITIONAL_STYLE_PRICE[key]),
        });
      }
    }
    if (item.breakdown) {
      lines.push({
        label: `${STRUCTURAL_BREAKDOWN_LABEL} — ${name}`,
        amountCents: toCents(STRUCTURAL_BREAKDOWN_PRICE),
      });
    }
  });

  if (order.premium_enabled) {
    lines.push({
      label: "Premium Custom Style",
      amountCents: toCents(PREMIUM_PRICE),
    });
  }

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
