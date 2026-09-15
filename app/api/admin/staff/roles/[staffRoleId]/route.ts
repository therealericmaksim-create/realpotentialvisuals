import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { hasRole } from "@/lib/staffAuth";

type Params = { params: Promise<{ staffRoleId: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff || !hasRole(staff, "principal")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { staffRoleId } = await params;
  const { env } = getCloudflareContext();

  await env.DB.prepare(`UPDATE staff_roles SET revoked_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), staffRoleId)
    .run();

  return NextResponse.json({ ok: true });
}
