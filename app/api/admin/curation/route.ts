import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

// The Curation Queue: one row per job that has at least one 'curated'-tier
// render still unassigned (order_items.style_id IS NULL) AND already has a
// structure profile computed (Run Analysis has been done, so there's
// actually something to curate against). Any signed-in staff member can
// view this, same rule as run-analysis: it's operational queue
// visibility, not a who-can-do-what permission.
//
// PENDING: once migrations/0004_orders_status_analyzed.sql actually runs
// against production (blocked on manual execution — see that file), this
// should switch to `o.status = 'analyzed'` instead of the structure-
// profile join, so a job's eligibility is tied to ITS OWN order's
// analysis run rather than "some order on this property was analyzed
// once." Not made yet because run-analysis can't write that status value
// until the migration lands — shipping the switch first would make this
// queue permanently empty.

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
     JOIN curbappeal_property_structure_analysis psa ON psa.property_id = j.property_id
     WHERE oi.tier = 'curated' AND oi.style_id IS NULL
     GROUP BY j.id
     ORDER BY oldest_order_at ASC`
  ).all<QueueRow>();

  return NextResponse.json({ jobs: rows.results ?? [] });
}
