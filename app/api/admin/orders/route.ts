import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

// One row per RENDER, not per order. Since stages live on order_items, an
// order-level list can only ever show a rolled-up status that hides what
// is actually happening — an order with one render in production and one
// back with the curator reads as a single misleading value. The list is
// the place staff actually look, so it shows the real unit of work.
//
// LEFT JOIN, not INNER: an order with no items (an abandoned or
// malformed one) still has to be visible, otherwise it becomes
// undeletable through the UI.

type OrderRenderRow = {
  order_id: string;
  order_status: string;
  property_address: string | null;
  customer_email: string | null;
  job_id: string | null;
  created_at: string;
  curbappeal_photo_key: string | null;
  item_id: string | null;
  render_no: number | null;
  tier: string | null;
  stage: string | null;
  style_name: string | null;
  custom_text: string | null;
  qc_denied_reason: string | null;
  qc_denied_style: string | null;
};

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { env } = getCloudflareContext();
  const rows = await env.DB.prepare(
    `SELECT o.id as order_id, o.status as order_status, o.property_address,
            o.customer_email, o.job_id, o.created_at, o.curbappeal_photo_key,
            oi.id as item_id, oi.tier, oi.stage, oi.style_name, oi.custom_text,
            oi.qc_denied_reason, oi.qc_denied_style,
            ROW_NUMBER() OVER (PARTITION BY oi.order_id ORDER BY oi.rowid) AS render_no
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     ORDER BY o.created_at DESC, oi.rowid ASC
     LIMIT 200`
  ).all<OrderRenderRow>();

  return NextResponse.json({ renders: rows.results ?? [] });
}
