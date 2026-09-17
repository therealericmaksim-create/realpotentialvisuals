import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { loadJobWorkspace } from "@/lib/jobWorkspace";
import { recomputeJobOrderStatuses } from "@/lib/orderStage";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { jobId } = await params;
  const { env } = getCloudflareContext();

  // Only renders actually waiting on a curator. A render QC has already
  // cleared, or one still sitting at 'received', has no business showing up in
  // a curator's workspace.
  const ws = await loadJobWorkspace(env.DB, jobId, ["in_curation"]);
  if (!ws) return NextResponse.json({ error: "job not found" }, { status: 404 });

  return NextResponse.json({
    job: {
      id: ws.job.id,
      propertyAddress: ws.job.propertyAddress,
      curbappealPhotoKey: ws.job.curbappealPhotoKey,
    },
    slots: ws.slots,
    analysis: ws.analysis,
    topMatches: ws.topMatches,
    curationRanks: ws.curationRanks,
    regulatory: ws.regulatory,
    neighborhood: ws.neighborhood,
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
       WHERE id = ? AND tier IN ('curated','premium') AND order_id IN (SELECT id FROM orders WHERE job_id = ?)`
    )
      .bind(style.id, a.styleName, a.orderItemId, jobId)
      .run();

    if (result.meta.changes > 0) {
      applied.push({ orderItemId: a.orderItemId, styleId: style.id, styleName: a.styleName });
    }
  }

  if (applied.length === 0) {
    return NextResponse.json({ ok: true, applied: 0, advancedToQc: 0 });
  }

  await env.DB.prepare(
    `INSERT INTO events (id, entity_type, entity_id, event_type, actor_type, actor_id, payload, created_at)
     VALUES (?, 'job', ?, 'curated', 'staff', ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), jobId, staff.id, JSON.stringify({ assignments: applied }), now)
    .run();

  // Assigning a style IS finishing curation for that one render, so it
  // moves to QC on its own — independently of anything else on the order.
  // Any earlier QC denial is cleared here: the curator has answered it,
  // and leaving the note would make the next reviewer think the new style
  // had been rejected too.
  for (const a of applied) {
    await env.DB.prepare(
      `UPDATE order_items
       SET stage = 'in_qc', qc_denied_reason = NULL, qc_denied_style = NULL
       WHERE id = ?`
    )
      .bind(a.orderItemId)
      .run();
  }

  await recomputeJobOrderStatuses(env.DB, jobId, now);

  return NextResponse.json({ ok: true, applied: applied.length, advancedToQc: applied.length });
}
