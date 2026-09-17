import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentCustomer, ORDER_OWNERSHIP_SQL, orderOwnershipParams } from "@/lib/currentCustomer";
import { TIER_LABELS } from "@/lib/pricing";

// One order's detail for the customer who owns it. The ownership check is
// part of the lookup itself rather than a separate step, so an order id
// belonging to someone else is indistinguishable from one that doesn't
// exist — it 404s either way, leaking nothing about which ids are real.

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { env } = getCloudflareContext();
  const identity = await getCurrentCustomer(req, env.DB);
  if (!identity) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const order = await env.DB.prepare(
    `SELECT o.id, o.status, o.property_address, o.curbappeal_photo_key, o.logo_key,
            o.total_amount_cents, o.created_at, o.hoa_answer, o.historic_district_answer,
            o.job_id
     FROM orders o
     WHERE o.id = ? AND ${ORDER_OWNERSHIP_SQL}`
  )
    .bind(id, ...orderOwnershipParams(identity))
    .first<{
      id: string;
      status: string;
      property_address: string | null;
      curbappeal_photo_key: string | null;
      logo_key: string | null;
      total_amount_cents: number;
      created_at: string;
      hoa_answer: string | null;
      historic_district_answer: string | null;
      job_id: string | null;
    }>();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const items = await env.DB.prepare(
    `SELECT id, tier, stage, style_id, style_name, custom_text, night, seasonal,
            season_choice, holiday, holiday_choice, breakdown, unit_price_cents
     FROM order_items WHERE order_id = ? ORDER BY rowid ASC`
  )
    .bind(id)
    .all<{
      id: string;
      tier: string;
      stage: string;
      style_id: string | null;
      style_name: string;
      custom_text: string | null;
      night: number;
      seasonal: number;
      season_choice: string | null;
      holiday: number;
      holiday_choice: string | null;
      breakdown: number;
      unit_price_cents: number;
    }>();

  // The delivered image for each finished render. A render only reaches
  // stage 'complete' when an operator accepted one of its generated
  // images, and that acceptance is what sets approved + selected — so
  // these two conditions describe exactly the same set. Renders still in
  // the pipeline simply have no row here, which is what lets the page
  // show five finished images and say the sixth is still being made.
  const renders = order.job_id
    ? await env.DB.prepare(
        `SELECT r.id, r.style_id, r.delivered_key, r.storage_key,
                s.name as style_name, r.created_at
         FROM renders r
         JOIN styles s ON s.id = r.style_id
         WHERE r.job_id = ? AND r.qc_status = 'approved' AND r.selected = 1
         ORDER BY r.created_at ASC`
      )
        .bind(order.job_id)
        .all<{
          id: string;
          style_id: string | null;
          delivered_key: string | null;
          storage_key: string | null;
          style_name: string;
          created_at: string;
        }>()
    : null;

  return NextResponse.json({
    order,
    items: (items.results ?? []).map((i) => ({
      ...i,
      tier_label: TIER_LABELS[i.tier as keyof typeof TIER_LABELS] ?? i.tier,
    })),
    renders: (renders?.results ?? []).filter((r) => r.delivered_key || r.storage_key),
  });
}
