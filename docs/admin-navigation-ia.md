# Admin Navigation — Information Architecture

Purpose: a complete map of every admin menu item and sub-item this business
needs, grounded in the actual D1 schema (`realpotential-schema.sql`) and the
Automation Routing Sheet phases — not aspirational, not invented. Meant to be
handed to a design-focused conversation to produce a creative header/nav;
this document is the content spec that design works from.

Status tags: **[Built]** live now · **[Partial]** exists but incomplete ·
**[Planned]** no code yet. Role tags use the schema's 12-role vocabulary
(`roles.name`), grouped into the 6 real org branches
(`roles.branch`: executive / operations / marketing / engineering / finance
/ legal).

Current state: the only nav that exists today is a bare top bar (site link +
signed-in staff name/roles) in `app/admin/layout.tsx` — no menu, no grouping,
nothing collapsible. Everything below is candidate content for that header.

---

## 1. Dashboard — `/admin`

**[Partial]** — shows a raw order count and the single most recent order.
Needs to become a real at-a-glance queue view.

- Orders awaiting analysis (paid, no Phase 2 run yet)
- Jobs awaiting curation
- Renders awaiting QC
- Open custom/premium requests
- Open escalations
- Today's intake count vs. `DAILY_INTAKE_CAP`

Role: everyone lands here first (**executive**/**operations** mostly care).

---

## 2. Orders — `/admin/orders`

**[Built]** — list + detail page (`/admin/orders/[id]`), "Run Analysis"
button, shows Phase 2 results (structure profile, design elements,
neighborhood read, regulatory lookup, top style matches, AI/algorithm
consensus).

Sub-items:
- All Orders (list) **[Built]**
- Order Detail **[Built]** — photo, property Q&A answers, Phase 2 results,
  Run Analysis action
- *(Planned)* Filter/search by status (`orders.status`: started, verified,
  queued, placed, analyzing, in_curation, awaiting_selection, in_progress,
  in_qc, complete, cancelled, refunded, error)

Backing tables: `orders`, `order_items`, `payments`.
Role: **router**, **client_liaison**, **principal**.

---

> **Pipeline state lives on `order_items.stage`, not `orders.status`.**
> Every queue below selects on that column. Renders move independently —
> QC can send one back to the curator while another is already rendering —
> so `orders.status` is only a rollup kept for the Orders list. Stages:
> `new`, `awaiting_curation`, `awaiting_qc`, `in_production`, `complete`,
> `on_hold` (where self_directed sits, that path being deferred).
> See `lib/orderStage.ts` and `migrations/0006`.

## 3. Curation — *(Planned — the core differentiator, most urgent)*

The screen the business is actually about. Without it, "human curated" is
just homepage copy.

- **Curation Queue** *(built)* — jobs with at least one render at
  `stage = 'awaiting_curation'`, oldest first. Renders arrive here from
  "Push to Curator" on the order page, or by being denied in QC. This is
  the only nav entry for this section — the workspace below is a detail
  view reached by clicking a job in this queue, same pattern as
  Orders → Order Detail, never a standalone nav destination.
- **Job Curation Workspace** (`/admin/job/{id}`) — the main screen:
  - Original photo + retained Street View frame (`curbappeal_property_neighborhood_reads`)
  - Structure analysis read (`curbappeal_property_structure_analysis`)
  - Design elements detected (`curbappeal_structure_profile_design_elements`)
  - Regulatory findings with sources (`curbappeal_property_regulatory_lookups`)
  - Scored candidate styles, Buildable/Conceptual tagged
    (`curbappeal_profile_style_compatibility`, `curbappeal_job_style_candidates`)
  - AI/algorithm consensus (`curbappeal_structure_profile_consensus`)
  - Build the curated 12 + pick the 3 included in Starter
    (`curations.twelve_style_ids`, `curations.included_style_ids`)
  - Submit → authorize flow (`curations.status`: submitted → authorized /
    edited / rejected; `curations.auto_approved`)

Backing tables: `curations`, `curbappeal_job_style_candidates`, `jobs`.
Role: **curator**, sign-off from **principal** or **quality_controller**.

---

## 4. Production — *(Planned)*

Where hands-on time is actually spent every day.

- **Production Queue** *(built)* — jobs with at least one render at
  `stage = 'in_production'`, i.e. QC approved that render's style and
  instruction. Opening a row gives the Production workspace, which has no
  nav entry of its own (same pattern as the Curation and QC workspaces)
  and shows only the renders at this stage.
  - Shows the same evidence panel as the QC workspace, then per ordered
    render: the instruction, a **Render with AI** button, and every image
    generated so far.
  - Rendering calls OpenAI's image EDIT endpoint with the customer's own
    photo as the input, not text-to-image — the promise is "your actual
    house, restyled", which a text-only generation cannot keep. The result
    is written to R2 under `renders/` and recorded in `renders`.
  - Prompt precedence differs from QC deliberately: QC always rebuilds
    from the catalog (it reviews the current best instruction), production
    prefers the prompt QC actually approved (it must render what was
    signed off), falling back to a rebuild only if none exists.
  - New renders land at `qc_status='pending'`, `selected=0`. The customer
    order page only shows approved+selected renders, so generating an
    image can never accidentally publish a bad one. The approve/select
    step is the still-planned QC history screen below.
- **Daily Worksheet** *(planned)* — one row per ordered style across the
  day's jobs, for batch work
- **Prompt History** *(planned)* — assembled prompts, template version,
  retexture vs. full-generation mode (`prompt_generations`)

Removed from this group: *Material Selections* (per-style M1–M13 picks)
and *Render Iterations*, both folded into the Production workspace or
dropped.

Backing tables: `orders` (queue), `prompt_generations`, `renders`.
Role: **designer**.

---

## 5. Quality Control — *(QC Queue built; history/delivered still planned)*

- **QC Queue** *(built)* — jobs with at least one render at
  `stage = 'awaiting_qc'`, i.e. a curator picked its style and that choice
  now needs checking. Keyed off the render's stage, NOT `renders.qc_status`:
  `renders` rows only exist once images have been generated, which happens
  after this stage, so a qc_status-based queue would read empty forever
  while real work waited.
  - **QC Workspace** — reached only by "Check Now" on a queue row, no nav
    entry of its own (same pattern as the Job Curation Workspace). Shows
    the same evidence panel the curator saw (structure, regulatory,
    neighborhood read, ranked shortlist) so the reviewer can second-guess
    the style choice against identical information, then the assembled
    render instruction per render awaiting review. Prompts are rebuilt
    from the catalog on every load and the reviewer can edit them.
    **Approve and deny are per render**, one at a time — a bulk control
    would push through renders nobody looked at. Approving records the
    final text in `prompt_generations` and moves that render to
    `in_production`. Denying requires a reason, clears the render's style
    (which is what returns it to the Curation Queue) and shows the
    rejected style plus the reason to the curator.
- **Approved / Rejected History** *(planned)* — `qc_reviewer_id`, `qc_reason`
- **Delivered** *(planned)* — renders with a `delivered_key` set

Backing tables: `orders` (queue + status transitions), `order_items`,
`prompt_generations` (approved instruction text), `renders` (the
still-planned history/delivered screens).
Role: **quality_controller** (deliberately separate from **designer**, even
when the same person does both today — the review has to be a distinct
pass).

---

## 6. Requests & Escalations — *(Planned)*

- **Custom & Premium Request Queue** (`/admin/requests`) — free-text requests
  from `/start`, no landing spot for them exists today
  (`custom_requests.status`: awaiting_quote → quoted → accepted/declined/lapsed)
- **Escalations** — a Designer can't get a usable render, a Curator can't
  serve a property honestly; needs a real queue + audit trail, not a Slack
  message to yourself (`escalations.status`: open → reassigned/resolved)

Backing tables: `custom_requests`, `escalations`.
Role: **client_liaison** (requests), **router** (escalation triage).

---

## 7. Finance — *(Planned — cheap now, expensive to reconstruct later)*

- **Payments** — one row per Stripe Checkout Session (`payments`)
- **Refunds** — process an authorized refund; authorization is
  Principal-only per the schema's own comment (`refunds.authorized_by`)
- **Chargebacks & Disputes** — assemble evidence (original upload, delivered
  files, timestamped disclosure acknowledgment) (`chargebacks`,
  `evidence_bundle_key`)
- **Contractor Payouts** — per-render or hourly (`contractor_payouts`)

Backing tables: `payments`, `refunds`, `chargebacks`, `contractor_payouts`.
Role: **bookkeeper** (finance branch), refund authorization needs
**principal**.

---

## 8. Contests — *(Planned — Phase 8, separate system, not blocking delivery)*

- Contest management (tiers: community/sponsored/campaign/civic; entry cap,
  pricing, prize) (`contests`)
- Entries review (`contest_entries.status`: submitted/rendered/declined/disqualified)
- Voting period controls (`contest_votes`, open/close timestamps)

Backing tables: `contests`, `contest_entries`, `contest_votes`.
Role: **content_lead**, **channel_lead** (marketing branch).

---

## 9. Catalog — *(Can genuinely wait — V2)*

- Style catalog editor (133 styles, `styles` table)
- Design element / material reference (`design_elements`, `materials`)
- Style-to-style compatibility table (view-only — it's a static precomputed
  17,556-pair table, not edited per order)

Role: **prompt_engineer**, **systems_engineer** (engineering branch).

---

## 10. Settings — **[Partial]**

- **Staff & Roles** (`/admin/staff`) **[Built]** — principal-only, manages
  the 12-role vocabulary
- **Pricing & Packages** *(Planned)* — currently hardcoded in Next.js code;
  this is exactly how a price collapse could happen silently. Should read
  from `config` key/value table instead
- **Disclosure Copy Version** *(Planned)* — versioned AI-disclosure text,
  currently a single hardcoded string in `lib/disclosure.ts`
- **Daily Intake Cap** *(Planned)* — currently a `wrangler.jsonc` variable;
  changing it today requires a deploy
- **General Config** *(Planned)* — generic key/value editor over the
  `config` table, with `updated_by`/`updated_at` already tracked

Backing tables: `staff`, `roles`, `staff_roles`, `config`.
Role: **principal** (most settings), **compliance_officer** (disclosure
copy).

---

## 11. Reports & Audit — *(Can genuinely wait — V2)*

- Metrics dashboard (order volume, conversion, AI token spend — see
  `docs/phase2-analysis-cost-report.md` for the kind of cost data this could
  surface)
- Audit log viewer over `events` (append-only: entity_type, entity_id,
  event_type, actor_type/actor_id, JSON payload) — already being written to,
  nothing currently reads it back

Role: **principal**, **systems_engineer**.

---

## Notes for the header/nav design pass

- **You are the only staff member right now.** Don't design a nav that
  requires role-based menu-hiding to make sense — a single `is_admin`-style
  view where everything is visible is correct for solo operation. Role tags
  above are for *future* multi-person structure, not a v1 permissions
  requirement.
- Priority order for *building*, per the roadmap this doc came from:
  Curation workspace → Production worksheet → QC screen → Requests/
  Escalations → Refunds/Disputes → Settings (pricing/disclosure/intake cap)
  → everything in Catalog/Reports/Contests can wait.
- The nav needs a way to surface *counts* (queue badges) cheaply — every
  "Planned" queue above maps to a simple `COUNT(*) WHERE status = ...`
  query, so badge counts are nearly free once each screen exists.
