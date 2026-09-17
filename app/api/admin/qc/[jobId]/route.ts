import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import {
  buildRenderPrompts,
  PROMPT_GENERATION_MODE,
  PROMPT_TEMPLATE_VERSION,
  type PromptSlot,
} from "@/lib/renderPrompt";

// The QC workspace ("Check Now"): everything the curator saw, so the
// reviewer can second-guess the style choice against the same evidence,
// plus the assembled image-generation instruction for each ordered render.
// Prompts are rebuilt fresh on every GET rather than read back from
// prompt_generations — the catalog and the structure profile are the
// source of truth, and a stale saved prompt is worse than no saved prompt.
// Saved copies are written on approval, as the audit record of what was
// actually sent to production.

type Params = { params: Promise<{ jobId: string }> };

type SlotRow = {
  id: string;
  order_id: string;
  tier: string;
  style_id: string | null;
  style_name: string;
  custom_text: string | null;
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

  const photoRow = await env.DB.prepare(
    `SELECT curbappeal_photo_key FROM orders
     WHERE job_id = ? AND curbappeal_photo_key IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(jobId)
    .first<{ curbappeal_photo_key: string }>();

  const slots = await env.DB.prepare(
    `SELECT oi.id, oi.order_id, oi.tier, oi.style_id, oi.style_name, oi.custom_text,
            oi.night, oi.seasonal, oi.season_choice, oi.holiday, oi.holiday_choice, oi.breakdown
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.job_id = ? AND oi.tier IN ('curated','premium')
     ORDER BY oi.rowid ASC`
  )
    .bind(jobId)
    .all<SlotRow>();

  const slotRows = slots.results ?? [];

  const promptSlots: PromptSlot[] = slotRows
    .filter((s): s is SlotRow & { style_id: string } => Boolean(s.style_id))
    .map((s) => ({
      orderItemId: s.id,
      tier: s.tier,
      styleId: s.style_id,
      styleName: s.style_name,
      customText: s.custom_text,
      night: s.night,
      seasonal: s.seasonal,
      seasonChoice: s.season_choice,
      holiday: s.holiday,
      holidayChoice: s.holiday_choice,
      breakdown: s.breakdown,
    }));

  const prompts = await buildRenderPrompts(env.DB, jobId, job.property_id, promptSlots);

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
    job: {
      id: job.id,
      propertyAddress: job.property_address,
      curbappealPhotoKey: photoRow?.curbappeal_photo_key ?? null,
    },
    slots: slotRows,
    prompts,
    analysis,
    topMatches: topMatches?.results ?? [],
    curationRanks: curationRanks?.results ?? [],
    regulatory,
    neighborhood,
  });
}

type ApproveBody = {
  prompts?: { orderItemId: string; assembledPrompt: string; negativePrompt: string }[];
};

// Approving is the QC sign-off: it records the exact prompt text the
// reviewer settled on (they can edit what the builder produced before
// approving) and moves every in_qc order on this job to 'in_progress',
// which is what takes it out of this queue and into production.
export async function POST(req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { jobId } = await params;
  const body = (await req.json()) as ApproveBody;
  const submitted = body.prompts ?? [];

  const { env } = getCloudflareContext();
  const now = new Date().toISOString();

  const orders = await env.DB.prepare(
    `SELECT id FROM orders WHERE job_id = ? AND status = 'in_qc'`
  )
    .bind(jobId)
    .all<{ id: string }>();
  const orderRows = orders.results ?? [];

  if (orderRows.length === 0) {
    return NextResponse.json(
      { error: "No order on this job is awaiting QC — it may have already been approved." },
      { status: 400 }
    );
  }

  // Only persist prompts for render slots that really belong to this job,
  // so a tampered orderItemId can't write a prompt_generations row against
  // someone else's job.
  for (const p of submitted) {
    const slot = await env.DB.prepare(
      `SELECT oi.style_id FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE oi.id = ? AND o.job_id = ? AND oi.style_id IS NOT NULL`
    )
      .bind(p.orderItemId, jobId)
      .first<{ style_id: string }>();
    if (!slot) continue;

    await env.DB.prepare(
      `INSERT INTO prompt_generations
         (id, job_id, style_id, generation_mode, assembled_prompt, negative_prompt, template_version, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        jobId,
        slot.style_id,
        PROMPT_GENERATION_MODE,
        p.assembledPrompt,
        p.negativePrompt,
        PROMPT_TEMPLATE_VERSION,
        now
      )
      .run();
  }

  for (const o of orderRows) {
    await env.DB.prepare(`UPDATE orders SET status = 'in_progress', updated_at = ? WHERE id = ?`)
      .bind(now, o.id)
      .run();
    await env.DB.prepare(
      `INSERT INTO events (id, entity_type, entity_id, event_type, actor_type, actor_id, payload, created_at)
       VALUES (?, 'order', ?, 'qc_approved', 'staff', ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        o.id,
        staff.id,
        JSON.stringify({ promptsSaved: submitted.length }),
        now
      )
      .run();
  }

  return NextResponse.json({ ok: true, approvedOrders: orderRows.length, promptsSaved: submitted.length });
}
