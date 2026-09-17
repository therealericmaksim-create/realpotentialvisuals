import Link from "next/link";

// Shared across every public page — homepage, /start, and the legal
// pages themselves.
export default function SiteFooter() {
  return (
    <footer>
      <div className="wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
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
          <Link href="/privacypolicy">Privacy Policy</Link>
          <Link href="/tos">Terms of Service</Link>
        </div>
        <div className="legal">
          &copy; 2026 RealPotential Visuals. All rights reserved.
          <br />
          Every visualization is AI-generated and human-curated. Not an
          actual photograph.
        </div>
      </div>
    </footer>
  );
}
