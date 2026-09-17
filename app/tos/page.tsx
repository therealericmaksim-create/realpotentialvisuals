import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { AI_DISCLOSURE_TEXT } from "@/lib/disclosure";

export const metadata = { title: "Terms of Service — RealPotential Visuals" };

export default function TermsOfServicePage() {
  return (
    <>
      <SiteHeader />
      <div className="legal-page">
        <div className="legal-wrap">
          <h1>Terms of Service</h1>
          <p className="updated">Last updated September 17, 2026</p>

          <p>
            These Terms of Service (&quot;Terms&quot;) govern your use of realpotentialvisuals.com and the services
            offered by RealPotential Visuals (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By placing an
            order, you agree to these Terms.
          </p>

          <h2>Our Service</h2>
          <p>
            We produce AI-assisted, human-curated exterior style visualizations from a photo you upload of your
            property. Every order is reviewed by a real person before delivery — the AI does the rendering, a
            curator selects and checks the result.
          </p>

          <h2>AI Disclosure</h2>
          <p>{AI_DISCLOSURE_TEXT}</p>

          <h2>Account &amp; Sign-In</h2>
          <p>
            Placing an order requires signing in with a Google account. You&apos;re responsible for keeping that
            account secure. We use your Google account only to identify you and to have a way to reach you about
            your order.
          </p>

          <h2>Ordering &amp; Pricing</h2>
          <p>
            Pricing is shown at the time you place your order and is charged per render, by tier (Self-Directed,
            Curated, or Premium), plus any add-ons you select. Pricing may change at any time; the price shown at
            checkout is what applies to your order.
          </p>

          <h2>Payment</h2>
          <p>
            Payment is processed securely by Stripe at checkout. We do not see or store your card details.
          </p>

          <h2>Delivery</h2>
          <p>
            Orders typically deliver in 1–2 business days, though timing can shift during busy periods — we&apos;ll
            let you know if that&apos;s the case for your order.
          </p>

          <h2>Revisions</h2>
          <p>
            A revision to a delivered render is billed at that render&apos;s own tier price.
          </p>

          <h2>Refunds</h2>
          <p>
            Refund requests are reviewed on a case-by-case basis. Contact us at{" "}
            <a href="mailto:orders@realpotentialvisuals.com">orders@realpotentialvisuals.com</a> before your order
            is delivered if you need to cancel or have a concern.
          </p>

          <h2>Acceptable Use</h2>
          <p>
            Visualizations are AI-generated concepts, not photographs of your property as it would actually be
            built. You agree not to present a RealPotential Visuals render as an actual, unaltered photograph of
            the property — for example, in a real estate listing without disclosing that it&apos;s a
            visualization.
          </p>

          <h2>Ownership</h2>
          <p>
            Once delivered, you may use your renders for personal or business purposes (such as showing a
            contractor or a real estate listing, with appropriate AI disclosure). We may showcase delivered work in
            our own portfolio or marketing unless you ask us not to.
          </p>

          <h2>Limitation of Liability</h2>
          <p>
            Our service is provided &quot;as is.&quot; We don&apos;t guarantee that a visualized style is
            structurally feasible for your specific property beyond the analysis we perform, and we&apos;re not
            liable for decisions made based on a visualization. To the extent permitted by law, our liability for
            any claim relating to your order is limited to the amount you paid for that order.
          </p>

          <h2>Changes to These Terms</h2>
          <p>
            We may update these Terms as our service evolves. We&apos;ll update the &quot;Last updated&quot; date
            above when we do.
          </p>

          <h2>Contact Us</h2>
          <p>
            Questions about these Terms? Email{" "}
            <a href="mailto:orders@realpotentialvisuals.com">orders@realpotentialvisuals.com</a>.
          </p>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
