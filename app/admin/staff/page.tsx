import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff } from "@/lib/currentStaff";
import { hasRole, ALL_ROLES } from "@/lib/staffAuth";
import { addStaffMember, addRoleToStaff, revokeStaffRole, deactivateStaff } from "./actions";

export const dynamic = "force-dynamic";

type StaffRow = {
  id: string;
  name: string;
  email: string;
  active: number;
  role_name: string | null;
  role_id: string | null;
  staff_role_id: string | null;
};

export default async function StaffPage() {
  const staff = await getCurrentStaff();

  // Defense-in-depth: the layout only confirms "is staff at all". This
  // page's own requirement — principal only — is re-checked here,
  // independent of the layout and of every Server Action below.
  if (!staff || !hasRole(staff, "principal")) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", padding: "24px 20px" }}>
        <h1>Not Authorized</h1>
        <p>Only the Principal can manage staff.</p>
      </div>
    );
  }

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
      byStaff.set(row.id, {
        id: row.id,
        name: row.name,
        email: row.email,
        active: row.active,
        roles: [],
      });
    }
    if (row.role_name && row.staff_role_id) {
      byStaff.get(row.id)!.roles.push({ staffRoleId: row.staff_role_id, name: row.role_name });
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "24px 20px", maxWidth: 700 }}>
      <h1 style={{ fontSize: 20 }}>Staff</h1>

      {[...byStaff.values()].map((s) => (
        <div
          key={s.id}
          style={{
            border: "1px solid #333",
            borderRadius: 8,
            padding: 14,
            marginBottom: 12,
            opacity: s.active ? 1 : 0.5,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <strong>{s.name}</strong>{" "}
              <span style={{ color: "#999", fontSize: 13 }}>{s.email}</span>
              {!s.active && <span style={{ color: "#c66", fontSize: 12 }}> (deactivated)</span>}
            </div>
            {s.active && (
              <form action={deactivateStaff}>
                <input type="hidden" name="staffId" value={s.id} />
                <button type="submit" style={{ fontSize: 12 }}>
                  Deactivate
                </button>
              </form>
            )}
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {s.roles.map((r) => (
              <form action={revokeStaffRole} key={r.staffRoleId}>
                <input type="hidden" name="staffRoleId" value={r.staffRoleId} />
                <button
                  type="submit"
                  style={{
                    fontSize: 12,
                    background: "#222",
                    border: "1px solid #444",
                    borderRadius: 12,
                    padding: "3px 10px",
                    color: "#e5e5e5",
                  }}
                  title="Click to revoke"
                >
                  {r.name} ×
                </button>
              </form>
            ))}
          </div>

          {s.active && (
            <form action={addRoleToStaff} style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <input type="hidden" name="staffId" value={s.id} />
              <select name="role" style={{ fontSize: 12 }}>
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button type="submit" style={{ fontSize: 12 }}>
                + Add Role
              </button>
            </form>
          )}
        </div>
      ))}

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Add Staff</h2>
      <form action={addStaffMember} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="name" placeholder="Full name" required style={{ padding: 6 }} />
        <input name="email" type="email" placeholder="Gmail address" required style={{ padding: 6 }} />
        <select name="role" style={{ padding: 6 }}>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="submit" style={{ padding: "6px 14px" }}>
          Add
        </button>
      </form>
      <p style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
        The Gmail address must sign in through Access before anything else
        works for them — adding them here only grants what they can do
        once they do.
      </p>
    </div>
  );
}
