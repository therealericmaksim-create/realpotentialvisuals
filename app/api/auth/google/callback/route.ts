import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getConfigValue } from "@/lib/systemConfig";
import { verifyGoogleIdToken, signCustomerSession, CUSTOMER_SESSION_COOKIE } from "@/lib/customerAuth";

const OAUTH_STATE_COOKIE = "rpv_oauth_state";
const OAUTH_REDIRECT_COOKIE = "rpv_oauth_redirect";

function errorRedirect(req: NextRequest, redirectTo: string, reason: string): NextResponse {
  const url = new URL(redirectTo, req.url);
  url.searchParams.set("auth_error", reason);
  const res = NextResponse.redirect(url);
  res.cookies.delete(OAUTH_STATE_COOKIE);
  res.cookies.delete(OAUTH_REDIRECT_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const redirectTo = req.cookies.get(OAUTH_REDIRECT_COOKIE)?.value || "/start";
  const expectedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");

  if (!code || !state || !expectedState || state !== expectedState) {
    return errorRedirect(req, redirectTo, "state_mismatch");
  }

  const { env } = getCloudflareContext();
  const [clientId, clientSecret, sessionSecret] = await Promise.all([
    getConfigValue(env.DB, "GOOGLE_OAUTH_CLIENT_ID", undefined),
    getConfigValue(env.DB, "GOOGLE_OAUTH_CLIENT_SECRET", undefined),
    getConfigValue(env.DB, "CUSTOMER_SESSION_SECRET", undefined),
  ]);

  if (!clientId || !clientSecret || !sessionSecret) {
    return errorRedirect(req, redirectTo, "not_configured");
  }

  const callbackUrl = new URL("/api/auth/google/callback", req.url).toString();

  let idToken: string | null = null;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      return errorRedirect(req, redirectTo, "token_exchange_failed");
    }
    const tokenBody = (await tokenRes.json()) as { id_token?: string };
    idToken = tokenBody.id_token ?? null;
  } catch {
    return errorRedirect(req, redirectTo, "token_exchange_failed");
  }

  if (!idToken) {
    return errorRedirect(req, redirectTo, "no_id_token");
  }

  const claims = await verifyGoogleIdToken(idToken, clientId);
  if (!claims || !claims.emailVerified) {
    return errorRedirect(req, redirectTo, "identity_unverified");
  }

  const sessionToken = await signCustomerSession(
    {
      googleAccountId: claims.sub,
      email: claims.email,
      name: claims.name,
      pictureUrl: claims.pictureUrl,
    },
    sessionSecret
  );

  const res = NextResponse.redirect(new URL(redirectTo, req.url));
  res.cookies.set(CUSTOMER_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.delete(OAUTH_STATE_COOKIE);
  res.cookies.delete(OAUTH_REDIRECT_COOKIE);
  return res;
}
