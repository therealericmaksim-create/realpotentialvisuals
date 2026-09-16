import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { reserveDailyIntakeSlot } from "@/lib/capacity";
import { createOrderWithItems, type RenderItemInput } from "@/lib/orders";

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

type CreateOrderBody = {
  curbappealPhotoKey: string | null;
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

  const { orderId } = await createOrderWithItems(env.DB, {
    curbappealPhotoKey: body.curbappealPhotoKey,
    propertyAddress: body.propertyAddress,
    hoaAnswer: body.hoaAnswer,
    historicDistrictAnswer: body.historicDistrictAnswer,
    gatePassed: body.gatePassed,
    gateReason: body.gateReason,
    renderItems: body.renderItems,
    logoSelected: body.logoSelected,
    status: "started",
  });

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
