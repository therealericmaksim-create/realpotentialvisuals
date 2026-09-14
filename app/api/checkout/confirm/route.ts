import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getStripeClient } from "@/lib/stripe";
import { sendOrderConfirmationEmail } from "@/lib/email";

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

  if (payment.status !== "succeeded") {
    const now = new Date().toISOString();
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
      `UPDATE orders SET status = 'placed', updated_at = ? WHERE id = ?`
    )
      .bind(now, payment.order_id)
      .run();

    await sendOrderConfirmationEmail(env.RESEND_API_KEY, {
      toEmail: session.customer_details?.email ?? null,
      orderId: payment.order_id,
      totalCents: session.amount_total ?? 0,
    });
  }

  return NextResponse.json({
    paid: true,
    orderId: payment.order_id,
    status: "placed",
  });
}
