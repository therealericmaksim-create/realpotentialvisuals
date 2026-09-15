import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { hasRole } from "@/lib/staffAuth";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const actingStaff = await getCurrentStaff();
  if (!actingStaff || !hasRole(actingStaff, "principal")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id: staffId } = await params;
  if (staffId === actingStaff.id) {
    return NextResponse.json({ error: "cannot deactivate yourself" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  await env.DB.prepare(`UPDATE staff SET active = 0, deactivated_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), staffId)
    .run();

  return NextResponse.json({ ok: true });
}
