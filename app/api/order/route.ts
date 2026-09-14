import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Persists the /start form into the orders/order_items tables. Prices are
// currently trusted from the client (lib/pricing.ts constants) — recomputing
// and verifying them server-side is a known TODO before this ever takes
// real payment, same as the "never trust a client total" note elsewhere.

type StarterInput = {
  night: boolean;
  seasonal: boolean;
  seasonChoice: string;
  holiday: boolean;
  holidayChoice: string;
  breakdown: boolean;
};

type AdditionalStyleInput = {
  styleName: string;
  night: boolean;
  seasonal: boolean;
  seasonChoice: string;
  holiday: boolean;
  holidayChoice: string;
  breakdown: boolean;
  unitPrice: number;
};

type CreateOrderBody = {
  photoKey: string | null;
  starter: StarterInput;
  additionalStyles: AdditionalStyleInput[];
  premiumEnabled: boolean;
  premiumText: string;
  logoSelected: boolean;
  total: number;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateOrderBody;
  const { env } = getCloudflareContext();

  const orderId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO orders (
       id, status, photo_key, disclosure_accepted_at,
       starter_night, starter_seasonal, starter_season_choice,
       starter_holiday, starter_holiday_choice, starter_breakdown,
       premium_enabled, premium_text, logo_key, total_amount_cents,
       created_at, updated_at
     ) VALUES (?, 'started', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      orderId,
      body.photoKey ?? null,
      body.starter?.night ? 1 : 0,
      body.starter?.seasonal ? 1 : 0,
      body.starter?.seasonChoice || null,
      body.starter?.holiday ? 1 : 0,
      body.starter?.holidayChoice || null,
      body.starter?.breakdown ? 1 : 0,
      body.premiumEnabled ? 1 : 0,
      body.premiumText || null,
      // Logo isn't uploaded to R2 yet (no /api/logo-check exists) — only
      // whether one was selected is recorded, not a real file reference.
      body.logoSelected ? "pending-upload" : null,
      Math.round((body.total ?? 0) * 100),
      now,
      now
    )
    .run();

  for (const style of body.additionalStyles ?? []) {
    const lookup = await env.DB.prepare(
      `SELECT id FROM styles WHERE name = ?`
    )
      .bind(style.styleName)
      .first<{ id: string }>();

    await env.DB.prepare(
      `INSERT INTO order_items (
         id, order_id, style_id, style_name,
         night, seasonal, season_choice, holiday, holiday_choice,
         breakdown, unit_price_cents
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        orderId,
        lookup?.id ?? null,
        style.styleName,
        style.night ? 1 : 0,
        style.seasonal ? 1 : 0,
        style.seasonChoice || null,
        style.holiday ? 1 : 0,
        style.holidayChoice || null,
        style.breakdown ? 1 : 0,
        Math.round((style.unitPrice ?? 0) * 100)
      )
      .run();
  }

  return NextResponse.json({ orderId, status: "started" });
}

type UpdateOrderBody = {
  orderId: string;
  status?: string;
  acceptDisclosure?: boolean;
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

  if (body.status) {
    await env.DB.prepare(
      `UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`
    )
      .bind(body.status, now, body.orderId)
      .run();
  }

  const row = await env.DB.prepare(`SELECT status FROM orders WHERE id = ?`)
    .bind(body.orderId)
    .first<{ status: string }>();

  return NextResponse.json({ orderId: body.orderId, status: row?.status });
}
