import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { runPhase2Analysis } from "@/lib/analysis/orchestrator";

type Params = { params: Promise<{ id: string }> };

// Any signed-in staff member can run analysis (not principal-only) since
// this doesn't touch who-can-do-what, only which order gets AI-analyzed —
// same rule as the Server Action this replaces.
export async function POST(_req: Request, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { id } = await params;
  const { env } = getCloudflareContext();
  const result = await runPhase2Analysis(env, id);

  // PENDING: once migrations/0004_orders_status_analyzed.sql actually
  // runs against production, add
  //   await env.DB.prepare(`UPDATE orders SET status = 'analyzed', updated_at = ? WHERE id = ?`)
  //     .bind(new Date().toISOString(), id).run();
  // here, marking this order past the analysis stage so the Curation
  // Queue can gate on it directly. Not added yet — 'analyzed' isn't a
  // valid value in the live orders.status CHECK constraint until that
  // migration runs, so writing it now would 500 on every single
  // analysis run (confirmed directly: SQLITE_CONSTRAINT_CHECK).

  return NextResponse.json(result);
}
