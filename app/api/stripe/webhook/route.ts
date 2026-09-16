import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getStripeClient } from "@/lib/stripe";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { ensurePropertyLinkage } from "@/lib/analysis/propertyLinkage";
import { getConfigValue } from "@/lib/systemConfig";
import type Stripe from "stripe";

// Reliable, out-of-band payment confirmation — catches the case where a
// customer pays but never makes it back to /api/checkout/confirm (closed
// tab, network drop, etc). Requires STRIPE_WEBHOOK_SECRET, set once a
// webhook endpoint pointing at /api/stripe/webhook exists in the Stripe
// Dashboard (Developers > Webhooks). Until that secret is set, this route
// safely no-ops with a 503 rather than accepting unverified events.

export async function POST(req: NextRequest) {
  const { env } = getCloudflareContext();
  const webhookSecret = await getConfigValue(env.DB, "STRIPE_WEBHOOK_SECRET", env.STRIPE_WEBHOOK_SECRET);
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not configured" },
      { status: 503 }
    );
  }

  const secretKey = await getConfigValue(env.DB, "STRIPE_SECRET_KEY", env.STRIPE_SECRET_KEY);
  if (!secretKey) {
    return NextResponse.json({ error: "Stripe is not configured (STRIPE_SECRET_KEY)" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  const payload = await req.text();
  const stripe = getStripeClient(secretKey);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature ?? "",
      webhookSecret
    );
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status === "paid") {
      const payment = await env.DB.prepare(
        `SELECT id, order_id, status FROM payments WHERE stripe_session_id = ?`
      )
        .bind(session.id)
        .first<{ id: string; order_id: string; status: string }>();

      if (payment) {
        const customerEmail = session.customer_details?.email ?? null;

        if (payment.status !== "succeeded") {
          const paymentIntentId =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null;

          await env.DB.prepare(
            `UPDATE payments SET status = 'succeeded', stripe_payment_intent = ?, updated_at = ? WHERE id = ?`
          )
            .bind(paymentIntentId, now, payment.id)
            .run();

          await env.DB.prepare(
            `UPDATE orders SET status = 'placed', customer_email = ?, updated_at = ? WHERE id = ?`
          )
            .bind(customerEmail, now, payment.order_id)
            .run();

          const resendKey = await getConfigValue(env.DB, "RESEND_API_KEY", env.RESEND_API_KEY);
          await sendOrderConfirmationEmail(resendKey, {
            toEmail: customerEmail,
            orderId: payment.order_id,
            totalCents: session.amount_total ?? 0,
          });
        } else if (customerEmail) {
          // See /api/checkout/confirm — the event snapshot's customer_details
          // can trail the completed event by a moment, so backfill a
          // still-missing email rather than trusting a stale null forever.
          await env.DB.prepare(
            `UPDATE orders SET customer_email = COALESCE(customer_email, ?) WHERE id = ?`
          )
            .bind(customerEmail, payment.order_id)
            .run();
        }

        // Idempotent — safe even when the block above was skipped, so a
        // late-arriving email still gets a chance to complete linkage.
        await ensurePropertyLinkage(env.DB, payment.order_id);
      }
    }
  }

  if (
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;

    const payment = await env.DB.prepare(
      `SELECT id FROM payments WHERE stripe_session_id = ?`
    )
      .bind(session.id)
      .first<{ id: string }>();

    if (payment) {
      await env.DB.prepare(
        `UPDATE payments SET status = 'failed', updated_at = ? WHERE id = ?`
      )
        .bind(now, payment.id)
        .run();
    }
  }

  return NextResponse.json({ received: true });
}
