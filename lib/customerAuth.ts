// Customer-facing auth — a REAL Google identity for the person placing an
// order on /start, distinct from lib/access.ts (which verifies Cloudflare
// Access's own JWT for STAFF). There's no Cloudflare Access equivalent
// for public customers, so this app issues and verifies its own signed
// session cookie after a direct Google OAuth 2.0 handshake
// (app/api/auth/google/*) — same `jose` library already used for Access,
// same JWKS-verification shape, just against Google's own JWKS instead
// of Cloudflare's.
//
// Fails CLOSED like lib/access.ts, for the same reason: an unconfigured
// or broken check here must mean "not signed in," never "let it through."

import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";

export const CUSTOMER_SESSION_COOKIE = "rpv_customer_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — a customer's order can take days to process

export type CustomerIdentity = {
  googleAccountId: string; // Google's own `sub`, stable per Google account
  email: string;
  name: string | null;
  pictureUrl: string | null;
};

export async function signCustomerSession(
  identity: CustomerIdentity,
  secret: string
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({
    email: identity.email,
    name: identity.name,
    picture: identity.pictureUrl,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.googleAccountId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key);
}

export async function verifyCustomerSession(
  token: string | null,
  secret: string | undefined
): Promise<CustomerIdentity | null> {
  if (!token || !secret) return null;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    const googleAccountId = typeof payload.sub === "string" ? payload.sub : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    if (!googleAccountId || !email) return null;
    return {
      googleAccountId,
      email,
      name: typeof payload.name === "string" ? payload.name : null,
      pictureUrl: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return null;
  }
}

// --- Google's own JWKS, for verifying the ID token Google returns
// during the OAuth callback (a completely separate check from the
// session cookie above, which this app signs itself). ---

let googleJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getGoogleJwks() {
  if (!googleJwks) {
    googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  }
  return googleJwks;
}

export type GoogleIdTokenClaims = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  pictureUrl: string | null;
};

export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string
): Promise<GoogleIdTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(idToken, getGoogleJwks(), {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    if (!sub || !email) return null;
    return {
      sub,
      email,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : null,
      pictureUrl: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return null;
  }
}
