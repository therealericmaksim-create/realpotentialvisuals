import Link from "next/link";

// Shared across every page. Links use "/#section" (not "#section") so they
// correctly jump to the homepage's sections even from a different page like
// /start. Change the Facebook link in TWO places if the contest post URL
// ever changes (here, and in the homepage footer).
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
          <Link href="/#how">How It Works</Link>
          <Link href="/#gallery">Gallery</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#contest">Contest</Link>
          <Link href="/#faq">FAQ</Link>
          <a
            href="https://www.facebook.com/share/p/1Dz3SZUTPi/"
            className="btn btn-gold"
            style={{ padding: "10px 20px", fontSize: "13px" }}
            target="_blank"
            rel="noopener noreferrer"
          >
            Enter the Contest
          </a>
        </div>
      </nav>
    </header>
  );
}
