import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { hasRole } from "@/lib/staffAuth";

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

export async function POST(req: NextRequest) {
  const staff = await requirePrincipal();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = (await req.json()) as { name?: string; email?: string; role?: string };
  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const role = body.role ?? "";
  if (!name || !email || !role) {
    return NextResponse.json({ error: "name, email, role required" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const now = new Date().toISOString();
  const staffId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO staff (id, name, email, engagement_type, active, created_at)
     VALUES (?, ?, ?, 'contractor_1099', 1, ?)
     ON CONFLICT(email) DO NOTHING`
  )
    .bind(staffId, name, email, now)
    .run();

  const staffRow = await env.DB.prepare(`SELECT id FROM staff WHERE email = ?`).bind(email).first<{ id: string }>();
  if (!staffRow) return NextResponse.json({ error: "insert failed" }, { status: 500 });

  const roleRow = await env.DB.prepare(`SELECT id FROM roles WHERE name = ?`).bind(role).first<{ id: string }>();
  if (!roleRow) return NextResponse.json({ error: "unknown role" }, { status: 400 });

  await env.DB.prepare(
    `INSERT INTO staff_roles (id, staff_id, role_id, senior_grade, granted_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(staff_id, role_id) DO NOTHING`
  )
    .bind(crypto.randomUUID(), staffRow.id, roleRow.id, now)
    .run();

  return NextResponse.json({ ok: true, staffId: staffRow.id });
}
