// Shared order + order_items creation, extracted from /api/order/route.ts
// so the public /start intake and the admin Manual Order form both create
// identically-shaped rows — same pricing, same schema, same defaults. The
// only real difference between the two callers is status and whether a
// customer_email is already known at creation time.

import { computeOrderTotalCents } from "./orderPricing";
import { RENDER_PRICE, type RenderTier } from "./pricing";

export type RenderItemInput = {
  tier: RenderTier;
  styleName?: string; // self_directed only
  customText?: string; // premium only
  night: boolean;
  seasonal: boolean;
  seasonChoice: string;
  holiday: boolean;
  holidayChoice: string;
  breakdown: boolean;
};

export type CreateOrderParams = {
  curbappealPhotoKey: string | null;
  propertyAddress: string;
  hoaAnswer: string;
  historicDistrictAnswer: string;
  gatePassed: boolean | null;
  gateReason: string | null;
  renderItems: RenderItemInput[];
  logoSelected: boolean;
  status: string;
  customerEmail?: string | null;
  disclosureAcceptedAt?: string | null;
};

export async function createOrderWithItems(
  db: D1Database,
  params: CreateOrderParams
): Promise<{ orderId: string; totalCents: number }> {
  const orderId = crypto.randomUUID();
  const now = new Date().toISOString();
  const renderItems = params.renderItems ?? [];

  const totalCents = computeOrderTotalCents(
    { logo_key: params.logoSelected ? "pending-upload" : null },
    renderItems.map((item) => ({
      tier: item.tier,
      style_name: item.styleName ?? null,
      night: item.night ? 1 : 0,
      seasonal: item.seasonal ? 1 : 0,
      holiday: item.holiday ? 1 : 0,
      breakdown: item.breakdown ? 1 : 0,
    }))
  );

  await db
    .prepare(
      `INSERT INTO orders (
         id, status, curbappeal_photo_key, property_address, hoa_answer,
         historic_district_answer, gate_passed, gate_reason,
         disclosure_accepted_at, logo_key, total_amount_cents, customer_email,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      orderId,
      params.status,
      params.curbappealPhotoKey ?? null,
      params.propertyAddress || null,
      params.hoaAnswer || null,
      params.historicDistrictAnswer || null,
      params.gatePassed === null || params.gatePassed === undefined
        ? null
        : params.gatePassed
          ? 1
          : 0,
      params.gateReason || null,
      params.disclosureAcceptedAt ?? null,
      // Logo isn't uploaded to R2 yet (no logo-upload endpoint exists) —
      // only whether one was selected is recorded, not a real file reference.
      params.logoSelected ? "pending-upload" : null,
      totalCents,
      params.customerEmail ?? null,
      now,
      now
    )
    .run();

  for (const item of renderItems) {
    let styleId: string | null = null;
    if (item.tier === "self_directed" && item.styleName) {
      const lookup = await db
        .prepare(`SELECT id FROM styles WHERE name = ?`)
        .bind(item.styleName)
        .first<{ id: string }>();
      styleId = lookup?.id ?? null;
    }

    const unitPrice = RENDER_PRICE[item.tier];

    await db
      .prepare(
        `INSERT INTO order_items (
           id, order_id, tier, style_id, style_name, custom_text,
           night, seasonal, season_choice, holiday, holiday_choice,
           breakdown, unit_price_cents
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        orderId,
        item.tier,
        styleId,
        // style_name is NOT NULL in the schema — '' means "not assigned
        // yet" for curated, and premium always uses custom_text instead.
        item.tier === "self_directed" ? item.styleName || "" : "",
        item.tier === "premium" ? item.customText || "" : null,
        item.night ? 1 : 0,
        item.seasonal ? 1 : 0,
        item.seasonChoice || null,
        item.holiday ? 1 : 0,
        item.holidayChoice || null,
        item.breakdown ? 1 : 0,
        Math.round(unitPrice * 100)
      )
      .run();
  }

  return { orderId, totalCents };
}
