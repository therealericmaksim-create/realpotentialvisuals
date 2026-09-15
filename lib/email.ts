// Order confirmation email (Automation Routing Sheet Phase 1, step 8) —
// fires once a payment webhook/confirm actually verifies. Uses Resend's
// plain HTTP API (no SDK needed, works fine on Workers). Fails open: with
// no RESEND_API_KEY configured, or if the send itself fails, this never
// throws — a broken email send must never take down order placement.

const FROM_ADDRESS = "RealPotential Visuals <orders@realpotentialvisuals.com>";
const ADMIN_URL = "https://admin.realpotentialvisuals.com";

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

// Staff invite (admin Users > All Users > Add User) — there's no invite
// token or signup flow here: access itself is governed entirely by
// Cloudflare Access (must sign in with this exact Google account) plus
// this app's own staff table (must have an active row + at least one
// role to do anything once signed in). This email is purely informational
// — "you've been added, here's where to log in" — sent the moment the
// staff row + roles are created. Fails open, same as the order-
// confirmation email: a failed invite send must never block adding staff.
export async function sendStaffInviteEmail(
  apiKey: string | undefined,
  params: { toEmail: string; roles: string[] }
): Promise<void> {
  if (!apiKey || !params.toEmail) return;

  const roleList = params.roles.length
    ? params.roles.map((r) => r.replace(/_/g, " ")).join(", ")
    : "no roles yet — ask your Principal to grant some";

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
        subject: "You've been added to RealPotential Visuals admin",
        html: `
          <p>You've been added as staff on RealPotential Visuals.</p>
          <p>Roles: <strong>${roleList}</strong></p>
          <p>Sign in at <a href="${ADMIN_URL}">${ADMIN_URL}</a> with this
          exact Google account (<code>${params.toEmail}</code>) — that's
          all that's needed, there's no separate password or invite link.</p>
          <p>&mdash; RealPotential Visuals</p>
        `,
      }),
    });
  } catch {
    // Swallow — see sendOrderConfirmationEmail's note above.
  }
}
