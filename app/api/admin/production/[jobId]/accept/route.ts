import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { recomputeJobOrderStatuses } from "@/lib/orderStage";

// "Accepted as complete" — the operator picks which generated image is the
// finished render. This is the only thing that moves a render to
// 'complete', and the only thing that makes an image visible to the
// customer: their order page shows renders that are approved AND selected,
// which is exactly what this sets.
//
// Per render, not per order. An order can sit five-sixths delivered, with
// the customer seeing the five that are done.

type Params = { params: Promise<{ jobId: string }> };
type AcceptBody = { orderItemId?: string; renderId?: string };

export async function POST(req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { jobId } = await params;
  const body = (await req.json()) as AcceptBody;
  const { env } = getCloudflareContext();

  if (!body.orderItemId || !body.renderId) {
    return NextResponse.json(
      { error: "Both the render slot and the image being accepted are required." },
      { status: 400 }
    );
  }

  // Scoped to this job and to the in_production stage, so a stale page
  // can't complete a render that has since been moved or already accepted.
  const slot = await env.DB.prepare(
    `SELECT oi.id, oi.style_id, oi.order_id
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.id = ? AND o.job_id = ? AND oi.stage = 'in_production'`
  )
    .bind(body.orderItemId, jobId)
    .first<{ id: string; style_id: string | null; order_id: string }>();

  if (!slot) {
    return NextResponse.json(
      { error: "That render isn't in production on this job — the page may be out of date." },
      { status: 400 }
    );
  }

  const image = await env.DB.prepare(
    `SELECT id, storage_key, delivered_key FROM renders WHERE id = ? AND job_id = ?`
  )
    .bind(body.renderId, jobId)
    .first<{ id: string; storage_key: string | null; delivered_key: string | null }>();

  if (!image) {
    return NextResponse.json({ error: "That image isn't on this job." }, { status: 404 });
  }
  if (!image.storage_key && !image.delivered_key) {
    return NextResponse.json(
      { error: "That render row has no stored image to deliver." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // Exactly one image per style is the delivered one. Accepting a
  // different iteration later supersedes the previous pick rather than
  // leaving two marked as selected.
  if (slot.style_id) {
    await env.DB.prepare(
      `UPDATE renders SET selected = 0 WHERE job_id = ? AND style_id = ? AND id != ?`
    )
      .bind(jobId, slot.style_id, image.id)
      .run();
  }

  await env.DB.prepare(
    `UPDATE renders SET selected = 1, qc_status = 'approved', qc_reviewer_id = ? WHERE id = ?`
  )
    .bind(staff.id, image.id)
    .run();

  await env.DB.prepare(`UPDATE order_items SET stage = 'complete' WHERE id = ?`)
    .bind(slot.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO events (id, entity_type, entity_id, event_type, actor_type, actor_id, payload, created_at)
     VALUES (?, 'order_item', ?, 'accepted_as_complete', 'staff', ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      slot.id,
      staff.id,
      JSON.stringify({ jobId, renderId: image.id, styleId: slot.style_id }),
      now
    )
    .run();

  await recomputeJobOrderStatuses(env.DB, jobId, now);

  return NextResponse.json({ ok: true, orderItemId: slot.id, renderId: image.id });
}
