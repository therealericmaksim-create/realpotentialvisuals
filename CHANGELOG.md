# Changelog

Every entry here corresponds to a git tag (`v0.1.0`, `v0.2.0`, ...). To see
or restore the exact code at any version: `git checkout v0.1.0`.

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
