import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";

// API routes are independently reachable — they do NOT inherit
// app/admin/layout.tsx's render-time check just because the client page
// that calls them lives under /admin. Every route here re-verifies staff
// access itself, same pattern as the old Server Actions.

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { env } = getCloudflareContext();
  const db = env.DB;

  const [awaitingAnalysis, awaitingCuration, awaitingQc, openRequests, openEscalations, todayIntake] =
    await Promise.all([
      db
        .prepare(
          `SELECT COUNT(*) as n FROM orders o
           JOIN jobs j ON j.id = o.job_id
           LEFT JOIN curbappeal_property_structure_analysis psa ON psa.property_id = j.property_id
           WHERE psa.id IS NULL`
        )
        .first<{ n: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) as n FROM jobs j
           JOIN curbappeal_property_structure_analysis psa ON psa.property_id = j.property_id
           LEFT JOIN curations c ON c.job_id = j.id
           WHERE c.id IS NULL`
        )
        .first<{ n: number }>(),
      db
        .prepare(`SELECT COUNT(*) as n FROM renders WHERE qc_status = 'pending'`)
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
    openRequests: openRequests?.n ?? 0,
    openEscalations: openEscalations?.n ?? 0,
    todayIntake: todayIntake?.reserved_count ?? 0,
    dailyIntakeCap: Number(env.DAILY_INTAKE_CAP ?? 0),
  });
}
