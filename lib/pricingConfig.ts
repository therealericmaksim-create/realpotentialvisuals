// Resolves the CURRENT effective pricing — a DB override (set from the
// admin's System Variables page) if one exists, falling back to the
// hardcoded defaults in lib/pricing.ts otherwise. Used everywhere a
// price actually needs computing: order creation, checkout, and the
// public pricing endpoint the homepage/`/start` fetch to display it.
// Never trust a client-submitted price — this is always resolved fresh
// server-side at the moment it matters (order creation, checkout).

import { getConfigValue } from "./systemConfig";
import { RENDER_PRICE, EXTRA_PRICE, LOGO_PRICE, STRUCTURAL_BREAKDOWN_PRICE, type RenderTier } from "./pricing";

export type ResolvedPricing = {
  renderPrice: Record<RenderTier, number>;
  extraPrice: number;
  logoPrice: number;
  structuralBreakdownPrice: number;
};

function toNumber(raw: string | undefined, fallback: number): number {
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function resolvePricing(db: D1Database): Promise<ResolvedPricing> {
  const [selfDirected, curated, premium, extra, logo, breakdown] = await Promise.all([
    getConfigValue(db, "PRICE_SELF_DIRECTED", String(RENDER_PRICE.self_directed)),
    getConfigValue(db, "PRICE_CURATED", String(RENDER_PRICE.curated)),
    getConfigValue(db, "PRICE_PREMIUM", String(RENDER_PRICE.premium)),
    getConfigValue(db, "PRICE_EXTRA", String(EXTRA_PRICE)),
    getConfigValue(db, "PRICE_LOGO", String(LOGO_PRICE)),
    getConfigValue(db, "PRICE_STRUCTURAL_BREAKDOWN", String(STRUCTURAL_BREAKDOWN_PRICE)),
  ]);

  return {
    renderPrice: {
      self_directed: toNumber(selfDirected, RENDER_PRICE.self_directed),
      curated: toNumber(curated, RENDER_PRICE.curated),
      premium: toNumber(premium, RENDER_PRICE.premium),
    },
    extraPrice: toNumber(extra, EXTRA_PRICE),
    logoPrice: toNumber(logo, LOGO_PRICE),
    structuralBreakdownPrice: toNumber(breakdown, STRUCTURAL_BREAKDOWN_PRICE),
  };
}
