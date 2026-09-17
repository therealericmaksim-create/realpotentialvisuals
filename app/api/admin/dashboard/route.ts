import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { getDailyIntakeCap } from "@/lib/capacity";

// API routes are independently reachable — they do NOT inherit
// app/admin/layout.tsx's render-time check just because the client page
// that calls them lives under /admin. Every route here re-verifies staff
// access itself, same pattern as the old Server Actions.

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { env } = getCloudflareContext();
  const db = env.DB;

  const dailyIntakeCap = await getDailyIntakeCap(db, env);

  const [awaitingAnalysis, awaitingCuration, awaitingQc, awaitingProduction, openRequests, openEscalations, todayIntake] =
    await Promise.all([
      db
        // 'placed' IS "awaiting analysis" — an order sits at this status
        // from the moment it's paid until staff either run analysis on it
        // (-> 'analyzing') or push it straight to curation. Same
        // status-based pattern as "Awaiting Curation" below, not derived
        // from structure-profile existence (that missed any order without
        // job/property linkage yet, and didn't actually check status at
        // all, so it kept counting orders long after they'd moved past
        // 'placed').
        .prepare(`SELECT COUNT(*) as n FROM orders WHERE status = 'placed'`)
        .first<{ n: number }>(),
      db
        .prepare(
          // Same definition as /api/admin/curation's own query: a job
          // needs curation when it has at least one curated- or
          // premium-tier render still unassigned (style_id IS NULL) on an
          // order explicitly pushed to curation (status = 'in_curation') —
          // only self_directed skips the queue, since that customer picked
          // their own style at checkout. Deliberately NOT keyed off the old
          // `curations` table (that table modeled the pre-v0.10.0 fixed-
          // package "12 candidates, 3 included" bundle and was never
          // updated for per-render pricing; it's dead/unused now, left in
          // place rather than dropped).
          `SELECT COUNT(DISTINCT j.id) as n
           FROM jobs j
           JOIN orders o ON o.job_id = j.id
           JOIN order_items oi ON oi.order_id = o.id
           WHERE oi.tier IN ('curated','premium') AND oi.style_id IS NULL AND o.status = 'in_curation'`
        )
        .first<{ n: number }>(),
      db
        // Same definition as /api/admin/qc's own query: an order sits at
        // 'in_qc' from the moment curation assigns its last style until a
        // reviewer approves it into production. Deliberately NOT keyed off
        // `renders.qc_status` — no render row exists until an operator has
        // generated images by hand, so that count read 0 forever while
        // real QC work waited, the same way "Awaiting Curation" once
        // counted a dead table.
        .prepare(`SELECT COUNT(*) as n FROM orders WHERE status = 'in_qc'`)
        .first<{ n: number }>(),
      db
        // Orders QC has signed off on, now waiting for their images to be
        // generated in the Production Queue.
        .prepare(`SELECT COUNT(*) as n FROM orders WHERE status = 'in_progress'`)
        .first<{ n: number }>(),
      db
        .prepare(`SELECT COUNT(*) as n FROM custom_requests WHERE status = 'awaiting_quote'`)
        .first<{ n: number }>(),
      db
        .prepare(`SELECT COUNT(*) as n FROM escalations WHERE status = 'open'`)
        .first<{ n: number }>(),
      db
        .prepare(`SELECT reserved_count FROM daily_intake WHERE intake_date = ?`)
        .bind(new Date().toISOString().slice(0, 10))
        .first<{ reserved_count: number }>(),
    ]);

  return NextResponse.json({
    awaitingAnalysis: awaitingAnalysis?.n ?? 0,
    awaitingCuration: awaitingCuration?.n ?? 0,
    awaitingQc: awaitingQc?.n ?? 0,
    awaitingProduction: awaitingProduction?.n ?? 0,
    openRequests: openRequests?.n ?? 0,
    openEscalations: openEscalations?.n ?? 0,
    todayIntake: todayIntake?.reserved_count ?? 0,
    dailyIntakeCap,
  });
}
