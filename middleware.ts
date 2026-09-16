import { NextRequest, NextResponse } from "next/server";

// admin.realpotentialvisuals.com and the public site are the same
// Next.js app/Worker/D1 binding — no separate deploy pipeline, no
// duplicated auth logic. This middleware just routes requests on the
// admin hostname into app/admin/* instead of the public page tree.
//
// The actual access control is NOT here — it's Cloudflare Access (Zero
// Trust), which sits in front of this Worker and rejects unauthenticated
// requests to the admin hostname before they ever reach this code. This
// middleware assumes anything that reaches it on the admin hostname has
// already passed that gate.

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const isAdminHost = host.startsWith("admin.");

  // Cloudflare Access is only configured to gate the admin hostname —
  // without this check, /admin would also be reachable (unauthenticated)
  // at realpotentialvisuals.com/admin, completely bypassing that gate.
  if (!isAdminHost && req.nextUrl.pathname.startsWith("/admin")) {
    return new NextResponse(null, { status: 404 });
  }

  // /api/admin/* routes are already correctly namespaced and must NOT be
  // rewritten — this exact bug sent every fetch() the admin SPA makes
  // (e.g. /api/admin/orders) to /admin/api/admin/orders instead, a route
  // that doesn't exist, producing a 404 with Next's own not-found page
  // HTML. That HTML (not JSON) response is what broke every admin fetch.
  if (isAdminHost && !req.nextUrl.pathname.startsWith("/admin") && !req.nextUrl.pathname.startsWith("/api")) {
    const url = req.nextUrl.clone();
    url.pathname = `/admin${req.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/).*)"],
};
