import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

// The QC Queue: one row per job with an order sitting at status 'in_qc' —
// i.e. curation finished (every curated/premium render has a style) and
// the work now needs checking before it goes to production. Keyed off the
// order status rather than the `renders` table's qc_status: no render rows
// exist until an operator has actually generated images, so counting those
// would leave this queue permanently empty while real work piled up
// invisibly. Same lesson as the Curation Queue's own definition.

type QcQueueRow = {
  job_id: string;
  property_address: string;
  curbappeal_photo_key: string | null;
  render_count: number;
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
            COUNT(oi.id) as render_count, MIN(o.created_at) as oldest_order_at
     FROM orders o
     JOIN jobs j ON j.id = o.job_id
     JOIN properties p ON p.id = j.property_id
     JOIN order_items oi ON oi.order_id = o.id AND oi.tier IN ('curated','premium')
     WHERE o.status = 'in_qc'
     GROUP BY j.id
     ORDER BY oldest_order_at ASC`
  ).all<QcQueueRow>();

  return NextResponse.json({ jobs: rows.results ?? [] });
}
