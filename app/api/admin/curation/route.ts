import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

// The Curation Queue: every render at stage 'in_curation' — waiting for a
// curator to choose its style. Renders arrive here from "Push to Curator"
// on the order page, or by being denied in QC. self_directed sits at
// 'on_hold' and never appears.
//
// One row per RENDER, matching the All Orders list. A job-level row with a
// count hid which renders were actually waiting and left no way to show a
// render's own reference, address or photo — staff had to open the job to
// find out what was in it.

type QueueRow = {
  item_id: string;
  order_id: string;
  render_no: number;
  job_id: string;
  tier: string;
  stage: string;
  style_name: string;
  custom_text: string | null;
  qc_denied_reason: string | null;
  qc_denied_style: string | null;
  property_address: string;
  curbappeal_photo_key: string | null;
  created_at: string;
};

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { env } = getCloudflareContext();

  const rows = await env.DB.prepare(
    `SELECT * FROM (
       SELECT oi.id AS item_id, oi.order_id, oi.tier, oi.stage, oi.style_name,
              oi.custom_text, oi.qc_denied_reason, oi.qc_denied_style,
              j.id AS job_id, p.address AS property_address, o.created_at,
              (SELECT o2.curbappeal_photo_key FROM orders o2
               WHERE o2.job_id = j.id AND o2.curbappeal_photo_key IS NOT NULL
               ORDER BY o2.created_at DESC LIMIT 1) AS curbappeal_photo_key,
              ROW_NUMBER() OVER (PARTITION BY oi.order_id ORDER BY oi.rowid) AS render_no
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN jobs j ON j.id = o.job_id
       JOIN properties p ON p.id = j.property_id
     ) WHERE stage = 'in_curation'
     ORDER BY created_at ASC`
  ).all<QueueRow>();

  return NextResponse.json({ renders: rows.results ?? [] });
}
