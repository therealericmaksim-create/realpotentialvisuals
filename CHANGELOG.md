# Changelog

Every entry here corresponds to a git tag (`v0.1.0`, `v0.2.0`, ...). To see
or restore the exact code at any version: `git checkout v0.1.0`.

## v0.14.0 — 2026-09-17

- Admin: built out the Curation Queue and Job Curation Workspace — the
  screen that turns Phase 2's analysis into an actual style assignment
  for every curated-tier render. Curation Queue lists jobs with at least
  one unassigned curated slot (oldest first); clicking one opens the
  workspace, which surfaces the photo, retained Street View, structure
  read, regulatory findings, neighborhood context, the AI curation
  ranking + reasoning (v0.13.0), and one style picker per unassigned
  slot. Saving writes directly to `order_items.style_id`/`style_name`
  and logs the change to the `events` audit table — no new schema needed,
  since the old `curations` table (designed for the pre-v0.10.0 fixed
  "Starter Package" bundle model) is dead and was left untouched rather
  than migrated. New endpoints: `GET /api/admin/curation` (queue),
  `GET`/`POST /api/admin/curation/[jobId]` (workspace + assignment
  submit). Also fixed the dashboard's "Awaiting Curation" count, which
  was silently keyed off that same dead `curations` table and had been
  overcounting since the pricing rewrite (it now correctly counts jobs
  with an unassigned curated-tier render, matching the queue's own
  definition). No separate nav entry for the workspace — reached only by
  clicking a job in the queue, same pattern as Orders → Order Detail.
- Admin: All Orders gained a "Show only:" status filter next to the
  existing search box, listing every value the `orders.status` column's
  own CHECK constraint allows.

## v0.13.0 — 2026-09-17

- Admin: All Orders now shows a 44px thumbnail of the uploaded property
  photo next to every row (`/api/admin/media/[...key]` passthrough,
  already used elsewhere for full-size photos).
- Fixed a real privacy issue on `/start`: the post-payment "You're All
  Set!" screen (which shows the real order number) could be re-triggered
  by reloading the page or hitting the browser's back/forward button,
  since it was driven entirely by `?checkout=success&order=...&session_id=...`
  staying in the URL. Fixed two ways — the URL is now scrubbed
  (`router.replace`) the instant those params are consumed, so a plain
  reload or a `back` navigation can no longer land on an address bar that
  still carries them; and a `pageshow` listener forces a hard reload on
  any bfcache restore (a back/forward navigation the browser serves from
  memory with no URL or state change at all), which lands on the by-then
  clean URL — the blank form, same as a first visit.
- Phase 2 analysis: added a new curator-assist step (19) for curated-tier
  orders. Given the neighborhood-read description and the algorithm's own
  top 8 style candidates (the same set already shown as "Top matches"),
  an AI call re-ranks its top 6 with one sentence of reasoning each —
  mirroring a manual ChatGPT workflow the business was already doing by
  hand, so the curator has a real starting point instead of reading raw
  scores cold. New table `curbappeal_structure_profile_curation_ranks`
  (`migrations/0003_curation_ranks.sql`). This is purely advisory — it
  never feeds back into the existing 2-voter blend/consensus (steps
  18/20). Verified end-to-end against a real production photo: the AI
  correctly dropped 2 of the 8 raw candidates and re-ordered by genuine
  contextual fit rather than echoing the algorithm's own score order.
- Admin order detail: reordered the analysis sections to Structure
  (with Consensus), Regulatory, Neighborhood read, Top matches (now
  showing the AI curation ranking + reasoning when available, falling
  back to the plain algorithm list otherwise).

## v0.12.0 — 2026-09-16

