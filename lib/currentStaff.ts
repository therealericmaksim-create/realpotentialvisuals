import { headers, cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyAccessToken } from "./access";
import { getStaffMemberByEmail, type StaffMember } from "./staffAuth";

// The raw Access JWT off the request — used both by getCurrentStaff()
// (verifies it) and by /api/admin/me (also forwards it to Cloudflare's
// get-identity endpoint for the display name/photo, which needs the raw
// token, not just the verified {email} it decodes to).
export async function getRawAccessToken(): Promise<string | null> {
  const h = await headers();
  const c = await cookies();
  return h.get("Cf-Access-Jwt-Assertion") ?? c.get("CF_Authorization")?.value ?? null;
}

// One call, used by app/admin/layout.tsx for the baseline "are you staff
// at all" gate AND by individual admin pages that need to additionally
// check for a specific role. Cheap enough to call more than once per
// request (JWKS is module-cached in lib/access.ts, D1 lookup is fast) —
// duplicating the check per page is deliberate defense-in-depth, not
// an oversight.
export async function getCurrentStaff(): Promise<StaffMember | null> {
  const { env } = getCloudflareContext();
  const token = await getRawAccessToken();

  const identity = await verifyAccessToken(token, env);
  if (!identity) return null;

  return getStaffMemberByEmail(env.DB, identity.email);
}
