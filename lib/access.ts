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
