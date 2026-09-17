import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

// The Curation Queue: one row per job that has at least one curated- or
// premium-tier render still unassigned (order_items.style_id IS NULL) on
// an order an admin explicitly pushed to curation (status = 'in_curation',
// set by POST /api/admin/orders/[id]/push-to-curator). Premium belongs
// here for the same reason curated does — the customer never picks a
// style, so a human has to; the only difference is premium arrives with
// the customer's own free-text request (order_items.custom_text) that the
// curator works from. Only self_directed skips this queue, because the
// customer already chose their own style at checkout.
//
// Deliberately NOT gated on analysis having run — curation is a human
// picking a style for a render slot, which doesn't require AI analysis
// first; that's why this is an explicit staff action rather than
// automatic once analysis completes or once a curated-tier item exists.
// Any signed-in staff member can view this, same rule as run-analysis:
// it's operational queue visibility, not a who-can-do-what permission.

type QueueRow = {
  job_id: string;
  property_address: string;
  curbappeal_photo_key: string | null;
  unassigned_count: number;
  oldest_order_at: string;
};

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { env } = getCloudflareContext();

  const rows = await env.DB.prepare(
    `SELECT j.id as job_id, p.address as property_address,
            (SELECT o2.curbappeal_photo_key FROM orders o2
             WHERE o2.job_id = j.id AND o2.curbappeal_photo_key IS NOT NULL
             ORDER BY o2.created_at DESC LIMIT 1) as curbappeal_photo_key,
            COUNT(oi.id) as unassigned_count, MIN(o.created_at) as oldest_order_at
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN jobs j ON j.id = o.job_id
     JOIN properties p ON p.id = j.property_id
     WHERE oi.tier IN ('curated','premium') AND oi.style_id IS NULL AND o.status = 'in_curation'
     GROUP BY j.id
     ORDER BY oldest_order_at ASC`
  ).all<QueueRow>();

  return NextResponse.json({ jobs: rows.results ?? [] });
}
