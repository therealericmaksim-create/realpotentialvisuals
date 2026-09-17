import Link from "next/link";
import HeaderIdentity from "./HeaderIdentity";

// Shared across every page. Links use "/#section" (not "#section") so they
// correctly jump to the homepage's sections even from a different page like
// /start.
export default function SiteHeader() {
  return (
    <header>
      <nav className="nav">
        <Link href="/" className="nav-logo">
          <img src="/images/logo.png" alt="RealPotential Visuals" />
        </Link>

        <input type="checkbox" id="nav-toggle" className="nav-toggle" />
        <label htmlFor="nav-toggle" className="nav-burger">
          &#9776;
        </label>

        <div className="nav-links">
          <Link href="/#gallery">Gallery</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#faq">FAQ</Link>
          {/* Not linked to /start yet — see FINAL CTA note in app/page.tsx */}
          <a
            href="#"
            className="btn btn-gold"
            style={{ padding: "10px 20px", fontSize: "13px" }}
          >
            Order Now
          </a>
          <HeaderIdentity />
        </div>
      </nav>
    </header>
  );
}
