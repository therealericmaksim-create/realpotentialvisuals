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

export type AccessIdentity = { email: string; pictureUrl: string | null };

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
    if (!email) return null;

    return { email, pictureUrl: await fetchAccessPictureUrl(teamDomain, token) };
  } catch {
    // Invalid signature, expired, wrong audience, etc. — treat exactly
    // like "not authenticated", never surface the specific reason to the
    // client.
    return null;
  }
}

// The Access JWT itself only carries the claims above — the IdP's own
// profile fields (Google's avatar photo included) come from Cloudflare's
// separate "get identity" endpoint instead. Best-effort and non-fatal:
// the login/authorization decision never depends on this succeeding, only
// whether the staff badge shows a real photo or falls back to initials.
async function fetchAccessPictureUrl(teamDomain: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${teamDomain}/cdn-cgi/access/get-identity`, {
      headers: { Cookie: `CF_Authorization=${token}` },
    });
    if (!res.ok) return null;
    const identity = (await res.json()) as { picture?: unknown };
    return typeof identity.picture === "string" ? identity.picture : null;
  } catch {
    return null;
  }
}
