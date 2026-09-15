import SiteHeader from "@/components/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader />

      {/* ======================================================================
          HERO
          ====================================================================== */}
      <section className="hero">
        <div className="wrap">
          <div className="eyebrow">RealPotential Visuals</div>
          <h1>
            See What Your Property
            <br />
            Could <span>Look Like</span>
          </h1>
          <p className="sub">
            Before you renovate. Before you list it. Before you spend a
            dollar. Human curated, AI-powered exterior visualizations — real
            results, real fast.
          </p>

          <div className="btn-row center" style={{ justifyContent: "center" }}>
            {/* Not linked to /start yet */}
            <a href="#" className="btn btn-gold">
              Order Now
            </a>
            <a href="#pricing" className="btn btn-outline">
              See Pricing
            </a>
          </div>
        </div>
        <div className="scroll-cue">
          <span>&#8595;</span>Scroll
        </div>
      </section>

      {/* ======================================================================
          REAL EXAMPLE  (the before/after that used to sit inside the hero)
          ====================================================================== */}
      <section>
        <div className="wrap center">
          <div className="eyebrow">See It In Action</div>
          <h2>One Real Transformation</h2>

          <div className="compare" style={{ marginTop: "44px" }}>
            <div className="compare-img">
              <img src="/images/original.jpg" alt="Current home exterior" />
              <span className="compare-tag">Current</span>
            </div>
            <div className="compare-arrow">&#10148;</div>
            <div className="compare-img">
              <img
                src="/images/hero.png"
                alt="Potential home exterior visualization"
              />
              <span className="compare-tag">Potential</span>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================================
          THE MARK  (the AI-disclosure overlay every delivered render carries)
          ====================================================================== */}
      <section className="mark">
        <div className="wrap mark-inner">
          <img
            src="/images/render-overlay-ai.png"
            alt="Human Curated, AI-Powered — Not a real photo overlay mark"
            style={{ maxWidth: "480px", width: "100%", height: "auto" }}
          />
          <p>
            Every render we deliver carries this mark, stamped directly onto
            the image itself — not buried in fine print. It&apos;s how you
            (and anyone you show it to) can recognize a RealPotential
            visualization on sight: a real curator selected the style, our
            team reviewed the result before it ever reached you, and the AI
            did the rendering. The mark does two jobs at once — it&apos;s our
            quality signature, and it&apos;s an honest, unmissable label that
            what you&apos;re looking at is an AI-generated visualization, not
            an actual photograph of your home.
          </p>
        </div>
      </section>

      {/* ======================================================================
          GALLERY
          To swap a style: change the src= filename and the <h4> caption.
          Change className="pill-buildable" to className="pill-conceptual"
          (or back) to flip the little tag under any image.
          ====================================================================== */}
      <section id="gallery">
        <div className="wrap center">
          <div className="eyebrow">See the Range</div>
          <h2>One House. Six Possibilities.</h2>

          <div className="gallery-grid">
            <div className="gallery-card">
              <img src="/images/clean.png" alt="Classic Stone style" />
              <div className="gallery-info">
                <h4>Classic Stone</h4>
                <span className="pill pill-buildable">Buildable</span>
              </div>
            </div>
            <div className="gallery-card">
              <img src="/images/warm.png" alt="Craftsman Warmth style" />
              <div className="gallery-info">
                <h4>Craftsman Warmth</h4>
                <span className="pill pill-buildable">Buildable</span>
              </div>
            </div>
            <div className="gallery-card">
              <img src="/images/craftsman.png" alt="Tuscan Stone style" />
              <div className="gallery-info">
                <h4>Tuscan Stone</h4>
                <span className="pill pill-conceptual">Conceptual</span>
              </div>
            </div>
            <div className="gallery-card">
              <img src="/images/wood.png" alt="Rustic Log Cabin style" />
              <div className="gallery-info">
                <h4>Rustic Log Cabin</h4>
                <span className="pill pill-buildable">Buildable</span>
              </div>
            </div>
            <div className="gallery-card">
              <img src="/images/dark.png" alt="Modern Farmhouse style" />
              <div className="gallery-info">
                <h4>Modern Farmhouse</h4>
                <span className="pill pill-buildable">Buildable</span>
              </div>
            </div>
            <div className="gallery-card">
              <img src="/images/evening.png" alt="Victorian Elegance style" />
              <div className="gallery-info">
                <h4>Victorian Elegance</h4>
                <span className="pill pill-buildable">Buildable</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================================
          OUR DIFFERENCE
          ====================================================================== */}
      <section className="explain">
        <div className="wrap center">
          <div className="eyebrow">Our Difference</div>
          <h2>Curated. Honest. Reviewed.</h2>
          <p className="explain-inner" style={{ marginTop: "16px" }}>
            Most tools generate a pretty picture and stop there. Here&apos;s
            what actually happens before anything reaches you.
          </p>

          <div className="who-grid">
            <div className="who-card">
              <h3>Matched to Your Home &amp; Neighborhood</h3>
              <p>
                Every curated style is checked against your home&apos;s real
                structure and climate, and against what&apos;s already built
                around you — not just what looks good in a render.
              </p>
            </div>
            <div className="who-card">
              <h3>Buildable vs. Conceptual</h3>
              <p>
                Every style is honestly labeled as a realistic renovation
                your home could genuinely support, or a bold reimagining
                meant to inspire. We label every one, every time.
              </p>
            </div>
            <div className="who-card">
              <h3>A Person Reviews Every Result</h3>
              <p>
                Before anything reaches you, a real person checks it. The AI
                does the rendering. A human stands behind what you receive.
              </p>
            </div>
            <div className="who-card">
              <h3>Know What&apos;s Structural</h3>
              <p>
                Want the specifics? For an added fee, we&apos;ll break down
                exactly which changes are structural versus cosmetic.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================================
          WHO IT'S FOR
          ====================================================================== */}
      <section id="who">
        <div className="wrap center">
          <div className="eyebrow">Built For</div>
          <h2>Who This Is For</h2>

          <div className="who-grid">
            <div className="who-card">
              <h3>Homeowners &amp; FSBO Sellers</h3>
              <p>
                See your home&apos;s potential before you spend a dollar, or
                make your listing stand out without an agent&apos;s budget.
              </p>
            </div>
            <div className="who-card">
              <h3>Real Estate Agents</h3>
              <p>A pre-listing marketing tool that helps a home sell faster.</p>
            </div>
            <div className="who-card">
              <h3>Contractors</h3>
              <p>A closing tool for your next bid, rendered in your own materials.</p>
            </div>
            <div className="who-card">
              <h3>Investors &amp; Flippers</h3>
              <p>Evaluate a property&apos;s potential before you buy it.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================================
          CURB APPEAL STAT
          ====================================================================== */}
      <section className="curb-stat">
        <div className="wrap">
          <img
            src="/images/curb-appeal-stat.png"
            alt="97% of realtors say curb appeal directly affects how buyers respond to a listing, per the National Association of Realtors. The catch: most homeowners don't know which upgrade is actually worth it until they've already paid for it. We show you first — upload one photo, see realistic styles, make confident decisions."
          />
        </div>
      </section>

      {/* ======================================================================
          PRICING
          ====================================================================== */}
      <section id="pricing">
        <div className="wrap">
          <div className="center">
            <div className="eyebrow">Simple Pricing and Process</div>
            <h2>Services &amp; Addons</h2>
          </div>

          <p className="center" style={{ maxWidth: "640px", margin: "0 auto 32px" }}>
            Upload one photo, then pick how many renders you want in each
            tier — mix and match freely.
          </p>

          <div className="pricing-tiers">
            <div className="tier-row">
              <div className="price-box">
                <h3>Self-Directed</h3>
                <div className="big-price">
                  $29.99<span className="price-unit"> / render</span>
                </div>
                <p className="desc">
                  You pick the style yourself from our full catalog — fully
                  automated, no waiting on a curator.
                </p>
              </div>
              <div className="price-box how-box">
                <h3>How It Works</h3>
                <ol className="how-steps">
                  <li>Upload your photo and pick any style from our catalog.</li>
                  <li>Your render is generated automatically — no curator wait.</li>
                  <li>We&apos;ll tell you whether it&apos;s buildable or conceptual for your home when we deliver it.</li>
                </ol>
              </div>
            </div>

            <div className="tier-row">
              <div className="price-box featured">
                <h3>Curated</h3>
                <div className="big-price">
                  $44.99<span className="price-unit"> / render</span>
                </div>
                <p className="desc">
                  Our team picks the style for your specific home and
                  neighborhood, backed by the same structural analysis every
                  tier gets.
                </p>
              </div>
              <div className="price-box how-box featured">
                <h3>How It Works</h3>
                <ol className="how-steps">
                  <li>Upload your photo — we analyze your home&apos;s structure and neighborhood.</li>
                  <li>A curator selects up to 6 styles that genuinely fit, from that analysis.</li>
                  <li>We render and review each one before it reaches you.</li>
                </ol>
              </div>
            </div>

            <div className="tier-row">
              <div className="price-box">
                <h3>Premium</h3>
                <div className="big-price">
                  $59.99<span className="price-unit"> / render</span>
                </div>
                <p className="desc">
                  Describe exactly what you want — a specific era, an unusual
                  roofline, a full custom vision.
                </p>
              </div>
              <div className="price-box how-box">
                <h3>How It Works</h3>
                <ol className="how-steps">
                  <li>Describe exactly what you want, in your own words.</li>
                  <li>Our team scopes what&apos;s feasible for your home before rendering.</li>
                  <li>Delivered with the same full quality review as every tier.</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="extras-row">
            <h3>Extras — per render</h3>
            <div className="extras-grid">
              <div className="extra-item">
                <span className="lbl">Night View</span>
                <span className="amt">$9.99</span>
              </div>
              <div className="extra-item">
                <span className="lbl">Seasonal Look</span>
                <span className="amt">$9.99</span>
              </div>
              <div className="extra-item">
                <span className="lbl">Holiday Decor</span>
                <span className="amt">$9.99</span>
              </div>
              <div className="extra-item">
                <span className="lbl">Structural vs. Cosmetic Breakdown</span>
                <span className="amt">$19.99</span>
              </div>
              <div className="extra-item">
                <span className="lbl">
                  Extra Revision
                  <span className="sub">same price as that render&apos;s tier</span>
                </span>
                <span className="amt">varies</span>
              </div>
              <div className="extra-item">
                <span className="lbl">Add Your Logo</span>
                <span className="amt">$29.99</span>
              </div>
            </div>
          </div>

          <div className="badges-row">
            <div className="badge">
              <b>1&ndash;2 Business Days</b>Timing can shift during busy
              periods — we&apos;ll always tell you where you stand.
            </div>
            <div className="badge">
              <b>Not an Actual Photo</b>Every visualization is AI-generated
              and intended to show potential.
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================================
          FAQ
          ====================================================================== */}
      <section id="faq">
        <div className="wrap">
          <div className="center">
            <div className="eyebrow">Questions</div>
            <h2>Frequently Asked</h2>
          </div>

          <div style={{ maxWidth: "700px", margin: "40px auto 0" }}>
            <div className="faq-item">
              <h4>Is this a real photo of my house?</h4>
              <p>
                No. Every visualization is AI-generated and reviewed by our
                team before delivery. It&apos;s a concept, not a photograph.
              </p>
            </div>
            <div className="faq-item">
              <h4>How long does it take?</h4>
              <p>
                Typically 1&ndash;2 business days. During busy periods it may
                take a little longer &mdash; we&apos;ll always tell you where
                you stand in the queue.
              </p>
            </div>
            <div className="faq-item">
              <h4>What if I don&apos;t love the result?</h4>
              <p>
                Every visualization includes one revision. Additional
                revisions are available.
              </p>
            </div>
            <div className="faq-item">
              <h4>What&apos;s the difference between Buildable and Conceptual?</h4>
              <p>
                Buildable styles are realistic renovations your home could
                genuinely support. Conceptual styles are bold reimaginings
                meant to inspire &mdash; not necessarily to build exactly as
                shown. We label every style honestly, whether a curator
                picked it for a Curated render or you picked it yourself for
                a Self-Directed one.
              </p>
            </div>
            <div className="faq-item">
              <h4>What&apos;s the difference between Self-Directed, Curated, and Premium?</h4>
              <p>
                Self-Directed is fully automated: you pick the style
                yourself from our catalog and it&apos;s rendered right away.
                Curated means our team analyzes your home and neighborhood
                and selects up to 6 styles that genuinely fit, per order.
                Premium is a free-text custom request &mdash; describe
                exactly what you want, and we scope and render it for you.
                All three get the same quality review before delivery.
              </p>
            </div>
            <div className="faq-item">
              <h4>How many styles will my curator choose from?</h4>
              <p>
                For a Curated render, our team selects from up to 6 styles
                per order that are matched to your home&apos;s actual
                structure and neighborhood &mdash; not a generic list. You
                can order more than one Curated render if you&apos;d like to
                see additional options.
              </p>
            </div>
            <div className="faq-item">
              <h4>Do you serve my area?</h4>
              <p>
                We serve homeowners, agents, and contractors across the
                continental United States.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======================================================================
          FINAL CTA
          ====================================================================== */}
      <section className="final-cta">
        <div className="wrap">
          <h2>See Your Home&apos;s Potential</h2>
          <p>Start your order, or message us directly on Facebook with any questions first.</p>
          <div className="btn-row center" style={{ justifyContent: "center" }}>
            {/* Not linked to /start yet */}
            <a href="#" className="btn btn-gold">
              Order Now
            </a>
            <a
              href="https://www.facebook.com/RealPotentialVisuals"
              className="btn btn-outline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Message Us
            </a>
          </div>
        </div>
      </section>

      {/* ======================================================================
          FOOTER
          ====================================================================== */}
      <footer>
        <div className="wrap">
          <img src="/images/logo.png" alt="RealPotential Visuals" />
          <div className="tagline">Human Curated. AI-Powered.</div>
          <div className="loc">Proudly serving the continental United States</div>
          <div className="flinks">
            <a
              href="https://www.facebook.com/RealPotentialVisuals"
              target="_blank"
              rel="noopener noreferrer"
            >
              Facebook
            </a>
            {/* Add links here once these pages exist:
            <a href="/terms">Terms</a>
            <a href="/license">License</a>
            */}
          </div>
          <div className="legal">
            &copy; 2026 RealPotential Visuals. All rights reserved.
            <br />
            Every visualization is AI-generated and human-curated. Not an
            actual photograph.
          </div>
        </div>
      </footer>
    </>
  );
}
