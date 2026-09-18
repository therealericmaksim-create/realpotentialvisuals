import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { getConfigValue } from "@/lib/systemConfig";
import { generateRenderImage, DEFAULT_IMAGE_MODEL } from "@/lib/renderGeneration";
import { buildRevisionPrompt, PROMPT_GENERATION_MODE } from "@/lib/renderPrompt";

// Revise an existing render: the generated image goes back in as the
// source, with a narrow instruction describing the one thing to change.
//
// Distinct from /render, which always starts from the CUSTOMER'S PHOTO.
// That distinction matters: a revision inherits everything the previous
// pass got wrong, and each successive revision drifts a little further
// from the real house. So revisions are recorded as their own iterations
// with the parent noted, and the operator can always go back to rendering
// from the photo instead — which is the right move when a render is wrong
// in a structural way rather than a cosmetic one.
//
// Like a fresh render, the result lands at qc_status='pending',
// selected=0: revising never republishes to the customer by itself.

type Params = { params: Promise<{ jobId: string }> };
type ReviseBody = { orderItemId?: string; sourceRenderId?: string; change?: string };

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { jobId } = await params;
  const body = (await req.json()) as ReviseBody;
  const { env } = getCloudflareContext();

  if (!body.orderItemId || !body.sourceRenderId) {
    return NextResponse.json(
      { error: "Both the render slot and the image being revised are required." },
      { status: 400 }
    );
  }
  if (!body.change?.trim()) {
    return NextResponse.json(
      { error: "Describe what to change — a revision with no instruction would just reprocess the image." },
      { status: 400 }
    );
  }

  const slot = await env.DB.prepare(
    `SELECT oi.id, oi.style_id, oi.style_name
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.id = ? AND o.job_id = ? AND oi.style_id IS NOT NULL`
  )
    .bind(body.orderItemId, jobId)
    .first<{ id: string; style_id: string; style_name: string }>();

  if (!slot) {
    return NextResponse.json(
      { error: "That render isn't on this job, or it has no style assigned yet." },
      { status: 404 }
    );
  }

  // Scoped to the job so a tampered id can't feed another customer's
  // image into this one's revision.
  const parent = await env.DB.prepare(
    `SELECT id, storage_key, delivered_key, revision_count
     FROM renders WHERE id = ? AND job_id = ?`
  )
    .bind(body.sourceRenderId, jobId)
    .first<{ id: string; storage_key: string | null; delivered_key: string | null; revision_count: number }>();

  if (!parent) {
    return NextResponse.json({ error: "That image isn't on this job." }, { status: 404 });
  }

  const sourceKey = parent.delivered_key ?? parent.storage_key;
  if (!sourceKey) {
    return NextResponse.json({ error: "That render row has no stored image to revise." }, { status: 400 });
  }

  const apiKey = await getConfigValue(env.DB, "OPENAI_API_KEY", env.OPENAI_API_KEY);
  if (!apiKey) {
    return NextResponse.json(
      { error: "No OpenAI API key is configured — set OPENAI_API_KEY in System Variables." },
      { status: 400 }
    );
  }

  const source = await env.MEDIA.get(sourceKey);
  if (!source) {
    return NextResponse.json(
      { error: `The image being revised is missing from storage (key: ${sourceKey}).` },
      { status: 404 }
    );
  }

  const model =
    (await getConfigValue(env.DB, "RENDER_IMAGE_MODEL", DEFAULT_IMAGE_MODEL)) || DEFAULT_IMAGE_MODEL;
  const prompt = buildRevisionPrompt(slot.style_name || "restyled", body.change);

  let generated;
  try {
    generated = await generateRenderImage(
      apiKey,
      {
        bytes: await source.arrayBuffer(),
        contentType: source.httpMetadata?.contentType ?? "image/png",
      },
      prompt,
      model
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // ---- The image exists; store and record it before anything else. ----

  const storageKey = `renders/${crypto.randomUUID()}.png`;
  await env.MEDIA.put(storageKey, generated.bytes, {
    httpMetadata: { contentType: generated.contentType },
  });

  const priorCount = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM renders WHERE job_id = ? AND style_id = ?`
  )
    .bind(jobId, slot.style_id)
    .first<{ n: number }>();
  const iteration = (priorCount?.n ?? 0) + 1;

  const renderId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO renders
       (id, job_id, style_id, prompt_generation_id, iteration_number, storage_key,
        selected, revision_count, designer_id, qc_status, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, 0, ?, ?, 'pending', ?)`
  )
    .bind(
      renderId,
      jobId,
      slot.style_id,
      iteration,
      storageKey,
      (parent.revision_count ?? 0) + 1,
      staff.id,
      now
    )
    .run();

  // Best-effort provenance, same reasoning as /render: the image is
  // already safe and a missing record is the cheaper loss.
  try {
    const promptGenerationId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO prompt_generations
         (id, job_id, style_id, generation_mode, assembled_prompt, negative_prompt, template_version, generated_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'revision', ?)`
    )
      .bind(promptGenerationId, jobId, slot.style_id, PROMPT_GENERATION_MODE, prompt, now)
      .run();
    await env.DB.prepare(`UPDATE renders SET prompt_generation_id = ? WHERE id = ?`)
      .bind(promptGenerationId, renderId)
      .run();
  } catch {
    // Deliberately swallowed.
  }

  await env.DB.prepare(
    `INSERT INTO events (id, entity_type, entity_id, event_type, actor_type, actor_id, payload, created_at)
     VALUES (?, 'render', ?, 'revised', 'staff', ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      renderId,
      staff.id,
      JSON.stringify({
        jobId,
        styleId: slot.style_id,
        iteration,
        storageKey,
        revisedFrom: parent.id,
        change: body.change.trim(),
        model: generated.model,
        requestedSize: generated.requestedSize,
        sourceWidth: generated.sourceWidth,
        sourceHeight: generated.sourceHeight,
      }),
      now
    )
    .run();

  return NextResponse.json({ ok: true, renderId, iteration });
}
