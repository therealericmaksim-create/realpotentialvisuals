import { getCurrentStaff } from "@/lib/currentStaff";
import { hasRole } from "@/lib/staffAuth";
import AdminApp from "./AdminApp";

// Reads D1 (via getCurrentStaff) at request time — must never be
// statically prerendered.
export const dynamic = "force-dynamic";

// Everything under /admin is now this single route. app/admin/layout.tsx
// already guarantees staff is non-null by the time this renders — this
// just hands the confirmed identity down to the client-rendered shell,
// which owns all further navigation and data loading via fetch() calls
// to /api/admin/* on interaction, with no further server-side routing.
export default async function AdminHome() {
  const staff = await getCurrentStaff();
  if (!staff) return null; // unreachable — layout already gated this

  return (
    <AdminApp
      staff={{
        name: staff.name,
        roles: staff.roles,
        isPrincipal: hasRole(staff, "principal"),
        pictureUrl: staff.pictureUrl,
      }}
    />
  );
}
