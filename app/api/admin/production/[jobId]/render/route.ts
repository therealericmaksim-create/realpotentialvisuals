import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { getConfigValue } from "@/lib/systemConfig";
import { generateRenderImage, DEFAULT_IMAGE_MODEL } from "@/lib/renderGeneration";
import {
  buildRenderPrompts,
  PROMPT_GENERATION_MODE,
  PROMPT_TEMPLATE_VERSION,
} from "@/lib/renderPrompt";
import { badgeRenderOrExplain } from "@/lib/watermark";

// Generates one render: sends the approved instruction and the customer's
// own photo to the image model, stores the result in R2, and records a
// `renders` row so the image has an identity beyond a file in a bucket.
//
// ORDERING MATTERS HERE. The image costs real money and takes up to a
// minute, so the moment it exists it is written to R2 and given a renders
// row. Everything after that — recording which prompt produced it — is
// bookkeeping, and runs inside a try/catch that cannot fail the request.
// An earlier version did that bookkeeping BEFORE the insert and unguarded:
// when it threw, the generated image was already stored and paid for but
// no renders row was written, so the image was orphaned and the operator
// just saw the render button fail.
//
// New renders land at qc_status='pending' and selected=0 deliberately.
// Nothing here decides an image is good enough to deliver — the customer
// order page only ever shows approved+selected renders, so generating
// cannot accidentally publish a bad image to the person who paid for it.

