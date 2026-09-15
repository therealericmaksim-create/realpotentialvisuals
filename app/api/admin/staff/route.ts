import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { hasRole } from "@/lib/staffAuth";
import { sendStaffInviteEmail } from "@/lib/email";

type StaffRow = {
  id: string;
  name: string;
  email: string;
  active: number;
  role_name: string | null;
  role_id: string | null;
  staff_role_id: string | null;
};

async function requirePrincipal() {
  const staff = await getCurrentStaff();
  if (!staff || !hasRole(staff, "principal")) return null;
  return staff;
}

export async function GET() {
  const staff = await requirePrincipal();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { env } = getCloudflareContext();
  const rows = await env.DB.prepare(
    `SELECT s.id, s.name, s.email, s.active,
            r.name as role_name, r.id as role_id, sr.id as staff_role_id
     FROM staff s
     LEFT JOIN staff_roles sr ON sr.staff_id = s.id AND sr.revoked_at IS NULL
     LEFT JOIN roles r ON r.id = sr.role_id
     ORDER BY s.active DESC, s.name`
  ).all<StaffRow>();

  const byStaff = new Map<
    string,
    { id: string; name: string; email: string; active: number; roles: { staffRoleId: string; name: string }[] }
  >();
  for (const row of rows.results ?? []) {
    if (!byStaff.has(row.id)) {
      byStaff.set(row.id, { id: row.id, name: row.name, email: row.email, active: row.active, roles: [] });
    }
    if (row.role_name && row.staff_role_id) {
      byStaff.get(row.id)!.roles.push({ staffRoleId: row.staff_role_id, name: row.role_name });
    }
  }

  return NextResponse.json({ staff: [...byStaff.values()] });
}

// Adding a user is just a Gmail address + a set of roles — there's no
// separate name field. The placeholder name (email's local part) shows
// in the list until that person logs in for real; at that point
// /api/admin/me reads their actual Google display name and photo
// straight from Cloudflare Access, per-viewer, without needing to write
// it back into this row at all.
export async function POST(req: NextRequest) {
  const staff = await requirePrincipal();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = (await req.json()) as { email?: string; roles?: string[] };
  const email = (body.email ?? "").trim().toLowerCase();
  const roles = Array.isArray(body.roles) ? body.roles.filter(Boolean) : [];
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const now = new Date().toISOString();
  const staffId = crypto.randomUUID();
  const placeholderName = email.split("@")[0];

  await env.DB.prepare(
    `INSERT INTO staff (id, name, email, engagement_type, active, created_at)
     VALUES (?, ?, ?, 'contractor_1099', 1, ?)
     ON CONFLICT(email) DO NOTHING`
  )
    .bind(staffId, placeholderName, email, now)
    .run();

  const staffRow = await env.DB.prepare(`SELECT id FROM staff WHERE email = ?`).bind(email).first<{ id: string }>();
  if (!staffRow) return NextResponse.json({ error: "insert failed" }, { status: 500 });

  for (const role of roles) {
    const roleRow = await env.DB.prepare(`SELECT id FROM roles WHERE name = ?`).bind(role).first<{ id: string }>();
    if (!roleRow) continue; // unknown role name — skip rather than fail the whole request
    await env.DB.prepare(
      `INSERT INTO staff_roles (id, staff_id, role_id, senior_grade, granted_at)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(staff_id, role_id) DO UPDATE SET revoked_at = NULL`
    )
      .bind(crypto.randomUUID(), staffRow.id, roleRow.id, now)
      .run();
  }

  await sendStaffInviteEmail(env.RESEND_API_KEY, { toEmail: email, roles });

  return NextResponse.json({ ok: true, staffId: staffRow.id });
}
