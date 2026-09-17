import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCurrentCustomer, ORDER_OWNERSHIP_SQL, orderOwnershipParams } from "@/lib/currentCustomer";

// Customer-facing R2 passthrough. Unlike the staff route (which trusts any
// signed-in staff member with any key), this one will NOT serve an
// arbitrary key to a signed-in customer: the key has to be reachable from
// an order that customer owns. Without that check, any logged-in customer
// who guessed or saw another customer's photo key could fetch their house
// photo, so the ownership lookup is the whole point of this route
// existing separately.

type Params = { params: Promise<{ key: string[] }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { key } = await params;
  const objectKey = key.join("/");
  const { env } = getCloudflareContext();

  const identity = await getCurrentCustomer(req, env.DB);
  if (!identity) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const owner = orderOwnershipParams(identity);
  const owned = await env.DB.prepare(
    `SELECT 1 as ok FROM orders o
     WHERE (o.curbappeal_photo_key = ? OR o.logo_key = ?) AND ${ORDER_OWNERSHIP_SQL}
     UNION ALL
     SELECT 1 as ok FROM renders r
     JOIN orders o ON o.job_id = r.job_id
     WHERE (r.delivered_key = ? OR r.storage_key = ?) AND ${ORDER_OWNERSHIP_SQL}
     LIMIT 1`
  )
    .bind(objectKey, objectKey, ...owner, objectKey, objectKey, ...owner)
    .first<{ ok: number }>();

  // Same response for "not yours" and "doesn't exist" — a different status
  // for each would confirm which keys are real.
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  const object = await env.MEDIA.get(objectKey);
  if (!object) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(object.body as ReadableStream, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
