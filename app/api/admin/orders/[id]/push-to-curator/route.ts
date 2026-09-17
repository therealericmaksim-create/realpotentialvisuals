import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

type Params = { params: Promise<{ id: string }> };

// Explicit staff action that puts an order's job in front of a curator —
// deliberately NOT automatic on payment or on Run Analysis completing.
// Curation doesn't require analysis to have run at all (a curator can
// pick straight from the full style catalog); this button is what
// actually makes a job appear in the Curation Queue, independent of
// whether analysis ever happened. Any signed-in staff member can do
// this, same rule as run-analysis.
export async function POST(_req: Request, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { id } = await params;
  const { env } = getCloudflareContext();

  const order = await env.DB.prepare(`SELECT status FROM orders WHERE id = ?`).bind(id).first<{ status: string }>();
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (order.status !== "placed" && order.status !== "analyzing") {
    return NextResponse.json({ error: `Cannot push an order with status '${order.status}' to curation` }, { status: 400 });
  }

  // Pushing an order with nothing to curate (no unassigned curated- or
  // premium-tier render) would silently flip its status with zero visible
  // effect — it would never show up in the Curation Queue, which only
  // surfaces exactly this condition. Reject it up front instead, with a
  // message that says why, rather than letting staff wonder why the queue
  // still says "nothing waiting."
  const unassigned = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM order_items
     WHERE order_id = ? AND tier IN ('curated','premium') AND style_id IS NULL`
  )
    .bind(id)
    .first<{ n: number }>();
  if (!unassigned || unassigned.n === 0) {
    return NextResponse.json(
      { error: "This order has no curated or premium renders needing a style — there's nothing to push to curation." },
      { status: 400 }
    );
  }

  await env.DB.prepare(`UPDATE orders SET status = 'in_curation', updated_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), id)
    .run();

  return NextResponse.json({ ok: true, status: "in_curation" });
}
