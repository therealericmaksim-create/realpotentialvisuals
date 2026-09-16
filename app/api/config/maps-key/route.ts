import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getConfigValue } from "@/lib/systemConfig";

// Google Maps JS API keys are meant to be public — restricted by HTTP
// referrer allowlist in Google Cloud Console, not by secrecy — so this is
// a plain wrangler.jsonc var, not a wrangler secret. Serving it via this
// endpoint (rather than baking it into the client bundle at build time)
// keeps it consistent with how every other bit of runtime config in this
// app reaches the client, and lets the address field fail open (falls
// back to a plain text input) when the key isn't configured yet.

export async function GET() {
  const { env } = getCloudflareContext();
  const apiKey = await getConfigValue(env.DB, "GOOGLE_MAPS_API_KEY", env.GOOGLE_MAPS_API_KEY);
  return NextResponse.json({ apiKey: apiKey || null });
}
