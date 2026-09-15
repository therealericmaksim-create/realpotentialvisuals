"use server";

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { hasRole } from "@/lib/staffAuth";

// Server Actions are independently reachable POST endpoints — they do NOT
// inherit app/admin/layout.tsx's render-time check just because the page
// that renders their form does. Every action here re-verifies principal
// access itself before touching D1; this is not redundant, it's the
// actual security boundary for these specific mutations.

async function requirePrincipal() {
  const staff = await getCurrentStaff();
  if (!staff || !hasRole(staff, "principal")) {
    throw new Error("Not authorized");
  }
  return staff;
}

export async function addStaffMember(formData: FormData) {
  await requirePrincipal();
  const { env } = getCloudflareContext();

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const role = String(formData.get("role") || "");
  if (!name || !email || !role) return;

  const now = new Date().toISOString();
  const staffId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO staff (id, name, email, engagement_type, active, created_at)
     VALUES (?, ?, ?, 'contractor_1099', 1, ?)
     ON CONFLICT(email) DO NOTHING`
  )
    .bind(staffId, name, email, now)
    .run();

  const staffRow = await env.DB.prepare(`SELECT id FROM staff WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();
  if (!staffRow) return;

  const roleRow = await env.DB.prepare(`SELECT id FROM roles WHERE name = ?`)
    .bind(role)
    .first<{ id: string }>();
  if (!roleRow) return;

  await env.DB.prepare(
    `INSERT INTO staff_roles (id, staff_id, role_id, senior_grade, granted_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(staff_id, role_id) DO NOTHING`
  )
    .bind(crypto.randomUUID(), staffRow.id, roleRow.id, now)
    .run();

  revalidatePath("/admin/staff");
}

export async function addRoleToStaff(formData: FormData) {
  await requirePrincipal();
  const { env } = getCloudflareContext();

  const staffId = String(formData.get("staffId") || "");
  const role = String(formData.get("role") || "");
  if (!staffId || !role) return;

  const roleRow = await env.DB.prepare(`SELECT id FROM roles WHERE name = ?`)
    .bind(role)
    .first<{ id: string }>();
  if (!roleRow) return;

  await env.DB.prepare(
    `INSERT INTO staff_roles (id, staff_id, role_id, senior_grade, granted_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(staff_id, role_id) DO UPDATE SET revoked_at = NULL`
  )
    .bind(crypto.randomUUID(), staffId, roleRow.id, new Date().toISOString())
    .run();

  revalidatePath("/admin/staff");
}

export async function revokeStaffRole(formData: FormData) {
  await requirePrincipal();
  const { env } = getCloudflareContext();

  const staffRoleId = String(formData.get("staffRoleId") || "");
  if (!staffRoleId) return;

  await env.DB.prepare(
    `UPDATE staff_roles SET revoked_at = ? WHERE id = ?`
  )
    .bind(new Date().toISOString(), staffRoleId)
    .run();

  revalidatePath("/admin/staff");
}

export async function deactivateStaff(formData: FormData) {
  const actingStaff = await requirePrincipal();
  const { env } = getCloudflareContext();

  const staffId = String(formData.get("staffId") || "");
  if (!staffId) return;
  if (staffId === actingStaff.id) return; // never let a principal lock themselves out

  await env.DB.prepare(
    `UPDATE staff SET active = 0, deactivated_at = ? WHERE id = ?`
  )
    .bind(new Date().toISOString(), staffId)
    .run();

  revalidatePath("/admin/staff");
}
