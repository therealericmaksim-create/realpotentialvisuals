import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

// The Production Queue: one row per job with an order at 'in_production',
// i.e. QC signed off on the curation and the render instructions, and the
// images now need generating. Same status-keyed shape as the Curation and
// QC queues.

type ProductionQueueRow = {
  job_id: string;
  property_address: string;
  curbappeal_photo_key: string | null;
  render_count: number;
  rendered_count: number;
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
            COUNT(oi.id) as render_count,
            (SELECT COUNT(*) FROM renders r WHERE r.job_id = j.id) as rendered_count,
            MIN(o.created_at) as oldest_order_at
     FROM orders o
     JOIN jobs j ON j.id = o.job_id
     JOIN properties p ON p.id = j.property_id
     JOIN order_items oi ON oi.order_id = o.id AND oi.tier IN ('curated','premium')
     WHERE o.status = 'in_production'
     GROUP BY j.id
     ORDER BY oldest_order_at ASC`
  ).all<ProductionQueueRow>();

  return NextResponse.json({ jobs: rows.results ?? [] });
}
