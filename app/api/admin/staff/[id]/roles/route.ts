import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { hasRole } from "@/lib/staffAuth";

type Params = { params: Promise<{ id: string }> };

// Sets a staff member's COMPLETE role set in one call — the roles-editor
// modal sends every checked role, and this diffs it against what's
// currently held: grants anything newly checked, revokes anything
// unchecked that was previously granted. Simpler for the client than
// tracking individual add/revoke calls itself.
export async function PUT(req: NextRequest, { params }: Params) {
  const staff = await getCurrentStaff();
  if (!staff || !hasRole(staff, "principal")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { id: staffId } = await params;
  const body = (await req.json()) as { roles?: string[] };
  const desiredRoles = new Set(Array.isArray(body.roles) ? body.roles.filter(Boolean) : []);

  const { env } = getCloudflareContext();
  const now = new Date().toISOString();

  const currentRows = await env.DB.prepare(
    `SELECT sr.id as staff_role_id, r.name as role_name
     FROM staff_roles sr JOIN roles r ON r.id = sr.role_id
     WHERE sr.staff_id = ? AND sr.revoked_at IS NULL`
  )
    .bind(staffId)
    .all<{ staff_role_id: string; role_name: string }>();
  const currentRoles = new Map((currentRows.results ?? []).map((r) => [r.role_name, r.staff_role_id]));

  for (const roleName of desiredRoles) {
    if (currentRoles.has(roleName)) continue; // already granted
    const roleRow = await env.DB.prepare(`SELECT id FROM roles WHERE name = ?`).bind(roleName).first<{ id: string }>();
    if (!roleRow) continue; // unknown role name — skip rather than fail the whole request
    await env.DB.prepare(
      `INSERT INTO staff_roles (id, staff_id, role_id, senior_grade, granted_at)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(staff_id, role_id) DO UPDATE SET revoked_at = NULL`
    )
      .bind(crypto.randomUUID(), staffId, roleRow.id, now)
      .run();
  }

  for (const [roleName, staffRoleId] of currentRoles) {
    if (desiredRoles.has(roleName)) continue; // still wanted
    await env.DB.prepare(`UPDATE staff_roles SET revoked_at = ? WHERE id = ?`)
      .bind(now, staffRoleId)
      .run();
  }

  return NextResponse.json({ ok: true });
}
