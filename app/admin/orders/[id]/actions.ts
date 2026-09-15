"use server";

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { runPhase2Analysis } from "@/lib/analysis/orchestrator";

// Server Actions don't inherit app/admin/layout.tsx's render-time check —
// re-verify staff access here, same pattern as app/admin/staff/actions.ts.
// Any signed-in staff member can run analysis (not principal-only) since
// this doesn't touch who-can-do-what, only which order gets AI-analyzed.

export async function runAnalysisAction(formData: FormData) {
  const staff = await getCurrentStaff();
  if (!staff) throw new Error("Not authorized");

  const orderId = String(formData.get("orderId") || "");
  if (!orderId) return;

  const { env } = getCloudflareContext();
  await runPhase2Analysis(env, orderId);

  revalidatePath(`/admin/orders/${orderId}`);
}
