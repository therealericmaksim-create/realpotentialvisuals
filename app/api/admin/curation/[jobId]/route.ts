import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

type Params = { params: Promise<{ jobId: string }> };

type CurationSlot = {
  id: string;
  order_id: string;
  style_id: string | null;
  style_name: string;
  night: number;
  seasonal: number;
  season_choice: string | null;
  holiday: number;
  holiday_choice: string | null;
  breakdown: number;
};

export async function GET(_req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { jobId } = await params;
  const { env } = getCloudflareContext();

  const job = await env.DB.prepare(
    `SELECT j.id, p.id as property_id, p.address as property_address
     FROM jobs j JOIN properties p ON p.id = j.property_id WHERE j.id = ?`
  )
    .bind(jobId)
    .first<{ id: string; property_id: string; property_address: string }>();

  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });

  // Most recent order on this job that actually has a photo — in practice
  // there's one order per job today, but this stays correct if that ever
  // changes (a repeat customer ordering more curated renders later).
  const photoRow = await env.DB.prepare(
    `SELECT curbappeal_photo_key FROM orders
     WHERE job_id = ? AND curbappeal_photo_key IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(jobId)
    .first<{ curbappeal_photo_key: string }>();

  const slots = await env.DB.prepare(
    `SELECT oi.id, oi.order_id, oi.style_id, oi.style_name, oi.night, oi.seasonal,
            oi.season_choice, oi.holiday, oi.holiday_choice, oi.breakdown
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.job_id = ? AND oi.tier = 'curated'
     ORDER BY oi.rowid ASC`
  )
    .bind(jobId)
    .all<CurationSlot>();

  const analysis = await env.DB.prepare(
    `SELECT psa.structure_profile_id, sp.house_type, sp.roof_form, sp.massing_envelope
     FROM curbappeal_property_structure_analysis psa
     JOIN curbappeal_structure_profiles sp ON sp.id = psa.structure_profile_id
     WHERE psa.property_id = ?`
  )
    .bind(job.property_id)
    .first<{ structure_profile_id: string; house_type: string; roof_form: string; massing_envelope: string }>();

  const topMatches = analysis
    ? await env.DB.prepare(
        `SELECT s.name, c.combined_score_pct, c.fit_tier
         FROM curbappeal_profile_style_compatibility c JOIN styles s ON s.id = c.style_id
         WHERE c.structure_profile_id = ? ORDER BY c.combined_score_pct DESC LIMIT 8`
      )
        .bind(analysis.structure_profile_id)
        .all<{ name: string; combined_score_pct: number; fit_tier: string }>()
    : null;

  const curationRanks = analysis
    ? await env.DB.prepare(
        `SELECT rank, style_name, reasoning FROM curbappeal_structure_profile_curation_ranks
         WHERE structure_profile_id = ? ORDER BY rank ASC`
      )
        .bind(analysis.structure_profile_id)
        .all<{ rank: number; style_name: string; reasoning: string }>()
    : null;

  const regulatory = await env.DB.prepare(
    `SELECT zoning_district, historic_overlay, flood_zone, summary FROM curbappeal_property_regulatory_lookups
     WHERE property_id = ? ORDER BY looked_up_at DESC LIMIT 1`
  )
    .bind(job.property_id)
    .first<{ zoning_district: string | null; historic_overlay: number | null; flood_zone: string | null; summary: string }>();

  const neighborhood = await env.DB.prepare(
    `SELECT style_read, homes_visible, street_view_key FROM curbappeal_property_neighborhood_reads
     WHERE property_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(job.property_id)
    .first<{ style_read: string; homes_visible: number; street_view_key: string | null }>();

  return NextResponse.json({
    job: { id: job.id, propertyAddress: job.property_address, curbappealPhotoKey: photoRow?.curbappeal_photo_key ?? null },
    slots: slots.results ?? [],
    analysis,
    topMatches: topMatches?.results ?? [],
    curationRanks: curationRanks?.results ?? [],
    regulatory,
    neighborhood,
  });
}

type Assignment = { orderItemId: string; styleName: string };
type SubmitBody = { assignments?: Assignment[] };

export async function POST(req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { jobId } = await params;
  const body = (await req.json()) as SubmitBody;
  const assignments = body.assignments ?? [];
  if (assignments.length === 0) {
    return NextResponse.json({ error: "assignments required" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const now = new Date().toISOString();
  const applied: { orderItemId: string; styleId: string; styleName: string }[] = [];

  for (const a of assignments) {
    const style = await env.DB.prepare(`SELECT id FROM styles WHERE name = ?`).bind(a.styleName).first<{ id: string }>();
    if (!style) continue; // unknown style name — skip rather than fail the whole batch

    // Scoped to this job's own order_items so a stray/tampered orderItemId
    // from another job can never be written through this route.
    const result = await env.DB.prepare(
      `UPDATE order_items SET style_id = ?, style_name = ?
       WHERE id = ? AND tier = 'curated' AND order_id IN (SELECT id FROM orders WHERE job_id = ?)`
    )
      .bind(style.id, a.styleName, a.orderItemId, jobId)
      .run();

    if (result.meta.changes > 0) {
      applied.push({ orderItemId: a.orderItemId, styleId: style.id, styleName: a.styleName });
    }
  }

  if (applied.length > 0) {
    await env.DB.prepare(
      `INSERT INTO events (id, entity_type, entity_id, event_type, actor_type, actor_id, payload, created_at)
       VALUES (?, 'job', ?, 'curated', 'staff', ?, ?, ?)`
    )
      .bind(crypto.randomUUID(), jobId, staff.id, JSON.stringify({ assignments: applied }), now)
      .run();
  }

  return NextResponse.json({ ok: true, applied: applied.length });
}
