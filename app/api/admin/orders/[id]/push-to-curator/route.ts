import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { recomputeOrderStatus } from "@/lib/orderStage";

type Params = { params: Promise<{ id: string }> };

// Explicit staff action that puts an order's job in front of a curator —
// deliberately NOT automatic on payment or on Run Analysis completing.
// Curation doesn't require analysis to have run at all (a curator can
// pick straight from the full style catalog); this button is what
// actually makes a job appear in the Curation Queue, independent of
// whether analysis ever happened. Any signed-in staff member can do
// this, same rule as run-analysis.
export async function POST(_req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { id } = await params;
  const { env } = getCloudflareContext();

  const order = await env.DB.prepare(`SELECT status FROM orders WHERE id = ?`)
    .bind(id)
    .first<{ status: string }>();
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  // Only renders still sitting at 'received' move. Anything already in
  // curation, QC or production is left exactly where it is — pushing an
  // order must never drag a render backwards out of a later stage.
  const pending = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM order_items
     WHERE order_id = ? AND tier IN ('curated','premium') AND stage = 'received'`
  )
    .bind(id)
    .first<{ n: number }>();

  if (!pending || pending.n === 0) {
    return NextResponse.json(
      { error: "No renders on this order are waiting to be sent to a curator." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE order_items SET stage = 'in_curation'
     WHERE order_id = ? AND tier IN ('curated','premium') AND stage = 'received'`
  )
    .bind(id)
    .run();

  await env.DB.prepare(
    `INSERT INTO events (id, entity_type, entity_id, event_type, actor_type, actor_id, payload, created_at)
     VALUES (?, 'order', ?, 'pushed_to_curator', 'staff', ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), id, staff.id, JSON.stringify({ renders: pending.n }), now)
    .run();

  const status = await recomputeOrderStatus(env.DB, id, now);

  return NextResponse.json({ ok: true, pushed: pending.n, status });
}
