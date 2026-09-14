# Changelog

Every entry here corresponds to a git tag (`v0.1.0`, `v0.2.0`, ...). To see
or restore the exact code at any version: `git checkout v0.1.0`.

## v0.6.0 — 2026-09-14

- Wired up Stripe hosted Checkout. `/start` now hands off to a real
  Checkout Session once availability is confirmed, instead of stopping
  at "Not built yet".
- Order totals are recomputed server-side from the saved order's own
  D1 row before a Checkout Session is created — the client-submitted
  total is never trusted for what gets charged.
- Payment is finalized two independent ways: the Stripe success
  redirect (`/api/checkout/confirm`) and a webhook
  (`/api/stripe/webhook`), so an order still gets marked paid even if
  the customer never makes it back to the site. The webhook needs
  `STRIPE_WEBHOOK_SECRET` set once a webhook endpoint exists in the
  Stripe Dashboard.
- Added success and cancelled screens to the `/start` flow for the
  return trip from Stripe.
- Verified end-to-end against the Stripe test/sandbox account with a
  real test-card payment.

## v0.5.0 — 2026-09-14

- Consolidated the intake flow (photo check, AI disclosure, order check,
  daily intake check) into a single stateful `/start` page — no more
  separate routes or query-param/session state threading.
- Photo upload is now real: `/api/photo-check` validates file type by
  magic bytes (not just extension) and stores accepted photos to R2;
  the Continue button stays disabled until the upload is verified.
- Orders are now persisted for real: `/api/order` writes to the `orders`
  and `order_items` tables in D1 as the customer moves through the
  flow, resolving each picked style against the `styles` table.
- Added `lib/disclosure.ts` as the single source of truth for the
  AI-disclosure copy shown across the flow.
- Promo pricing: Starter is $79.99 (was $99, shown struck through),
  Premium is $69.99 (was $129.99), Holiday Lighting is $29.99 (was
  $39.99).

## v0.4.1 — 2026-09-14

- FAQ section now has an ivory background (was transparent/dark), with
  scoped darker gold/gray text for legibility.
- Our Difference section now has a solid gold background, with dark-ink
  headline/eyebrow; the four differentiator cards are unchanged.

## v0.4.0 — 2026-09-14

- Added `/start`, the order configurator: photo upload, Starter package,
  free-pick additional styles from all 133 (categorized dropdown, with a
  per-style example-image placeholder), Night View/Seasonal Look/Holiday
  Decor extras (with season/holiday sub-choice), Premium custom request
  (350-character limit), logo upload, and a new Structural vs. Cosmetic
  Breakdown add-on ($19.99/render). File-size limits enforced on both
  uploads (15MB photo, 5MB logo), with filesize shown next to the filename.
- Extracted the header into a shared `SiteHeader` component, used on both
  pages, with corrected anchor links.
- Rewrote the homepage's "Our Difference" section into four concrete
  differentiators instead of one paragraph.
- Connected Cloudflare D1 for real: created the production database,
  applied the canonical schema, and loaded the full reference dataset
  (133 styles, 259 design elements, 17,556 style-compatibility pairs) to
  both local and production, verified row-for-row identical.
- All Facebook links now open in a new tab.

## v0.3.0 — 2026-09-14

- Replaced the Believable/Conceptual two-tier "Add a Style" pricing with a
  single flat $39.99 rate. Curated Starter styles keep full upfront
  analysis; a customer-picked add-on style is now revealed as Buildable or
  Conceptual at delivery instead of at selection. FAQ updated accordingly.

## v0.2.4 — 2026-09-14

- Removed the Custom Style ($59.99–$99.99) pricing tier — business decision,
  see project notes. Premium ($129.99) is unaffected.

## v0.2.3 — 2026-09-14

- Wired up Stripe sandbox keys: `STRIPE_SECRET_KEY` as a Worker secret
  (never committed), `STRIPE_PUBLISHABLE_KEY` as a plain public var. No
  checkout code yet — this is just the credential plumbing.

## v0.2.2 — 2026-09-14

- Added `og:url`, `og:site_name`, and explicit `og:image` width/height for
  more reliable Facebook/Messenger link previews.

## v0.2.1 — 2026-09-14

- Fixed the Facebook page link (footer + "Message Us" button) — the page
  was renamed to facebook.com/RealPotentialVisuals.

## v0.2.0 — 2026-09-14

- Ported the legacy static `index.html` prototype into the real Next.js app
  (`app/page.tsx` + `app/globals.css`), replacing the placeholder homepage.
- Fonts switched from a Google Fonts `<link>` to `next/font/google`
  (Poppins + Inter) for better performance.
- Images moved to `public/images/`. Removed the now-superseded `index.html`.

## v0.1.1 — 2026-09-13

- First live deploy: `npm run deploy` (OpenNext build + `wrangler deploy`)
  published the Worker to Cloudflare.
- Attached `realpotentialvisuals.com` and `www.realpotentialvisuals.com` as
  custom domains in `wrangler.jsonc` — site is live at the real domain.

## v0.1.0 — 2026-09-13

- Next.js 15 scaffold (App Router, TypeScript, Tailwind v4), deploying to
  Cloudflare Workers via `@opennextjs/cloudflare`. D1/R2/KV bindings stubbed
  in `wrangler.jsonc`, commented out until real resources exist.
- Legacy static `index.html` marketing prototype added; its images moved
  into `images/` and every reference relinked.