- System Variables: every API key and operational knob (`OPENAI_API_KEY`,
  `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `RESEND_API_KEY`, `GOOGLE_MAPS_API_KEY`, `DAILY_INTAKE_CAP`) now resolves
  through a new `config` D1 table first, falling back to the existing
  Worker env var/secret (`lib/systemConfig.ts`). A principal can rotate
  any of them from the new Settings → System Variables admin page with no
  deploy; every call site across checkout, the Stripe webhook, photo-check,
  the Maps key endpoint, staff invites, and the Phase 2 orchestrator was
  audited and switched over. `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` are
  deliberately excluded — those gate admin login itself, so a bad DB value
  for either could lock everyone out with no way back in except direct D1
  access. Phase 2 analysis now throws a clear, specific error instead of
  a vague failure if `OPENAI_API_KEY` isn't configured anywhere. Every
  System Variables change (set or revert) is also logged to the schema's
  pre-existing, previously-unused `events` table (`entity_type = 'config'`)
  with the old and new value — a bad key rotation can be recovered by
  querying `events` directly in D1, with no dependency on the admin UI
  itself still working.
- Removed the placeholder "Pricing & Packages" and "Daily Intake Cap"
  Settings pages — pricing lives in code (`lib/pricing.ts`) with coupons
  planned for future discounting instead of packages, and the intake cap
  is now just one of the System Variables.
- Admin: built out the Manual Order form (Orders → Manual Order),
  replicating the public `/start` intake — customer email, address, HOA
  and historic-district answers, photo upload, logo flag, and up to 6
  render items per tier (self-directed style picker, curated, premium
  free-text) with the same night/seasonal/holiday/breakdown extras and
  live total. Deliberately skips the Gate 0/1 AI photo check (staff are
  already looking at the photo) and skips Stripe entirely — the order
  saves straight to `status = 'placed'` with the customer's email and
  property linkage already in place, ready for "Run Analysis" the moment
  it's created. New endpoints: `POST /api/admin/photo-upload` and
  `POST /api/admin/orders/manual`. The order-creation logic itself was
  extracted into a shared `lib/orders.ts` so the public intake and this
  form can never drift apart on schema or pricing.

## v0.11.0 — 2026-09-15

- Favicon: the RealPotential crown mark (`app/icon.png`).
- Homepage messaging refresh: removed the "How RealPotential Works"
  01-04 section and the entire Facebook contest section (retiring that
  promotional funnel, not just rewording it). Replaced "The Mark"
  section with the real AI-disclosure overlay image every delivered
  render carries, plus copy explaining its dual purpose (quality
  signature + honest AI-disclosure label). Pricing section renamed
  "Simple Pricing and Process" / "Services & Addons"; each tier now
  pairs with its own "How It Works" box, and the extras grid got a real
  card layout. Removed the redundant "Human Curated" badge and the
  FAQ's stale "Starter styles" wording; added two FAQs on the tier
  system and curator style count. "Enter the Contest" replaced with an
  unlinked "Order Now" button in the header and final CTA (intentionally
  not wired to `/start` yet).
- Admin: added a "Manual Order" placeholder under Orders; the staff
  badge now shows the signed-in user's real Google profile photo when
  available (via Cloudflare Access's identity endpoint), falling back
  to initials.
- Renamed every table/column specific to the current front-exterior
  "curb appeal" analysis pipeline with a `curbappeal_` prefix —
  `curbappeal_structure_profiles`, `curbappeal_property_structure_
  analysis`, `curbappeal_structure_profile_design_elements`,
  `curbappeal_property_neighborhood_reads`, `curbappeal_property_
  regulatory_lookups`, `curbappeal_profile_style_compatibility`,
  `curbappeal_structure_profile_style_votes`, `curbappeal_structure_
  profile_consensus`, `curbappeal_job_style_candidates`,
  `curbappeal_profile_style_candidates`, `curbappeal_profile_cache_
  refresh_log`, and `orders.curbappeal_photo_key` — so future
  `exterior_`/`interior_` order types can have their own parallel
  tables without name collisions. Shared reference/catalog tables
  (styles, materials, design_elements, climate_zones, etc.) were
  deliberately left generic. Applied to production as a pure rename
  (`migrations/0002_curbappeal_rename.sql`, no data loss) and verified
  by running the real Phase 2 pipeline against the renamed tables
  end-to-end before cleaning up the test run.

## v0.10.0 — 2026-09-15

- Replaced the fixed $79.99 Starter Package + a la carte additional-style
  pricing with pure per-render pricing across three tiers: Self-Directed
  ($29.99, customer picks the style, fully automated), Curated ($44.99,
  team picks the style once analysis is done), Premium ($59.99, free-text
  custom request). Customers upload one photo and choose any quantity of
  renders per tier. Night/Seasonal/Holiday add-ons are now a flat $9.99
  per render regardless of tier; extra revisions are priced at the
  render's own tier rate.
- `order_items` gained `tier` and `custom_text` columns
  (`migrations/0001_pricing_v2.sql`) to support the new model.
- Phase 2's AI-vote and consensus steps (18, 20) now only run when an
  order has at least one Curated-tier render — Self-Directed already has
  its style and Premium isn't matched against the catalog, so there's
  nothing to vote on. Saves an AI call on orders that don't need it.
- Verified end-to-end against production: a real order mixing all three
  tiers plus every add-on produced a real Stripe Checkout Session whose
  line items and $204.93 total were confirmed via the Stripe API.
- Homepage pricing section rewritten to match. The active Facebook
  contest's prize copy was deliberately left as-is (an already-published
  external commitment).

## v0.9.0 — 2026-09-15

- Rebuilt the admin backend as a single-page interactive shell, porting
  a design pass done in a separate Claude project
  (`realpotential-admin-template.html`) into the real app: one route
  (`/admin`) renders a client component that owns all navigation and
  section state, fetching each section's data from a new `/api/admin/*`
  route only when that section is opened, instead of a separate
  server-rendered page per screen.
- Orders (list, detail, Run Analysis) and Staff & Roles are fully wired
  to real data on the new shell; every other nav item — Curation,
  Production, Quality Control, Requests & Escalations, Finance,
  Contests, Catalog, Settings, Reports & Audit — renders as an explicit
  "not built yet" placeholder instead of a dead link, so the full
  roadmap (`docs/admin-navigation-ia.md`) is visible in the nav today.
- Added a staff-gated R2 media passthrough (`/api/admin/media/[...key]`)
  so the admin can display the uploaded property photo and the retained
  Street View image on an order's detail view — the old page never
  surfaced either.
- Fixed a real bug found while verifying Phase 2 against production
  data end-to-end for the first time (including Street View, previously
  blocked by the Google Maps key issues): a Stripe webhook racing the
  checkout success-redirect could permanently strand a paid order with
  no property/job linkage, invisibly, if the webhook's event snapshot
  had `customer_details.email` still null. Both `/api/checkout/confirm`
  and `/api/stripe/webhook` now backfill a still-missing email from
  their own fresh data even when payment is already marked succeeded.
- `/start` address autocomplete fixed — `loading=async` was resolving
  before `google.maps.places` actually finished loading, so the widget
  silently never attached; switched to the classic `callback=` param.
- `RESEND_API_KEY` set — order-confirmation emails are live once
  Resend finishes verifying the sending domain.

## v0.8.0 — 2026-09-14

- Real admin backend auth: Cloudflare Access (Google login) handles
  authentication, the existing `staff`/`roles`/`staff_roles` tables
  handle authorization. A principal-only `/staff` page manages who's
  on staff and what tier they have — no more Cloudflare dashboard
  trips to change access.
- Automation Routing Sheet Phase 2 (Analysis & Matching, steps 9-20)
  is fully built and wired: real AI vision for structure analysis and
  design-element detection, a retained Street View neighborhood read,
  a web-search-backed regulatory lookup with cited sources, the ported
  133-style matching/feasibility/difficulty engine, and a 2-voter
  (AI/algorithm) consensus blend. Triggered by a staff "Run Analysis"
  button per order — nothing runs automatically on payment except the
  free property/job linkage setup.
- New `zip_climate_zones` table (39,474 US ZIPs) resolves a property's
  climate zone from its address.
- Verified end-to-end against a real order and a real photo — full
  prompt/response/cost documentation in
  `docs/phase2-analysis-cost-report.md`. Real cost for the entire
  pipeline on one order: about 1.3 cents.

## v0.7.0 — 2026-09-14

- Property address, HOA, and historic-district questions added to
  `/start` and stored on the order (Automation Routing Sheet Phase 1
  step 1).
- Gate 0/1: an OpenAI vision call screens each photo upload for
  "is this a structure" and "is it residential" (steps 3-4), plus a
  basic quality read. Fails open without `OPENAI_API_KEY` — skipped,
  never blocking.
- Daily intake cap (step 6): an atomic D1 reservation so concurrent
  orders can't oversell the day. Reaching the cap changes the message,
  not whether checkout proceeds.
- Order confirmation email (step 8) via Resend, fired once payment is
  verified. Fails open without `RESEND_API_KEY`.
- Selecting a style in "Add Your Own Style" now shows its full
  architectural description (fetched on demand) instead of an image
  placeholder — all 133 styles now have one.
- Reuploaded resized images in `public/images/`.

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
