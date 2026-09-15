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

  return NextResponse.json(result);
}
