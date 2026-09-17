import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

// The Curation Queue: one row per job with at least one render at
// stage 'in_curation'. Keyed off the RENDER's stage, not the
// order's status — renders move through the pipeline independently, so an
// order can have one render back in curation while another is already
// rendering.
//
// Renders reach this stage either from "Push to Curator" on the order
// page, or by being denied in QC. Premium belongs here for the same
// reason curated does — that customer never picks a style either, they
// write a free-text request (order_items.custom_text) the curator works
// from. self_directed sits at 'on_hold' and never appears.
//
// Deliberately NOT gated on analysis having run — curation is a human
// picking a style for a render slot, which doesn't require AI analysis
// first. Any signed-in staff member can view this, same rule as
// run-analysis: it's operational queue visibility, not a permission.

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
     WHERE oi.stage = 'in_curation'
     GROUP BY j.id
     ORDER BY oldest_order_at ASC`
  ).all<QueueRow>();

  return NextResponse.json({ jobs: rows.results ?? [] });
}
