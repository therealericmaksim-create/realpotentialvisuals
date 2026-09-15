import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentStaff, getRawAccessToken } from "@/lib/currentStaff";
import { getAccessIdentityProfile } from "@/lib/access";

// Called once per admin session (not on every request, unlike the old
// approach — see lib/access.ts's header comment for why that regressed
// every other /api/admin/* route). Returns the real Google login name/
// photo from Cloudflare Access's identity endpoint, alongside the DB
// staff record (name/roles) so the client can show "real Google name +
// photo" with "roles from our own database" side by side, as intended.
export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { env } = getCloudflareContext();
  const token = await getRawAccessToken();
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;

  const profile =
    token && teamDomain ? await getAccessIdentityProfile(token, teamDomain) : null;

  return NextResponse.json({
    staff: { name: staff.name, email: staff.email, roles: staff.roles },
    identity: profile
      ? { name: profile.name, email: profile.email, pictureUrl: profile.pictureUrl }
      : null,
    // Staff-gated, so safe to always include — lets a real login be
    // inspected (e.g. via this endpoint directly, or the browser's
    // network tab) to confirm exactly which fields Cloudflare Access's
    // get-identity actually populates for this Google login setup,
    // rather than guessing at field names again if name/picture come
    // back null.
    rawIdentityDebug: profile?.raw ?? null,
  });
}
