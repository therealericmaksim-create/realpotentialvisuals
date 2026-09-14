import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getStripeClient } from "@/lib/stripe";
import {
  computeOrderLineItems,
  type OrderItemPricingRow,
  type OrderPricingRow,
} from "@/lib/orderPricing";

// Creates a Stripe hosted Checkout Session for a saved order. Amounts are
// always recomputed from the order's own D1 row + order_items — nothing
// about price is ever taken from the request body.

type CheckoutRequestBody = { orderId?: string };

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CheckoutRequestBody;
  if (!body.orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const { env } = getCloudflareContext();

  const order = await env.DB.prepare(
    `SELECT starter_night, starter_seasonal, starter_holiday, starter_breakdown,
            premium_enabled, logo_key
     FROM orders WHERE id = ?`
  )
    .bind(body.orderId)
    .first<OrderPricingRow>();

  if (!order) {
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }

  const itemsResult = await env.DB.prepare(
    `SELECT style_name, night, seasonal, holiday, breakdown
     FROM order_items WHERE order_id = ?`
  )
    .bind(body.orderId)
    .all<OrderItemPricingRow>();

  const lineItems = computeOrderLineItems(order, itemsResult.results ?? []);
  const totalCents = lineItems.reduce((sum, l) => sum + l.amountCents, 0);

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const stripe = getStripeClient(env.STRIPE_SECRET_KEY);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems.map((line) => ({
      price_data: {
        currency: "usd",
        unit_amount: line.amountCents,
        product_data: { name: line.label },
      },
      quantity: 1,
    })),
    success_url: `${origin}/start?order=${body.orderId}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/start?order=${body.orderId}&checkout=cancelled`,
    client_reference_id: body.orderId,
    metadata: { orderId: body.orderId },
  });

  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO payments (id, order_id, stripe_session_id, amount_cents, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`
  )
    .bind(crypto.randomUUID(), body.orderId, session.id, totalCents, now, now)
    .run();

  await env.DB.prepare(
    `UPDATE orders SET status = 'queued', updated_at = ? WHERE id = ?`
  )
    .bind(now, body.orderId)
    .run();

  return NextResponse.json({ url: session.url });
}
