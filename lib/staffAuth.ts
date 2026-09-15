// Layer 2 (authorization): once Access confirms a real identity
// (lib/access.ts), this looks up what that person is actually allowed to
// do, using the staff/roles/staff_roles tables that already exist in the
// canonical schema (seeded by the Python pipeline — this is not a new
// system, just the first thing in the website to consume it).

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  pictureUrl: string | null;
};

export async function getStaffMemberByEmail(
  db: D1Database,
  email: string,
  pictureUrl: string | null = null
): Promise<StaffMember | null> {
  const staff = await db
    .prepare(
      `SELECT id, name, email FROM staff WHERE email = ? AND active = 1`
    )
    .bind(email)
    .first<{ id: string; name: string; email: string }>();

  if (!staff) return null;

  const roleRows = await db
    .prepare(
      `SELECT r.name FROM staff_roles sr
       JOIN roles r ON r.id = sr.role_id
       WHERE sr.staff_id = ? AND sr.revoked_at IS NULL`
    )
    .bind(staff.id)
    .all<{ name: string }>();

  return {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    roles: (roleRows.results ?? []).map((r) => r.name),
    pictureUrl,
  };
}

export function hasRole(staff: StaffMember, role: string): boolean {
  return staff.roles.includes(role);
}

// The full role vocabulary, mirrored from the schema's CHECK constraint —
// kept here so the staff-management UI has a fixed list to pick from
// without a round-trip, and so it breaks loudly (TypeScript + a D1 CHECK
// violation) if the two ever drift apart.
export const ALL_ROLES = [
  "principal",
  "quality_controller",
  "router",
  "curator",
  "designer",
  "client_liaison",
  "content_lead",
  "channel_lead",
  "systems_engineer",
  "prompt_engineer",
  "bookkeeper",
  "compliance_officer",
] as const;
