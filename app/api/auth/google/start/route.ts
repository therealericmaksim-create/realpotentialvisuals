import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getConfigValue } from "@/lib/systemConfig";

// Kicks off the customer-facing Google sign-in /start requires. Direct
// OAuth 2.0 authorization-code flow (no framework) -- state + the
// post-login redirect target both travel in a short-lived HttpOnly
// cookie, verified against the state param when Google calls back at
// /api/auth/google/callback, so this can't be used for an open redirect
// or a CSRF'd login.

const OAUTH_STATE_COOKIE = "rpv_oauth_state";
const OAUTH_REDIRECT_COOKIE = "rpv_oauth_redirect";

function safeRedirectTarget(raw: string | null): string {
  // Only ever a same-site path -- never an absolute URL, which would
  // otherwise let this endpoint be used as an open redirect.
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/start";
}

export async function GET(req: NextRequest) {
  const { env } = getCloudflareContext();
  const clientId = await getConfigValue(env.DB, "GOOGLE_OAUTH_CLIENT_ID", undefined);

  const redirectTo = safeRedirectTarget(req.nextUrl.searchParams.get("redirect_to"));

  if (!clientId) {
    const url = new URL(redirectTo, req.url);
    url.searchParams.set("auth_error", "not_configured");
    return NextResponse.redirect(url);
  }

  const state = crypto.randomUUID();
  const callbackUrl = new URL("/api/auth/google/callback", req.url).toString();

  const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid email profile");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("access_type", "online");
  authorizeUrl.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(authorizeUrl);
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set(OAUTH_STATE_COOKIE, state, cookieOpts);
  res.cookies.set(OAUTH_REDIRECT_COOKIE, redirectTo, cookieOpts);
  return res;
}
