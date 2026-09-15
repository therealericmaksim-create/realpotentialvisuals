import { headers, cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyAccessToken } from "./access";
import { getStaffMemberByEmail, type StaffMember } from "./staffAuth";

// One call, used by app/admin/layout.tsx for the baseline "are you staff
// at all" gate AND by individual admin pages that need to additionally
// check for a specific role. Cheap enough to call more than once per
// request (JWKS is module-cached in lib/access.ts, D1 lookup is fast) —
// duplicating the check per page is deliberate defense-in-depth, not
// an oversight.
export async function getCurrentStaff(): Promise<StaffMember | null> {
  const { env } = getCloudflareContext();
  const h = await headers();
  const c = await cookies();

  const token =
    h.get("Cf-Access-Jwt-Assertion") ?? c.get("CF_Authorization")?.value ?? null;

  const identity = await verifyAccessToken(token, env);
  if (!identity) return null;

  return getStaffMemberByEmail(env.DB, identity.email);
}
