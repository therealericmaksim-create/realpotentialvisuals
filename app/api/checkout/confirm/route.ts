import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getStripeClient } from "@/lib/stripe";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { ensurePropertyLinkage } from "@/lib/analysis/propertyLinkage";

// Called from the Stripe success redirect to finalize an order the moment
// the customer lands back on the site. The webhook (/api/stripe/webhook)
// does the same finalization independently and idempotently, so payment
// still gets recorded even if the customer never makes it back here.

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const stripe = getStripeClient(env.STRIPE_SECRET_KEY);

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  const payment = await env.DB.prepare(
    `SELECT id, order_id, status FROM payments WHERE stripe_session_id = ?`
  )
    .bind(sessionId)
    .first<{ id: string; order_id: string; status: string }>();

  if (!payment) {
    return NextResponse.json({ error: "payment not found" }, { status: 404 });
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json({
      paid: false,
      orderId: payment.order_id,
      status: session.payment_status,
    });
  }

  const now = new Date().toISOString();
  const customerEmail = session.customer_details?.email ?? null;

  if (payment.status !== "succeeded") {
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

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

    await sendOrderConfirmationEmail(env.RESEND_API_KEY, {
      toEmail: customerEmail,
      orderId: payment.order_id,
      totalCents: session.amount_total ?? 0,
    });
  } else if (customerEmail) {
    // The webhook may have already marked this succeeded from a session
    // snapshot taken before Stripe finished attaching customer_details
    // (email verification can trail the completed event by a moment). This
    // fresh retrieve() is authoritative, so backfill a still-missing email
    // rather than trusting the stale null forever.
    await env.DB.prepare(
      `UPDATE orders SET customer_email = COALESCE(customer_email, ?) WHERE id = ?`
    )
      .bind(customerEmail, payment.order_id)
      .run();
  }

  // Sets up client/property/job so the order is ready for Phase 2 analysis
  // the moment staff open the admin panel — never spends AI credits itself.
  // Idempotent and safe to call even when the block above was skipped, so a
  // late-arriving email (see above) still gets a chance to complete linkage.
  await ensurePropertyLinkage(env.DB, payment.order_id);

  return NextResponse.json({
    paid: true,
    orderId: payment.order_id,
    status: "placed",
  });
}
