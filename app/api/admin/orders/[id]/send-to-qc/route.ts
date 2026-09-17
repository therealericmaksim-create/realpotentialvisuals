import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

// Manual "this curation is finished, move it on" — the recovery path for
// an order sitting at 'in_curation' with every curated/premium render
// already styled. Saving assignments in the curation workspace normally
// advances the order automatically, but an order curated before that
// existed (or one whose last style was set some other way) is otherwise
// stranded: it drops out of the Curation Queue, which only lists jobs
// with UNASSIGNED renders, so its workspace can't even be reached to
// re-save. This gives that state a button instead of needing a DB edit.

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { id } = await params;
  const { env } = getCloudflareContext();

  const order = await env.DB.prepare(`SELECT status FROM orders WHERE id = ?`)
    .bind(id)
    .first<{ status: string }>();
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (order.status !== "in_curation") {
    return NextResponse.json(
      { error: `Only an order in curation can be sent to QC — this one is '${order.status}'.` },
      { status: 400 }
    );
  }

  const unassigned = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM order_items
     WHERE order_id = ? AND tier IN ('curated','premium') AND style_id IS NULL`
  )
    .bind(id)
    .first<{ n: number }>();
  if (unassigned && unassigned.n > 0) {
    return NextResponse.json(
      { error: `${unassigned.n} render(s) still need a style — finish curation first.` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE orders SET status = 'in_qc', updated_at = ? WHERE id = ?`)
    .bind(now, id)
    .run();
  await env.DB.prepare(
    `INSERT INTO events (id, entity_type, entity_id, event_type, actor_type, actor_id, payload, created_at)
     VALUES (?, 'order', ?, 'sent_to_qc', 'staff', ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), id, staff.id, JSON.stringify({ from: "in_curation", manual: true }), now)
    .run();

  return NextResponse.json({ ok: true, status: "in_qc" });
}
