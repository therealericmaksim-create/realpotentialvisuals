import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { buildRenderPrompts } from "@/lib/renderPrompt";
import { loadJobWorkspace, promptSlotsFrom } from "@/lib/jobWorkspace";

// The Production workspace: the same evidence the QC reviewer saw, plus
// the instruction that will actually be sent to the image model and any
// images generated from it so far.
//
// Prompt precedence differs from QC on purpose. QC always rebuilds from
// the catalog, because its job is to review the current best instruction.
// Production prefers the prompt QC actually approved (the newest
// prompt_generations row for that style), because production must render
// what was signed off, not whatever the catalog says today. It only falls
// back to a rebuild when no approved prompt exists.

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { jobId } = await params;
  const { env } = getCloudflareContext();

  const ws = await loadJobWorkspace(env.DB, jobId, ["in_production"]);
  if (!ws) return NextResponse.json({ error: "job not found" }, { status: 404 });

  const built = await buildRenderPrompts(env.DB, jobId, ws.job.propertyId, promptSlotsFrom(ws.slots));

  const prompts = [];
  for (const p of built) {
    const approved = await env.DB.prepare(
      `SELECT id, assembled_prompt, negative_prompt, template_version
       FROM prompt_generations
       WHERE job_id = ? AND style_id = ?
       ORDER BY generated_at DESC LIMIT 1`
    )
      .bind(jobId, p.styleId)
      .first<{
        id: string;
        assembled_prompt: string;
        negative_prompt: string | null;
        template_version: string;
      }>();

    prompts.push({
      ...p,
      promptGenerationId: approved?.id ?? null,
      source: approved ? ("qc_approved" as const) : ("rebuilt" as const),
      assembledPrompt: approved?.assembled_prompt ?? p.assembledPrompt,
      negativePrompt: approved?.negative_prompt ?? p.negativePrompt,
      templateVersion: approved?.template_version ?? p.templateVersion,
    });
  }

  // renders are keyed by (job, style) — the schema has no order_item
  // reference — so a slot's images are the renders for its style.
  const renders = await env.DB.prepare(
    `SELECT r.id, r.style_id, r.storage_key, r.delivered_key, r.iteration_number,
            r.qc_status, r.selected, r.created_at, s.name as style_name
     FROM renders r JOIN styles s ON s.id = r.style_id
     WHERE r.job_id = ?
     ORDER BY r.created_at ASC`
  )
    .bind(jobId)
    .all<{
      id: string;
      style_id: string;
      storage_key: string | null;
      delivered_key: string | null;
      iteration_number: number;
      qc_status: string;
      selected: number;
      created_at: string;
      style_name: string;
    }>();

  return NextResponse.json({
    job: {
      id: ws.job.id,
      propertyAddress: ws.job.propertyAddress,
      curbappealPhotoKey: ws.job.curbappealPhotoKey,
    },
    slots: ws.slots,
    prompts,
    renders: renders.results ?? [],
    analysis: ws.analysis,
    topMatches: ws.topMatches,
    curationRanks: ws.curationRanks,
    regulatory: ws.regulatory,
    neighborhood: ws.neighborhood,
  });
}
