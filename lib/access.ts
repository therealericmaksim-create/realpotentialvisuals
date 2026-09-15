import { createRemoteJWKSet, jwtVerify } from "jose";

// Verifies the identity Cloudflare Access already established before this
// request ever reached the Worker. This is layer 1 (authentication) only —
// "is this a real, Google-verified human" — never authorization. Layer 2
// (staff.ts) decides what they're allowed to do.
//
// Fails CLOSED, deliberately unlike every other integration in this app:
// a broken/unconfigured check here must deny access, not skip a nice-to-
// have. Never copy the "fail open" pattern from lib/openai.ts or
// lib/email.ts onto this file.
//
// Deliberately fast — no extra network calls beyond JWKS (module-cached).
// getCurrentStaff() calls this on EVERY admin page/API request, so an
// earlier version that also fetched Cloudflare's get-identity endpoint
// here made every single request pay for a second round-trip, which was
// slow/flaky enough to intermittently fail plain page loads (e.g.
// /api/admin/orders). The identity-profile fetch (name/picture) now lives
// in getAccessIdentityProfile() below, called only by /api/admin/me —
// once per admin session, not once per request.

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksTeamDomain: string | null = null;

function getJwks(teamDomain: string) {
  if (!jwks || jwksTeamDomain !== teamDomain) {
    jwks = createRemoteJWKSet(
      new URL(`https://${teamDomain}/cdn-cgi/access/certs`)
    );
    jwksTeamDomain = teamDomain;
  }
  return jwks;
}

export type AccessIdentity = { email: string };

export async function verifyAccessToken(
  token: string | null,
  env: { CF_ACCESS_TEAM_DOMAIN?: string; CF_ACCESS_AUD?: string }
): Promise<AccessIdentity | null> {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  if (!teamDomain || !aud || !token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience: aud,
    });
    const email = typeof payload.email === "string" ? payload.email : null;
    return email ? { email } : null;
  } catch {
    // Invalid signature, expired, wrong audience, etc. — treat exactly
    // like "not authenticated", never surface the specific reason to the
    // client.
    return null;
  }
}

export type AccessIdentityProfile = {
  name: string | null;
  email: string | null;
  pictureUrl: string | null;
  raw: Record<string, unknown>;
};

// The Access JWT itself only carries {email} — the IdP's own profile
// fields (Google display name, avatar photo) come from Cloudflare's
// separate "get identity" endpoint instead. Called on demand (see
// /api/admin/me), never as part of the universal auth check. Returns the
// raw payload too so a real login can be inspected once to confirm which
// fields this Access application's Google IdP config actually populates
// — `name`/`picture` are the commonly documented ones, but that's not
// guaranteed for every Zero Trust Google login-method configuration.
export async function getAccessIdentityProfile(
  token: string,
  teamDomain: string
): Promise<AccessIdentityProfile | null> {
  try {
    const res = await fetch(`https://${teamDomain}/cdn-cgi/access/get-identity`, {
      headers: { Cookie: `CF_Authorization=${token}` },
    });
    if (!res.ok) return null;
    const identity = (await res.json()) as Record<string, unknown>;
    return {
      name: typeof identity.name === "string" && identity.name ? identity.name : null,
      email: typeof identity.email === "string" ? identity.email : null,
      pictureUrl: typeof identity.picture === "string" ? identity.picture : null,
      raw: identity,
    };
  } catch {
    return null;
  }
}
