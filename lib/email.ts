// Order confirmation email (Automation Routing Sheet Phase 1, step 8) —
// fires once a payment webhook/confirm actually verifies. Uses Resend's
// plain HTTP API (no SDK needed, works fine on Workers). Fails open: with
// no RESEND_API_KEY configured, or if the send itself fails, this never
// throws — a broken email send must never take down order placement.

const FROM_ADDRESS = "RealPotential Visuals <orders@realpotentialvisuals.com>";

export async function sendOrderConfirmationEmail(
  apiKey: string | undefined,
  params: { toEmail: string | null; orderId: string; totalCents: number }
): Promise<void> {
  if (!apiKey || !params.toEmail) return;

  const amount = (params.totalCents / 100).toFixed(2);

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [params.toEmail],
        subject: "Your RealPotential Visuals order is confirmed",
        html: `
          <p>Thanks for your order!</p>
          <p>We've received your payment of <strong>$${amount}</strong> and your
          order is now in our queue. We'll review your photo and start on your
          curated styles — typically 1&ndash;2 business days.</p>
          <p>Order reference: <code>${params.orderId}</code></p>
          <p>&mdash; RealPotential Visuals</p>
        `,
      }),
    });
  } catch {
    // Swallow — email is a nice-to-have, never a reason to fail payment
    // confirmation. Worth adding real logging/alerting here later.
  }
}
