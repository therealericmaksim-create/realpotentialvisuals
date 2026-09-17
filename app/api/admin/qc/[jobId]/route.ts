import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { buildRenderPrompts, PROMPT_GENERATION_MODE, PROMPT_TEMPLATE_VERSION } from "@/lib/renderPrompt";
import { loadJobWorkspace, promptSlotsFrom } from "@/lib/jobWorkspace";
import { recomputeJobOrderStatuses } from "@/lib/orderStage";

// The QC workspace ("Check Now"): everything the curator saw, so the
// reviewer can second-guess the style choice against the same evidence,
// plus the assembled image-generation instruction for each render waiting
// on review.
//
// Approve and deny are both per-render. That is the whole point of stages
// living on order_items: one render can go back to the curator while its
// neighbours carry on to production untouched.
//
// Prompts are rebuilt fresh on every GET rather than read back from
// prompt_generations — the catalog and the structure profile are the
// source of truth, and a stale saved prompt is worse than no saved prompt.
// Saved copies are written on approval, as the audit record of what
// production was actually told to render.

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { jobId } = await params;
  const { env } = getCloudflareContext();

  const ws = await loadJobWorkspace(env.DB, jobId, ["awaiting_qc"]);
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

type DecisionBody = {
  action?: "approve" | "deny";
  orderItemIds?: string[];
  // approve only — the exact text the reviewer settled on, which may
  // differ from what the builder produced.
  prompts?: { orderItemId: string; assembledPrompt: string; negativePrompt: string }[];
  // deny only — why, shown to the curator who picks again.
  reason?: string;
};

export async function POST(req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { jobId } = await params;
  const body = (await req.json()) as DecisionBody;
  const action = body.action;
  const ids = body.orderItemIds ?? [];

  if (action !== "approve" && action !== "deny") {
    return NextResponse.json({ error: "action must be 'approve' or 'deny'" }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: "No renders were selected" }, { status: 400 });
  }
  if (action === "deny" && !body.reason?.trim()) {
    return NextResponse.json(
      { error: "A reason is required — the curator needs to know what to change." },
      { status: 400 }
    );
  }

  const { env } = getCloudflareContext();
  const now = new Date().toISOString();
  const reason = body.reason?.trim() ?? "";
  const promptByItem = new Map((body.prompts ?? []).map((p) => [p.orderItemId, p]));
  const handled: string[] = [];

  for (const itemId of ids) {
    // Scoped to this job AND to the awaiting_qc stage, so a stale page or
    // a tampered id can't decide a render that isn't actually under
    // review — including one a colleague just decided.
    const slot = await env.DB.prepare(
      `SELECT oi.id, oi.style_id, oi.style_name
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE oi.id = ? AND o.job_id = ? AND oi.stage = 'awaiting_qc'`
    )
      .bind(itemId, jobId)
      .first<{ id: string; style_id: string | null; style_name: string }>();
    if (!slot) continue;

    if (action === "approve") {
      const submitted = promptByItem.get(itemId);
      if (submitted && slot.style_id) {
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
            submitted.assembledPrompt,
            submitted.negativePrompt,
            PROMPT_TEMPLATE_VERSION,
            now
          )
          .run();
      }

      await env.DB.prepare(`UPDATE order_items SET stage = 'in_production' WHERE id = ?`)
        .bind(itemId)
        .run();
    } else {
      // Denial clears the style, which is what puts the render back in
      // the Curation Queue — that queue selects on stage alone, so no
      // extra bookkeeping is needed. The rejected style is kept so the
      // curator can see what was turned down rather than guessing.
      await env.DB.prepare(
        `UPDATE order_items
         SET stage = 'awaiting_curation',
             style_id = NULL,
             style_name = '',
             qc_denied_reason = ?,
             qc_denied_style = ?
         WHERE id = ?`
      )
        .bind(reason, slot.style_name || null, itemId)
        .run();
    }

    await env.DB.prepare(
      `INSERT INTO events (id, entity_type, entity_id, event_type, actor_type, actor_id, payload, created_at)
       VALUES (?, 'order_item', ?, ?, 'staff', ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        itemId,
        action === "approve" ? "qc_approved" : "qc_denied",
        staff.id,
        JSON.stringify(
          action === "approve"
            ? { jobId, styleName: slot.style_name }
            : { jobId, rejectedStyle: slot.style_name, reason }
        ),
        now
      )
      .run();

    handled.push(itemId);
  }

  if (handled.length === 0) {
    return NextResponse.json(
      { error: "None of those renders are awaiting QC — the page may be out of date." },
      { status: 400 }
    );
  }

  await recomputeJobOrderStatuses(env.DB, jobId, now);

  return NextResponse.json({ ok: true, action, handled: handled.length });
}
