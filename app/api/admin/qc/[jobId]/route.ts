import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { buildRenderPrompts, PROMPT_GENERATION_MODE, PROMPT_TEMPLATE_VERSION } from "@/lib/renderPrompt";
import { loadJobWorkspace, promptSlotsFrom } from "@/lib/jobWorkspace";

// The QC workspace ("Check Now"): everything the curator saw, so the
// reviewer can second-guess the style choice against the same evidence,
// plus the assembled image-generation instruction for each ordered render.
// Prompts are rebuilt fresh on every GET rather than read back from
// prompt_generations — the catalog and the structure profile are the
// source of truth, and a stale saved prompt is worse than no saved prompt.
// Saved copies are written on approval, as the audit record of what was
// actually sent to production.

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { jobId } = await params;
  const { env } = getCloudflareContext();

  const ws = await loadJobWorkspace(env.DB, jobId);
  if (!ws) return NextResponse.json({ error: "job not found" }, { status: 404 });

  const prompts = await buildRenderPrompts(
    env.DB,
    jobId,
    ws.job.propertyId,
    promptSlotsFrom(ws.slots)
  );

  return NextResponse.json({
    job: {
      id: ws.job.id,
      propertyAddress: ws.job.propertyAddress,
      curbappealPhotoKey: ws.job.curbappealPhotoKey,
    },
    slots: ws.slots,
    prompts,
    analysis: ws.analysis,
    topMatches: ws.topMatches,
    curationRanks: ws.curationRanks,
    regulatory: ws.regulatory,
    neighborhood: ws.neighborhood,
  });
}

type ApproveBody = {
  prompts?: { orderItemId: string; assembledPrompt: string; negativePrompt: string }[];
};

// Approving is the QC sign-off: it records the exact prompt text the
// reviewer settled on (they can edit what the builder produced before
// approving) and moves every in_qc order on this job to 'in_production',
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
    await env.DB.prepare(`UPDATE orders SET status = 'in_production', updated_at = ? WHERE id = ?`)
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
