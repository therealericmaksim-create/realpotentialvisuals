import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { computeOrderTotalCents } from "@/lib/orderPricing";
import { reserveDailyIntakeSlot } from "@/lib/capacity";
import { RENDER_PRICE, type RenderTier } from "@/lib/pricing";

// Persists the /start form into the orders/order_items tables. The total is
// recomputed here from the submitted selections against lib/pricing.ts —
// the client-submitted total is display-only and never trusted. /api/checkout
// recomputes it again from the saved D1 rows before creating a Stripe
// session, so this route being wrong could only ever misprice what gets
// *saved*, never what gets *charged*.
//
// v0.10.0 (2026-09-15): every render ordered is its own render item —
// self_directed (customer picks the style now), curated (style assigned
// later, once a curation workspace exists), or premium (a free-text custom
// request instead of a catalog style).

type RenderItemInput = {
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

type CreateOrderBody = {
  photoKey: string | null;
  propertyAddress: string;
  hoaAnswer: string;
  historicDistrictAnswer: string;
  gatePassed: boolean | null;
  gateReason: string | null;
  renderItems: RenderItemInput[];
  logoSelected: boolean;
  total: number;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateOrderBody;
  const { env } = getCloudflareContext();

  const orderId = crypto.randomUUID();
  const now = new Date().toISOString();
  const renderItems = body.renderItems ?? [];

  const totalCents = computeOrderTotalCents(
    { logo_key: body.logoSelected ? "pending-upload" : null },
    renderItems.map((item) => ({
      tier: item.tier,
      style_name: item.styleName ?? null,
      night: item.night ? 1 : 0,
      seasonal: item.seasonal ? 1 : 0,
      holiday: item.holiday ? 1 : 0,
      breakdown: item.breakdown ? 1 : 0,
    }))
  );

  await env.DB.prepare(
    `INSERT INTO orders (
       id, status, photo_key, property_address, hoa_answer,
       historic_district_answer, gate_passed, gate_reason,
       disclosure_accepted_at, logo_key, total_amount_cents,
       created_at, updated_at
     ) VALUES (?, 'started', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
  )
    .bind(
      orderId,
      body.photoKey ?? null,
      body.propertyAddress || null,
      body.hoaAnswer || null,
      body.historicDistrictAnswer || null,
      body.gatePassed === null || body.gatePassed === undefined
        ? null
        : body.gatePassed
          ? 1
          : 0,
      body.gateReason || null,
      // Logo isn't uploaded to R2 yet (no /api/logo-check exists) — only
      // whether one was selected is recorded, not a real file reference.
      body.logoSelected ? "pending-upload" : null,
      totalCents,
      now,
      now
    )
    .run();

  for (const item of renderItems) {
    let styleId: string | null = null;
    if (item.tier === "self_directed" && item.styleName) {
      const lookup = await env.DB.prepare(`SELECT id FROM styles WHERE name = ?`)
        .bind(item.styleName)
        .first<{ id: string }>();
      styleId = lookup?.id ?? null;
    }

    const unitPrice = RENDER_PRICE[item.tier];

    await env.DB.prepare(
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

  return NextResponse.json({ orderId, status: "started" });
}

type UpdateOrderBody = {
  orderId: string;
  status?: string;
  acceptDisclosure?: boolean;
  checkCapacity?: boolean;
};

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as UpdateOrderBody;
  const { env } = getCloudflareContext();

  if (!body.orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (body.acceptDisclosure) {
    await env.DB.prepare(
      `UPDATE orders SET disclosure_accepted_at = ?, updated_at = ? WHERE id = ?`
    )
      .bind(now, now, body.orderId)
      .run();
  }

  // Routing Sheet Phase 1 step 6 — an atomic reserve against today's cap.
  // Reaching the cap doesn't block checkout (no business rule yet for
  // turning away a paying customer); it just means an honest position/
  // "today is full" note instead of a fabricated one.
  let capacity: { reserved: boolean; position: number | null; cap: number } | null =
    null;
  if (body.checkCapacity) {
    const result = await reserveDailyIntakeSlot(env.DB, env);
    capacity = {
      reserved: result.reserved,
      position: result.reserved ? result.position : null,
      cap: result.cap,
    };
    if (result.reserved) {
      await env.DB.prepare(
        `UPDATE orders SET queue_position = ?, updated_at = ? WHERE id = ?`
      )
        .bind(result.position, now, body.orderId)
        .run();
    }
  }

  if (body.status) {
    await env.DB.prepare(
      `UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`
    )
      .bind(body.status, now, body.orderId)
      .run();
  }

  const row = await env.DB.prepare(
    `SELECT status, queue_position FROM orders WHERE id = ?`
  )
    .bind(body.orderId)
    .first<{ status: string; queue_position: number | null }>();

  return NextResponse.json({
    orderId: body.orderId,
    status: row?.status,
    queuePosition: row?.queue_position ?? null,
    capacity,
  });
}
