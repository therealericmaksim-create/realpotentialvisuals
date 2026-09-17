import type { NextRequest } from "next/server";
import { getConfigValue } from "./systemConfig";
import { verifyCustomerSession, CUSTOMER_SESSION_COOKIE, type CustomerIdentity } from "./customerAuth";

// Customer-side equivalent of lib/currentStaff.ts's getCurrentStaff():
// the one place that turns a request into a verified customer identity.
// Every customer-facing route that exposes order data goes through this —
// the session cookie is the security boundary, never a client-supplied
// email or id.
export async function getCurrentCustomer(
  req: NextRequest,
  db: D1Database
): Promise<CustomerIdentity | null> {
  const sessionSecret = await getConfigValue(db, "CUSTOMER_SESSION_SECRET", undefined);
  const token = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value ?? null;
  return verifyCustomerSession(token, sessionSecret);
}

// Which orders belong to this customer. Matches the real Google account id
// captured at order time, and falls back to the verified email so orders
// placed before customer sign-in existed (email came from Stripe, no
// google id) are still visible to the person who actually placed them.
// Safe because sign-in rejects any Google account whose email isn't
// verified, so a session's email is provably controlled by that user.
export const ORDER_OWNERSHIP_SQL =
  "(o.customer_google_account_id = ? OR o.customer_email = ?)";

export function orderOwnershipParams(identity: CustomerIdentity): [string, string] {
  return [identity.googleAccountId, identity.email];
}
