import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata = { title: "Privacy Policy — RealPotential Visuals" };

export default function PrivacyPolicyPage() {
  return (
    <>
      <SiteHeader />
      <div className="legal-page">
        <div className="legal-wrap">
          <h1>Privacy Policy</h1>
          <p className="updated">Last updated September 17, 2026</p>

          <p>
            RealPotential Visuals (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) provides AI-assisted,
            human-curated exterior visualizations of real properties through realpotentialvisuals.com (the
            &quot;Service&quot;). This policy explains, in detail, what information we collect, how and why we use
            it, who we share it with, how long we keep it, and the rights you have over it.
          </p>

          <h2>Google User Data — What We Access and Why</h2>
          <p>
            To place an order, you must sign in with your Google account. When you do, Google shares the following
            with us, and only this:
          </p>
          <ul>
            <li><strong>Your email address</strong> (scope: <code>.../auth/userinfo.email</code>) — used to identify your account, associate it with your orders, and reach you about your order&apos;s status.</li>
            <li><strong>Your name and profile photo</strong> (scope: <code>.../auth/userinfo.profile</code>) — used only to display who&apos;s signed in on the order page.</li>
            <li><strong>A unique, non-identifying Google account ID</strong> (scope: <code>openid</code>) — used internally to recognize returning customers across orders.</li>
          </ul>
          <p>
            We do <strong>not</strong> request access to your Google Drive, Gmail, Contacts, Calendar, or any other
            Google product or data beyond the three items above. We do not use this data for advertising, and we
            never sell it. No human at RealPotential Visuals reads or reviews your Google profile data except as
            necessary to provide customer support you&apos;ve requested, to maintain security, or to comply with
            the law.
          </p>
          <p>
            RealPotential Visuals&apos;s use and transfer of information received from Google APIs adheres to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>

          <h2>Other Information We Collect</h2>
          <ul>
            <li>
              <strong>Property information you provide.</strong> The property address, a photo of the home&apos;s
              exterior, HOA and historic-district answers, an optional logo, and any style preferences or custom
              instructions you submit.
            </li>
            <li>
              <strong>Order and payment information.</strong> Payments are processed entirely by Stripe — we never
              see or store your card number. We do retain order details (styles selected, add-ons, amount paid,
              order status).
            </li>
            <li>
              <strong>Communications.</strong> If you contact us, we keep a record of that correspondence so we can
              respond and refer back to it.
            </li>
            <li>
              <strong>Technical information.</strong> Standard web request data our hosting provider (Cloudflare)
              logs for security and reliability, such as IP address and browser type.
            </li>
          </ul>

          <h2>How We Use Information</h2>
          <ul>
            <li>To analyze your property photo and generate exterior style visualizations.</li>
            <li>To have a human curator select and review styles and renders before delivery.</li>
            <li>To process payment, fulfill your order, and send order-related email updates.</li>
            <li>To contact you if we need clarification or run into an issue with your order, at any stage of processing.</li>
            <li>To recognize you as a returning customer across multiple orders or properties.</li>
            <li>To maintain the security of our platform and prevent fraud or abuse.</li>
            <li>To improve the quality and accuracy of our style-matching and rendering process.</li>
          </ul>

          <h2>Third Parties We Share Data With</h2>
          <p>We rely on a small number of service providers to operate:</p>
          <ul>
            <li>
              <strong>Google</strong> — sign-in authentication, and Street View imagery used to read neighborhood
              context for curation.
            </li>
            <li>
              <strong>OpenAI</strong> — analyzes your uploaded photo (structure, visible design elements) and
              assists with generating exterior style visualizations and public zoning/regulatory research tied to
              your address.
            </li>
            <li><strong>Stripe</strong> — processes payment. Stripe&apos;s own privacy policy governs payment data.</li>
            <li><strong>Resend</strong> — delivers transactional emails (order confirmations, updates).</li>
            <li><strong>Cloudflare</strong> — hosts our application, database, and file storage.</li>
          </ul>
          <p>
            Each of these providers only receives the specific data needed to perform its function for us (for
            example, Stripe never receives your uploaded photo, and OpenAI never receives your payment
            information). We do not sell your personal information to third parties, and we do not share it for
            cross-context behavioral advertising.
          </p>

          <h2>Data Security</h2>
          <p>
            Your data is stored on Cloudflare&apos;s infrastructure, transmitted over encrypted (HTTPS) connections,
            and access to it within RealPotential Visuals is limited to staff who need it to fulfill your order.
            Your Google sign-in session is stored in a signed, HTTP-only cookie that your browser sends back to us
            automatically — it is never exposed to page scripts or third parties.
          </p>

          <h2>Data Retention</h2>
          <p>
            We retain your uploaded photos, order details, and delivered renders for as long as needed to fulfill
            your order and to maintain a record of past work in case you order again or have a question about a
            past order. You can request deletion of your personal data at any time (see Your Rights below),
            subject to what we&apos;re required to keep for legitimate business, legal, or accounting purposes
            (such as payment records).
          </p>

          <h2>Cookies</h2>
          <p>
            We use a session cookie to keep you signed in after Google authentication, and a short-lived cookie
            during the sign-in process itself (cleared immediately after). We do not currently use third-party
            advertising or tracking cookies; if that changes, we&apos;ll update this policy first.
          </p>

          <h2>Children&apos;s Privacy</h2>
          <p>
            Our service is not directed at children, and we do not knowingly collect personal information from
            anyone under 13.
          </p>

          <h2>Your Rights</h2>
          <p>
            You can request access to, correction of, or deletion of your personal information — including your
            Google-sourced profile data — by contacting us at{" "}
            <a href="mailto:orders@realpotentialvisuals.com">orders@realpotentialvisuals.com</a>. You can also
            revoke RealPotential Visuals&apos;s access to your Google account at any time from your{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
              Google Account permissions page
            </a>
            .
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            We may update this policy as our service evolves. We&apos;ll update the &quot;Last updated&quot; date
            above when we do.
          </p>

          <h2>Contact Us</h2>
          <p>
            Questions about this policy? Email{" "}
            <a href="mailto:orders@realpotentialvisuals.com">orders@realpotentialvisuals.com</a>.
          </p>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
