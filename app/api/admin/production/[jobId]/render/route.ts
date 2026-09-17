import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { getConfigValue } from "@/lib/systemConfig";
import { generateRenderImage } from "@/lib/renderGeneration";

// Generates one render: sends the approved instruction and the customer's
// own photo to the image model, stores the result in R2, and records a
// `renders` row so the image has an identity beyond a file in a bucket.
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
  // another customer's job or photo.
  const slot = await env.DB.prepare(
    `SELECT oi.id, oi.style_id, o.curbappeal_photo_key, o.status
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.id = ? AND o.job_id = ? AND oi.style_id IS NOT NULL`
  )
    .bind(body.orderItemId, jobId)
    .first<{ id: string; style_id: string; curbappeal_photo_key: string | null; status: string }>();

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

  let generated;
  try {
    generated = await generateRenderImage(
      apiKey,
      {
        bytes: await source.arrayBuffer(),
        contentType: source.httpMetadata?.contentType ?? "image/jpeg",
      },
      body.prompt
    );
  } catch (e) {
    // Surface the real upstream message — a quota, content-policy or size
    // rejection each need a different response from staff.
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

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

  const promptGeneration = await env.DB.prepare(
    `SELECT id FROM prompt_generations WHERE job_id = ? AND style_id = ?
     ORDER BY generated_at DESC LIMIT 1`
  )
    .bind(jobId, slot.style_id)
    .first<{ id: string }>();

  const renderId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO renders
       (id, job_id, style_id, prompt_generation_id, iteration_number, storage_key,
        selected, revision_count, designer_id, qc_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 'pending', ?)`
  )
    .bind(renderId, jobId, slot.style_id, promptGeneration?.id ?? null, iteration, storageKey, staff.id, now)
    .run();

  await env.DB.prepare(
    `INSERT INTO events (id, entity_type, entity_id, event_type, actor_type, actor_id, payload, created_at)
     VALUES (?, 'render', ?, 'rendered', 'staff', ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      renderId,
      staff.id,
      JSON.stringify({ jobId, styleId: slot.style_id, iteration, storageKey }),
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
