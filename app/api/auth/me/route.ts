import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getConfigValue } from "@/lib/systemConfig";
import { verifyCustomerSession, CUSTOMER_SESSION_COOKIE } from "@/lib/customerAuth";

// Customer-facing identity check — distinct from /api/admin/me (staff
// only). /start polls this to decide whether to show the sign-in gate
// or the intake form.

export async function GET(req: NextRequest) {
  const { env } = getCloudflareContext();
  const sessionSecret = await getConfigValue(env.DB, "CUSTOMER_SESSION_SECRET", undefined);
  const token = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value ?? null;
  const identity = await verifyCustomerSession(token, sessionSecret);
  return NextResponse.json({ identity });
}
