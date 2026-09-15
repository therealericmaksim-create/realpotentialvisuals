import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { hasRole } from "@/lib/staffAuth";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff || !hasRole(staff, "principal")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id: staffId } = await params;
  const body = (await req.json()) as { role?: string };
  const role = body.role ?? "";
  if (!role) return NextResponse.json({ error: "role required" }, { status: 400 });

  const { env } = getCloudflareContext();
  const roleRow = await env.DB.prepare(`SELECT id FROM roles WHERE name = ?`).bind(role).first<{ id: string }>();
  if (!roleRow) return NextResponse.json({ error: "unknown role" }, { status: 400 });

  await env.DB.prepare(
    `INSERT INTO staff_roles (id, staff_id, role_id, senior_grade, granted_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(staff_id, role_id) DO UPDATE SET revoked_at = NULL`
  )
    .bind(crypto.randomUUID(), staffId, roleRow.id, new Date().toISOString())
    .run();

  return NextResponse.json({ ok: true });
}
