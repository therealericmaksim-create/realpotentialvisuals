# Changelog

Every entry here corresponds to a git tag (`v0.1.0`, `v0.2.0`, ...). To see
or restore the exact code at any version: `git checkout v0.1.0`.

## v0.26.0 — 2026-09-18

- **Every render now carries the "Human Curated / AI-POWERED / Not a real
  photo" badge, bottom-right, composited deterministically.** It is never
  sent to the image model: asking a generative model to include a logo is
  asking it to redraw one, and it would — mangled letterforms, invented
  crowns, altered wording. The badge is a legal and trust statement, so it
  is stamped pixel-for-pixel from the exact source file
  (`public/images/render-overlay-ai.png`), and the only transformation
  applied is a proportional downscale. No rotation, no recolouring, no
  aspect change.
- New `lib/watermark.ts` implements PNG decode, encode and alpha
  compositing against the spec directly. No dependency was added: Workers
  have no canvas, but they do expose `CompressionStream` /
  `DecompressionStream`, which is the zlib layer PNG needs. Verified
  lossless — decode → encode → decode returns byte-identical pixels — and
  verified in composite: output dimensions unchanged, the rest of the
  image untouched, all three lines of badge text legible.
- Downscaling uses an area-average (box) filter rather than
  nearest-neighbour or bilinear, specifically because the badge is mostly
  small text and the other two alias "Not a real photo" into noise. The
  badge occupies 30% of the render's width with a floor of 260px, so it
  reads the same at any output size.
- **A badge failure blocks delivery rather than passing an unbadged image
  through.** If compositing fails, the generated image is parked under
  `renders-raw/` so the money spent on it is not lost, but it never
  becomes a `renders` row — and a `renders` row is the only thing the
  customer can ever be shown. The operator gets the real reason.

## v0.25.1 — 2026-09-18