type Params = { params: Promise<{ jobId: string }> };
type RenderBody = { orderItemId?: string; prompt?: string };

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { jobId } = await params;
  const body = (await req.json()) as RenderBody;
  const { env } = getCloudflareContext();

  if (!body.orderItemId) {
    return NextResponse.json({ error: "orderItemId is required" }, { status: 400 });
  }
  if (!body.prompt || !body.prompt.trim()) {
    return NextResponse.json({ error: "A prompt is required to render" }, { status: 400 });
  }

  // Scoped to this job so a tampered orderItemId can't render against
  // another customer's job or photo. Pulls the whole slot so the prompt
  // can later be rebuilt for just this one render, rather than loading
  // every render on the job to check one of them.
  const slot = await env.DB.prepare(
    `SELECT oi.id, oi.tier, oi.style_id, oi.style_name, oi.custom_text,
            oi.night, oi.seasonal, oi.season_choice, oi.holiday, oi.holiday_choice,
            oi.breakdown, o.curbappeal_photo_key, j.property_id
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN jobs j ON j.id = o.job_id
     WHERE oi.id = ? AND o.job_id = ? AND oi.style_id IS NOT NULL`
  )
    .bind(body.orderItemId, jobId)
    .first<{
      id: string;
      tier: string;
      style_id: string;
      style_name: string;
      custom_text: string | null;
      night: number;
      seasonal: number;
      season_choice: string | null;
      holiday: number;
      holiday_choice: string | null;
      breakdown: number;
      curbappeal_photo_key: string | null;
      property_id: string;
    }>();

  if (!slot) {
    return NextResponse.json(
      { error: "That render isn't on this job, or it has no style assigned yet." },
      { status: 404 }
    );
  }
  if (!slot.curbappeal_photo_key) {
    return NextResponse.json(
      { error: "This order has no uploaded photo, so there's nothing to restyle." },
      { status: 400 }
    );
  }

  const apiKey = await getConfigValue(env.DB, "OPENAI_API_KEY", env.OPENAI_API_KEY);
  if (!apiKey) {
    return NextResponse.json(
      { error: "No OpenAI API key is configured — set OPENAI_API_KEY in System Variables." },
      { status: 400 }
    );
  }

  const source = await env.MEDIA.get(slot.curbappeal_photo_key);
  if (!source) {
    return NextResponse.json(
      { error: `The uploaded photo is missing from storage (key: ${slot.curbappeal_photo_key}).` },
      { status: 404 }
    );
  }

  const model =
    (await getConfigValue(env.DB, "RENDER_IMAGE_MODEL", DEFAULT_IMAGE_MODEL)) || DEFAULT_IMAGE_MODEL;

  let generated;
  try {
    generated = await generateRenderImage(
      apiKey,
      {
        bytes: await source.arrayBuffer(),
        contentType: source.httpMetadata?.contentType ?? "image/jpeg",
      },
      body.prompt,
      model
    );
  } catch (e) {
    // Surface the real upstream message — a quota, content-policy or size
    // rejection each need a different response from staff.
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // ---- The image exists and must not be lost. ----

  // The badge is composited here, deterministically, from the exact source
  // file — never by the image model, which would redraw it. Every render
  // carries it, so a failure here is fatal to this request: the raw image
  // is parked under renders-raw/ so the money spent is not lost, but it
  // never becomes a `renders` row, which is the only thing the customer
  // can ever be shown.
  const badged = await badgeRenderOrExplain(env.ASSETS, generated.bytes);
  if (!badged.ok) {
    const orphanKey = `renders-raw/${crypto.randomUUID()}.png`;
    await env.MEDIA.put(orphanKey, generated.bytes, {
      httpMetadata: { contentType: generated.contentType },
    });
    return NextResponse.json(
      {
        error:
          `The image generated, but the "Not a real photo" badge could not be applied, ` +
          `so it has not been saved as a render: ${badged.error}. ` +
          `The raw image is parked at ${orphanKey}.`,
      },
      { status: 500 }
    );
  }

  const storageKey = `renders/${crypto.randomUUID()}.png`;
  await env.MEDIA.put(storageKey, badged.bytes, {
    httpMetadata: { contentType: "image/png" },
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
     VALUES (?, ?, ?, NULL, ?, ?, 0, 0, ?, 'pending', ?)`
  )
    .bind(renderId, jobId, slot.style_id, iteration, storageKey, staff.id, now)
    .run();

  // Bookkeeping: record the prompt that was ACTUALLY sent and point the
  // render at it. Best-effort by design — the image is already safe, and
  // losing a provenance record is worth far less than losing the render.
  let templateUsed = "unrecorded";
  try {
    const [built] = await buildRenderPrompts(env.DB, jobId, slot.property_id, [
      {
        orderItemId: slot.id,
        tier: slot.tier,
        styleId: slot.style_id,
        styleName: slot.style_name,
        customText: slot.custom_text,
        night: slot.night,
        seasonal: slot.seasonal,
        seasonChoice: slot.season_choice,
        holiday: slot.holiday,
        holidayChoice: slot.holiday_choice,
        breakdown: slot.breakdown,
      },
    ]);

    const approvedRow = await env.DB.prepare(
      `SELECT assembled_prompt, template_version FROM prompt_generations
       WHERE job_id = ? AND style_id = ? ORDER BY generated_at DESC LIMIT 1`
    )
      .bind(jobId, slot.style_id)
      .first<{ assembled_prompt: string; template_version: string }>();

    const sent = body.prompt.trim();
    templateUsed =
      built && sent === built.assembledPrompt.trim()
        ? PROMPT_TEMPLATE_VERSION
        : approvedRow && sent === approvedRow.assembled_prompt.trim()
          ? approvedRow.template_version
          : "operator-edited";

    const promptGenerationId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO prompt_generations
         (id, job_id, style_id, generation_mode, assembled_prompt, negative_prompt, template_version, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        promptGenerationId,
        jobId,
        slot.style_id,
        PROMPT_GENERATION_MODE,
        body.prompt,
        built?.negativePrompt ?? null,
        templateUsed,
        now
      )
      .run();

    await env.DB.prepare(`UPDATE renders SET prompt_generation_id = ? WHERE id = ?`)
      .bind(promptGenerationId, renderId)
      .run();
  } catch {
    // Deliberately swallowed: the render is already stored and recorded,
    // and no provenance row is a far smaller loss than a lost image.
  }

  await env.DB.prepare(
    `INSERT INTO events (id, entity_type, entity_id, event_type, actor_type, actor_id, payload, created_at)
     VALUES (?, 'render', ?, 'rendered', 'staff', ?, ?, ?)`
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
        model: generated.model,
        requestedSize: generated.requestedSize,
        sourceWidth: generated.sourceWidth,
        sourceHeight: generated.sourceHeight,
        templateUsed,
      }),
      now
    )
    .run();

  return NextResponse.json({
    ok: true,
    render: {
      id: renderId,
      style_id: slot.style_id,
      storage_key: storageKey,
      iteration_number: iteration,
      qc_status: "pending",
      created_at: now,
    },
  });
}
