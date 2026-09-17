import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolvePricing } from "@/lib/pricingConfig";

// Public — pricing is meant to be visible to anyone (the homepage and
// /start intake form both need it, unauthenticated). Same pattern as
// /api/config/maps-key: serve current runtime config to the client
// instead of baking it into the build, so an admin price change takes
// effect with no deploy. What actually gets CHARGED is always
// independently re-resolved server-side at order-creation/checkout time
// (lib/orders.ts, /api/checkout) — this endpoint only affects display.

export async function GET() {
  const { env } = getCloudflareContext();
  const pricing = await resolvePricing(env.DB);
  return NextResponse.json(pricing);
}