- **Opening a render from a queue now focuses that render.** The queues
  became per-render in v0.23.1, but the workspaces behind them are still
  per JOB — so clicking one render opened a page listing every render on
  that job at the same stage. With two renders from one order
  (#CC95B419-1 and #CC95B419-2) the references differ only in the trailing
  digit, so the page read as showing the same render twice. Nothing was
  duplicated; the data was correct throughout. The clicked render is now
  listed first, highlighted, and tagged "the one you opened", and the
  header says plainly how many other renders on that order share the
  stage and are shown below it.

## v0.25.0 — 2026-09-18

- **Revise from a generated image.** Each render in the Production
  workspace now has a box for the one change to make and a "Revise This
  Image" button, which feeds that image back in as the source rather than
  starting again from the customer's photo. It is its own route, not a
  mode of rendering, because the two are genuinely different jobs: a
  revision inherits whatever the previous pass got wrong and drifts a
  little further from the real house each round, so the revision prompt is
  deliberately narrow and restates every hard constraint — the model has
  no memory of the brief that produced the image it is handed. When a
  render is wrong structurally rather than cosmetically, re-rendering from
  the photo is still the right move. Revisions land at pending and
  not-selected like any render, so revising never republishes to the
  customer by itself, and each one records its parent image and the
  instruction given.
- **Style search by description and material.** The 133-style dropdown is
  grouped by family, which only helps a curator who already knows the
  family — it could not answer "which styles suit a brick house", the
  question that arises the moment a customer asks for something the
  building physically cannot take. The curation workspace now has a search
  box covering style descriptions AND typical material palettes, and says
  why each result matched. Searching "brick" surfaces American Foursquare,
  Colonial Georgian and Atomic Ranch on their materials rather than on a
  passing mention in prose. Clicking a result assigns it to that render.

## v0.24.0 — 2026-09-18

- **Prompt template v4, from a second real render.** The render at
  00:49 is confirmed to have used v3 with gpt-image-2 (the new per-render
  instrumentation recorded it), and it still lost one of a duplex-s two
  front doors — the second being partly hidden in the source photo — and
  visibly changed one front window-s dimensions. v3 protected openings in
  a single line inside the geometry section; that was not enough weight
  for the failure mode these models actually have, which is quietly
  SIMPLIFYING a building rather than redesigning it.
- Openings now get their own numbered section that says to COUNT the doors
  and windows first and reproduce those counts exactly, calls out
  duplexes and second entrances hidden behind posts, planting, downpipes
  or shadow, and forbids regularising, aligning or evenly spacing openings
  — because asymmetry is what makes a specific house that house.
- A new section states that partially obscured features are still there
  and must not be deleted, merged or resolved into a tidier arrangement.
  The opening line of the prompt now primes the model to read and count
  before rendering, and names simplification as the most common failure.
- The negative prompt gained the matching failure signatures: merged front
  doors, removed second door, added window, regularised windows, changed
  window proportions, simplified facade.

## v0.23.2 — 2026-09-17

- **Fixed: Render with AI failing in about a second with no image.** The
  output size was computed from the source photo with no MINIMUM, so a
  small upload produced a request like 400x304 — below what the image API
  accepts — and was rejected almost immediately. The long edge is now
  scaled up to at least 1024 before the maximum is applied, which also
  means a paying customer never receives a render smaller than that
  regardless of what they photographed it on. Header-parsed dimensions are
  also sanity-checked (64-20000px) and fall back to a safe default rather
  than being trusted into a nonsense size request. Every case in a
  nine-case check now produces a size that satisfies the API rules:
  divisible by 16, ratio within 1:3-3:1, within 3840x2160, long edge at
  least 1024.
- **Render failures now appear next to the render button**, per render,
  instead of only at the top of the section. Above a long prompt box the
  section-level error was off-screen, so a fast failure looked like the
  button doing nothing at all.
- Rejections from the image model now report what was asked for — model,
  requested size and the source dimensions — not just the response body.
  A size or model rejection is unactionable without them.

## v0.23.1 — 2026-09-17

- **Fixed: the Render with AI button stopped working.** v0.23.0 recorded
  the prompt actually sent, but did that work BEFORE inserting the renders
  row and without a guard. When it threw, the image had already been
  generated, paid for and written to R2 — yet no renders row existed, so
  the image was orphaned and the operator just saw the button fail. The
  order is now: generate, store, insert the renders row, and only then
  record provenance inside a try/catch that cannot fail the request. A
  missing provenance row is a far smaller loss than a lost render. The
  rebuild also now covers only the render being made rather than every
  render on the job.
- **The Curation, QC and Production queues are per-render**, matching the
  All Orders list. A job-level row with a count hid which renders were
  actually waiting and could not show a render reference, address or
  photo — staff had to open the job to find out what was in it. Each row
  now shows its reference (#CC95B419-2), tier, style or custom request,
  address, thumbnail, any QC denial, and how long it has waited.
- The three queues are one shared component instead of three near-copies,
  so a fix lands in all of them rather than two.

## v0.23.0 — 2026-09-17

- **Every render now records the prompt that was actually sent.** The
  render was previously linked to the newest QC-approved prompt, which is
  not necessarily the text that was rendered — the operator can edit the
  box or switch templates — so the audit trail could not answer the one
  question it exists for: what produced this image. Rendering now writes
  its own prompt_generations row containing the literal text used, and the
  render points at that row. The template label is derived server-side by
  comparing the submitted text against the current build and the approved
  row (current version / the approved version / "operator-edited") rather
  than trusted from the client.
- **The template-switch button now confirms itself.** Clicking "Use
  template vN" swapped the textarea contents but gave no visible signal,
  and since the differences sit far down a long prompt it looked like
  nothing had happened. Each prompt box now states what it currently
  holds — a template version, or "your edits" — and says plainly that
  whatever is in the box is what gets sent and recorded.
- **Images open full size in a new tab** when clicked: the uploaded photo
  and generated renders in the admin (order detail and all three
  workspaces), and the photo and delivered renders on the customer order
  page.

## v0.22.2 — 2026-09-17

- **Fixed: the orders list looked like it had lost data.** Making the list
  one row per render, I showed the thumbnail, order id, address and
  customer only on the first row of each order group. The intent was to
  avoid repetition; the effect was that an order-s second render
  (#8029BFFD-2) rendered as a row of blanks, which reads as a broken
  record rather than a tidy one. Worse, filtering by stage could hide the
  one row that carried those details. Every column now repeats on every
  row, and the delete control appears on every row too (still order-scoped
  and still labelled "Delete order") so a filtered view can never leave an
  order with no way to act on it. Only the separator rule between orders
  still depends on grouping.
- Verified the order-to-render linkage is intact end to end: the Curation
  and Production queue queries both still return the property address and
  the uploaded photo key, and the three workspaces show the address and
  photo. No data was lost by the per-render change.

## v0.22.1 — 2026-09-17

- **Production now shows when an approved prompt is out of date.** The
  rule that production renders the prompt QC signed off, rather than
  whatever the catalog says today, is right for accountability — but it
  meant a template improvement could never reach a render that had already
  been approved. A render approved under template v2 kept rendering v2
  text after v3 fixed masonry, hardscape and gutter preservation, which is
  exactly the render that came back wrong. The approved prompt is still
  the default, the current-template rebuild is returned alongside it, and
  when the versions differ the workspace says so and offers a one-click
  switch. What gets rendered is still whatever text is in the box, so the
  audit trail stays honest.

## v0.22.0 — 2026-09-17

**Requires `migrations/0006_order_item_stage.sql` before deploying.** Three
`ALTER TABLE ADD COLUMN`s and one `UPDATE` — no table rebuild, safe to run
statement by statement. The backfill was dry-run as a SELECT against live
production first: it maps the two self_directed renders to `on_hold`, the
unstyled premium render on an in-curation order to `in_curation`, and the
styled curated render on an approved order to `in_production`. All four
correct.

- **Stage vocabulary is now `received → in_curation → in_qc →
  in_production → complete`**, plus `on_hold` for self_directed renders,
  whose path is deliberately deferred and which must not appear in any
  staffed queue. Renamed in the migration itself rather than stacked as a
  second one, since 0006 had not been applied yet.
- **"Accepted as Complete" finishes a render.** Previously nothing moved a
  render out of `in_production` — generating an image left it there
  forever. Each generated image in the Production workspace now has an
  Accept button: it marks that image `selected` + `approved`, unselects any
  earlier iteration for the same style, and moves the render to
  `complete`. This is the ONLY thing that makes an image visible to the
  customer, so generating can never publish by itself.
- **Every render has a human reference: `#E012622F-2`** — the order number
  plus its position within that order — shown in the orders list, order
  detail, and the curation, QC and production workspaces. Computed with
  `ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY rowid)`, verified
  against D1. In the workspaces the numbering is computed across the whole
  order *before* the stage filter is applied, so render 3 stays render 3
  even when it is the only one on screen.
- **The customer now sees per-render progress.** `/orders` shows "5 of 6
  ready" rather than one rolled-up status, and `/order/[id]` lists a card
  per render: the finished picture where it exists, otherwise plain
  language for where it is ("Choosing your style", "Being rendered").
  Internal stage names never reach the customer — `customerStageLabel()`
  translates them.
- "Push to Curator" stays an explicit staff action for curated and
  premium, so a bad photo can be caught before a curator spends time.

## v0.21.0 — 2026-09-17

- **Render output now matches the source photo's shape and near-exact
  size**, replacing the earlier "closest of three presets" compromise.
  `gpt-image-2` and later accept an arbitrary `WIDTHxHEIGHT` (both
  divisible by 16, aspect ratio within 1:3–3:1, max 3840x2160), so the
  size is computed from the customer's own photo instead of chosen from a
  fixed list. The real sample photo (1148x1530) now renders at 1152x1536 —
  same aspect ratio, four pixels off — where before it was forced into
  1536x1024 landscape. Extreme panoramas and very tall images clamp into
  the allowed ratio window rather than being rejected.
- The image model is a System Variable (`RENDER_IMAGE_MODEL`, default
  `gpt-image-2`), since model churn is constant and the choice is a direct
  cost-per-render decision. Older fixed-size models still work — they fall
  back to the nearest-shaped preset rather than the hardcoded landscape.
- **Orders list is now one row per render, not per order.** With stages on
  order_items, an order-level row could only show a rolled-up status that
  hid the real state. Renders on the same order are grouped, with the
  order id, photo and delete control on the first row of each group,
  computed against the filtered list so they survive filtering. Delete
  remains order-level and is labelled "Delete order" — a per-render delete
  removes something the customer paid for and is a separate feature. The
  status filter now filters by render stage, and the "Ready for analysis?"
  column is gone.

- **Re-engineered the render prompt (template v3) after the first real
  render came back wrong** in four ways: the output dimensions changed,
  the driveway/fence/walkways were altered, the gutters and downspouts
  were deleted, and first-storey brick was re-clad in siding. Only the
  first was a code bug; the other three were the prompt failing to forbid
  things. The governing lesson is now written into the template: an image
  model treats anything not explicitly protected as fair game. Protection
  is exhaustive and grouped (framing/output, building geometry, existing
  masonry, building hardware, site and hardscape, landscape and
  surroundings), the may-change list is explicitly closed, and an override
  rule tells the model to DROP a style feature rather than violate a
  constraint — a partially-styled house that matches the photograph beats
  a fully-styled one that changed the property. Masonry gets its own
  section: brick/stone stays brick/stone, per-storey material divisions
  hold, and style materials apply only to already-non-masonry surfaces,
  because re-cladding is a structural-scale renovation, not a restyle.
  The detected-design-elements block no longer tells the model to replace
  what it finds with the style's equivalent — that instruction was
  actively inviting the deletions. Night/seasonal variants now state
  exactly which constraint they override, instead of silently
  contradicting the "same light, same season" rule.
- **Output size now follows the source photo.** Generation hardcoded
  1536x1024 landscape; the sample house photo in this repo is 1148x1530
  PORTRAIT, so a portrait upload was being re-framed into a wide crop
  before the model rendered anything. `readImageDimensions()` parses
  width/height from the JPEG/PNG/WebP header (verified against real files
  by two independent methods) and the closest-aspect supported size is
  chosen. NOTE: gpt-image-1 only emits 1024x1024, 1536x1024 and 1024x1536,
  so an EXACT pixel match with the customer's photo is not achievable at
  this layer — the requested size and the source dimensions are now
  recorded on each render event so the gap stays visible.


**Requires `migrations/0006_order_item_stage.sql` before deploying.** All
four statements are plain `ALTER TABLE ADD COLUMN` / `UPDATE` — no table
rebuild — so it is safe to run statement by statement in the D1 console,
unlike the abandoned CHECK-constraint rebuild.

- **Workflow state moved from the order to the individual render**
  (`order_items.stage`). An order is a basket: its renders do not move
  through the pipeline together, and QC denying one must not drag the
  others backwards. `orders.status` could not express that, and every
  queue keyed off it was wrong for any order with more than one render.
  Stages: `new`, `awaiting_curation`, `awaiting_qc`, `in_production`,
  `complete`, `on_hold`.
- **No CHECK constraint on `stage`, on purpose.** SQLite cannot alter a
  CHECK in place, and the rebuild required to change one fails against D1
  — proven earlier today, when it rolled the whole database back. A CHECK
  here would freeze the pipeline vocabulary permanently. The allowed
  values live in `lib/orderStage.ts` and are enforced in application code.
- **QC can now deny a single render back to curation, with a reason.**
  Denial clears that render's style, which is what returns it to the
  Curation Queue — that queue selects on stage alone, so no extra
  bookkeeping was needed. The rejected style and the reason are kept and
  shown to the curator above the style picker, and on the order page, so
  nobody has to guess what was turned down or why. A reason is mandatory.
- **Approve is per render too**, one at a time rather than a single
  job-wide button: a bulk control would quietly push through renders the
  reviewer never actually looked at. Approving records the final prompt
  and moves that render alone to production.
- All three queues (Curation, QC, Production) and their dashboard counts
  now select on `order_items.stage`. Each workspace loads only the renders
  at its own stage, so a curator never sees renders QC already cleared and
  production never sees renders still being curated.
- `orders.status` is now a rollup derived from its renders' stages
  (`rollupOrderStatus`), recomputed after every stage change so the Orders
  list can never disagree with the queues. It only ever produces values
  already in its CHECK constraint, which cannot be changed.
- "Push to Curator" now only moves renders still sitting at `new`, and
  says how many. It can no longer drag a render backwards out of a later
  stage.
- The order page lists every render with its own stage and any QC denial.
- Removed the `send-to-qc` recovery route and button added in v0.19.0 —
  per-render stages make the stranded state it existed to fix unreachable,
  since assigning a style advances that render immediately.

## v0.20.0 — 2026-09-17

- **Built the Production Queue and Production workspace** (`GET
  /api/admin/production`, `GET /api/admin/production/[jobId]`, `POST
  /api/admin/production/[jobId]/render`). The queue lists orders QC has
  approved; opening one gives the same evidence panel as the QC workspace
  plus, per ordered render, the instruction and a **Render with AI**
  button.
- **Rendering actually generates an image now.** `lib/renderGeneration.ts`
  calls OpenAI's image EDIT endpoint with the customer's own photo as the
  input image, not text-to-image: the promise is "your actual house,
  restyled", and a text-only generation cannot keep it no matter how
  detailed the prompt. The result is written to R2 under `renders/` and
  recorded in the `renders` table with an iteration number, the staff
  member as designer, and a link to the prompt_generations row it came
  from.
- New renders land at `qc_status='pending'` and `selected=0`. The customer
  order page only ever shows approved+selected renders, so generating can
  never accidentally publish a bad image to the person who paid for it.
- Production prefers the prompt QC approved (newest `prompt_generations`
  row for that style) over a fresh rebuild, the opposite of the QC
  workspace. QC reviews the current best instruction; production has to
  render what was actually signed off. The UI says which one it is using.
- Extracted `lib/jobWorkspace.ts` — the QC and Production workspaces load
  identical property evidence, and each stage re-checks the previous one's
  work, which only means something if both see the same information.
- Admin nav: **Production Queue** added (Production group, with a badge
  and dashboard stat card); *Material Selections* and *Render Iterations*
  removed.
- **The post-QC status is now displayed as "In Production" everywhere**,
  in the admin and on customer pages, via `orderStatusLabel()`. The stored
  value stays `in_progress`. Renaming it to `in_production` was attempted
  and abandoned: SQLite cannot alter a CHECK constraint in place, and the
  orders-table rebuild that requires failed against D1 — its
  `defer_foreign_keys` resets between statements, so dropping the
  referenced `orders` table violated `order_items`/`payments`. D1 rolled
  back cleanly with no data lost. Since no row had ever carried the value,
  the rename bought nothing but risk. Admin screens that previously
  printed raw status strings now go through the same label map.

## v0.19.0 — 2026-09-17

- **New customer order history at `/orders`** — Google sign-in gated, 25
  per page, newest first, each row showing the order number, street
  address and the original uploaded photo as a thumbnail. Clicking a row
  opens `/order/[id]` with the order detail, the original photo, what was
  ordered, and the delivered renders. The renders section is intentionally
  wired up now and simply renders an "not ready yet" state, since nothing
  writes `renders` rows until the image-upload step exists.
- **New `/api/customer/media/[...key]`** — unlike the staff media route
  (which serves any key to any signed-in staff member), this refuses to
  serve a key that isn't reachable from an order the requester owns.
  Without that check any signed-in customer who saw another customer's
  photo key could fetch their house photo. "Not yours" and "doesn't
  exist" return the same 404 so the endpoint can't be used to probe which
  keys are real.
- Ownership throughout (`lib/currentCustomer.ts`) matches on the Google
  account id captured at order time, falling back to the session's
  verified email so orders placed before customer sign-in existed are
  still visible to whoever actually placed them. Safe because sign-in
  rejects any Google account whose email isn't verified.
- The signed-in name in the header now links to `/orders`.
- **Added a "Send to QC" recovery button** on the admin order page, shown
  when an order is still `in_curation` with every curated/premium render
  already styled. An order curated before v0.18.0's auto-advance existed
  is otherwise unreachable: it drops out of the Curation Queue (which only
  lists jobs with UNASSIGNED renders), so its workspace can't be opened to
  re-save, and nothing else could move it. Found this the hard way on a
  real order.

## v0.18.1 — 2026-09-17

- Moved the customer's signed-in identity out of the `/start` page body
  and into the site header, to the right of Order Now, as
  `Name - LOGOUT`. New `components/HeaderIdentity.tsx` (client) renders
  nothing at all when signed out, so the header is unchanged for the many
  visitors who never sign in. Signing out reloads the page rather than
  just clearing local state, since `/start` reads the session on mount
  and has to fall back to its sign-in gate.

## v0.18.0 — 2026-09-17

- **Premium renders now go through curation**, alongside curated. Premium
  customers never pick a style either — they write a free-text request —
  so a human has to choose the catalog style that request gets built
  from. Every curated-only gate became `tier IN ('curated','premium')`:
  the Curation Queue, the dashboard's Awaiting Curation count, the
  server-side "is there anything to push" guard, the curation workspace's
  slot list, and the assignment `UPDATE`. The workspace now shows the
  customer's own written request above the style picker for premium
  slots, and `lib/analysis/orchestrator.ts` runs the AI vote/consensus
  steps for premium too — previously a premium-only order got no ranked
  shortlist even after analysis, leaving the curator with nothing.
  Self-directed still skips curation entirely (that customer picked their
  own style at checkout) and is deliberately deferred work.
- **Fixed: finishing curation left an order stranded.** Saving style
  assignments wrote the styles but never changed the order's status, so
  it stayed at `in_curation` — which dropped it out of the Curation Queue
  (that query requires an *unassigned* item) while putting it in no other
  queue. A fully-curated order silently disappeared from the admin. An
  order with no curated/premium render left unassigned now advances to
  `in_qc` and logs a `sent_to_qc` event.
- **Built the QC Queue and QC workspace** (`GET /api/admin/qc`, `GET|POST
  /api/admin/qc/[jobId]`). The queue lists orders at `in_qc` with a
  "Check Now" button. The workspace shows the same evidence panel the
  curator saw — structure, regulatory, neighborhood read, AI-ranked
  shortlist — because QC's job is re-checking the curator's call, which
  is only meaningful against identical information; that panel is now a
  shared `PropertyContextBlocks` component rather than two copies that
  could drift. Below it: the curator's selections, then the assembled
  render instruction per render. Approving records the final text in
  `prompt_generations` and moves the order to `in_progress`.
- **New `lib/renderPrompt.ts` assembles the render instruction** from the
  catalog the Python pipeline already seeded — a deterministic template
  fill, not an AI call, since renders are produced by hand in Midjourney.
  It is built around a hard structure/style split, because the product
  promise is "your actual house, restyled": every measured structural
  fact (massing, storey count, roof form and pitch, symmetry, window-to-
  wall ratio, foundation visibility, chimney, facade width) is stated as
  must-not-change along with camera position and surroundings, while the
  style's own `style_materials_typical` (primary/accent/trim) and
  `style_design_elements` (required/optional) drive what may change. It
  also lists the design elements detected on this specific house, telling
  the model to replace conflicts rather than leave a mix, and folds in
  premium custom text and night/seasonal/holiday extras. Ships with a
  negative prompt covering the real failure modes (redesigned house,
  moved openings, changed roof pitch, different camera angle).
  Prompts are rebuilt from the catalog on every load — a stale saved
  prompt is worse than none — and the reviewer can edit before approving.
- **Fixed: the dashboard's Awaiting QC count could never be non-zero.**
  It counted `renders WHERE qc_status = 'pending'`, but nothing creates
  `renders` rows until an operator generates images by hand, so it read 0
  forever while QC work piled up unseen. It now counts orders at `in_qc`,
  matching the queue's own definition — the same bug class as the old
  Awaiting Curation count.
- Added a logout menu to the admin header: clicking the staff badge opens
  a dropdown with **Log out**, pointing at `/cdn-cgi/access/logout` (a
  path Cloudflare intercepts at the edge) to clear the Access session.
  Previously there was no way to sign out of the admin at all short of
  clearing cookies.
- Homepage copy fix: two places claimed every tier receives the same full
  quality review. Only Curated and Premium do — Self-Directed is
  automated end to end, so the claim was untrue as written.

## v0.17.0 — 2026-09-17

- `/start` now requires signing in with Google before anything can be
  submitted — a direct OAuth 2.0 authorization-code flow (no framework;
  reuses `jose`, already a dependency, in the same JWT-verification
  shape already used for staff Cloudflare Access auth). This captures a
  verified, real email address for every order from the very first step
  — including abandoned sessions that never reach payment — rather than
  only ever getting an email at Stripe checkout. New routes: `GET
  /api/auth/google/start`, `GET /api/auth/google/callback`, `GET
  /api/auth/me`, `POST /api/auth/logout`. New config keys (System
  Variables): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
  `CUSTOMER_SESSION_SECRET`.
- The verified session is the actual security boundary, not just a UI
  gate: `POST /api/order` independently verifies the session cookie
  server-side and rejects order creation with no valid session,
  regardless of what the client claims.
- `orders` gained a `customer_google_account_id` column
  (`migrations/0005`, additive) capturing the customer's real Google
  identity at order-creation time. `ensurePropertyLinkage()` uses it
  directly when present, falling back to the existing `guest:<email>`
  synthesis for admin Manual Orders (which have no real session behind
  them) — so `clients.google_account_id` is now a REAL, stable identity
  for every self-serve order instead of a string built from whatever
  email Stripe happened to report.
- Added `/privacypolicy` and `/tos` pages and a shared `SiteFooter`
  linking to both from every public page (homepage, `/start`, and the
  legal pages themselves) — required for the Google OAuth consent screen
  and, more importantly, actually true statements about what the app
  does with a customer's Google-sourced data (explicit scope-by-scope
  disclosure, the required Limited Use compliance statement, and
  instructions for revoking access from the customer's own Google
  Account).
- Verified end-to-end against production without needing real Google
  credentials yet at the time: signed a test session JWT with the same
  library/logic as the real code, confirmed `/api/auth/me` and `POST
  /api/order`'s auth gate both behave correctly (401 with no session,
  200 with a valid one, correct `customer_email`/
  `customer_google_account_id` stored on the resulting order). Once real
  Google OAuth credentials were available, wired them into System
  Variables — the actual browser redirect handshake needs the live
  domain to test (the registered redirect URI doesn't match localhost),
  so that final leg is verified on production directly.

## v0.16.0 — 2026-09-17

- Pricing is now admin-configurable with no deploy. All six values
  (Self-Directed / Curated / Premium render prices, the flat Extra
  price, Structural vs. Cosmetic Breakdown price, Add Logo price)
  joined System Variables as regular config keys — same DB-override-
  with-fallback-default pattern as the API keys already there, just
  with the fallback being the hardcoded constant in `lib/pricing.ts`
  instead of a Worker env var. Numeric keys (including the pre-existing
  Daily Intake Cap) now render as a proper `$`-stepped number input
  instead of plain text.
- New public endpoint `GET /api/config/pricing` (unauthenticated, same
  pattern as the Maps key endpoint) serves the current effective
  pricing. The homepage now reads it directly server-side (converted to
  an async Server Component with `force-dynamic`, since pricing can
  change without a rebuild) and `/start` fetches it client-side with the
  hardcoded values as an immediate fallback — no more hardcoded price
  strings anywhere customers see them.
- Every place a price actually gets CHARGED or RECORDED — order creation
  (`lib/orders.ts`), and Stripe Checkout session creation
  (`/api/checkout`) — independently re-resolves current pricing
  server-side; nothing client-displayed is ever trusted for what's
  actually billed. `lib/orderPricing.ts`'s line-item functions now take
  the resolved pricing as a parameter instead of importing the static
  constants directly.
- Also fixed: the admin Manual Order form had a few extras/breakdown/logo
  prices hardcoded as bare numeric literals (`9.99`, `19.99`, `29.99`)
  instead of referencing any constant at all — now resolves live pricing
  the same way as everywhere else.
- Verified end-to-end against production: overrode the Self-Directed
  price via System Variables, confirmed it appeared correctly on the
  homepage, on `/start`, in a newly created order's stored total, in its
  `order_items.unit_price_cents`, and in the real Stripe Checkout
  session's charged amount — then reverted the override and confirmed
  everything fell back to the hardcoded default cleanly.

## v0.15.1 — 2026-09-17

- Fixed "Awaiting Analysis" on the dashboard: it now simply counts orders
  with `status = 'placed'` (what that status realistically means) instead
  of a structure-profile-existence derivation that required job/property
  linkage to already exist and didn't check order status at all — it kept
  counting orders long after they'd moved past `placed`.
- Fixed real staleness in the admin: navigating to a menu item (or
  re-selecting the one already open) now always triggers a fresh data
  load for that screen, instead of relying on incidental remounts. The
  Dashboard specifically was stuck showing whatever numbers were current
  when the admin was first opened, since its data lived in the parent
  component and only fetched once ever.
- Fixed a real UX trap in "Push to Curator": pushing an order with no
  unassigned curated-tier renders silently flipped its status with zero
  visible effect (it could never show up in the Curation Queue, which
  only surfaces exactly that condition) — this is what made it look like
  the queue was broken when an order really had been pushed. The button
  is now hidden when there's nothing to curate on that order, and the
  endpoint itself rejects the attempt with a clear reason as defense in
  depth.

## v0.15.0 — 2026-09-17

- Curation no longer requires analysis to have run. Fixed a real bug in
  the Job Curation Workspace where the entire style-assignment section
  was hidden whenever a job had no structure analysis yet, even though
  assigning a style never actually depended on it — the picker already
  falls back to the full 133-style catalog with no AI ranking involved.
  The "no analysis yet" message is now informational, not a block.
- Replaced the abandoned `'analyzed'` status-rename approach (see
  v0.14.1 — required a blocked schema migration) with a much simpler
  fix that needed no schema change at all: a new **"Push to Curator"**
  button on the order detail page, visible whenever an order's status is
  `placed` or `analyzing`. Clicking it sets `orders.status =
  'in_curation'` — an explicit staff decision, and the actual (and only)
  thing the Curation Queue now gates on. New endpoint: `POST
  /api/admin/orders/[id]/push-to-curator`. This also means a job can be
  pushed to curation with zero AI spend if a curator is confident enough
  to skip analysis entirely.
  `POST /api/admin/orders/[id]/run-analysis` now sets `orders.status =
  'analyzing'` on completion (a label, not a gate) — reusing the enum
  value that already existed rather than renaming it, so no schema
  change was needed for this either.
- Curation Queue and the dashboard's "Awaiting Curation" badge both now
  key off `orders.status = 'in_curation'` instead of structure-profile
  existence.

## v0.14.1 — 2026-09-17

- Admin: Curation Queue rows now show a photo thumbnail (matching All
  Orders) and an explicit "Curate Now" button per row, alongside the
  existing click-to-open behavior.
- Prepared (not yet applied to production): `migrations/0004_orders_
  status_analyzed.sql`, renaming the unused `orders.status` enum value
  `'analyzing'` to `'analyzed'`, set once Run Analysis actually completes
  and used to gate the Curation Queue precisely (this order's own
  analysis is done, not just "some order on this property was analyzed
  once"). Requires a full table rebuild since SQLite has no `ALTER
  COLUMN` for a CHECK constraint — blocked from automatic execution by
  Claude Code's own safety classifier for a table holding real customer
  data, even via a plain rename with zero data touched. Needs a human to
  run it (`wrangler d1 execute` or the D1 dashboard console) or a
  permission grant. The code that depends on it (writing `'analyzed'` in
  `run-analysis`, gating the queue/dashboard badge on it) is written but
  deliberately held back — confirmed directly that shipping it early
  would 500 every single analysis run (`SQLITE_CONSTRAINT_CHECK`) while
  leaving the actual Phase 2 analysis data intact (fails soft, no
  corruption, just the status write itself fails).

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
