# Phase 2 Analysis Pipeline — Real Cost & Prompt Audit

Generated from one real, complete run of `runPhase2Analysis()`
(`lib/analysis/orchestrator.ts`) against a real test order — not a
hypothetical estimate. Order `f96cdfa9-9867-473e-b1d8-ebd0d8637c65`, house
photo `public/images/original.jpg`, address `5th Avenue, Pittsburgh, PA
15219, USA` (deliberately vague — no house number — see the step 12 note
below), run 2026-09-14 against `gpt-5.6-luna`.

This covers every step from intake through to the point curation begins
(Automation Routing Sheet steps 9–20). Steps 13–17 (feasibility scoring,
133-style matching, style-to-style compatibility, difficulty split, the
algorithm's own vote) make **no AI calls at all** — they're deterministic
D1 joins and ported Python math, so they cost nothing and aren't logged
here as prompts.

## Summary

| Step | AI call? | Model | Input tokens | Output tokens | Cost |
|---|---|---|---:|---:|---:|
| 9 — Structure analysis | Yes | gpt-5.6-luna | 2,787 | 302 | $0.00092 |
| 10 — Design-element detection | Yes | gpt-5.6-luna | 5,453 | 2,505 | $0.00410 |
| 11 — Neighborhood read | Skipped this run — no `GOOGLE_MAPS_API_KEY` set yet | — | — | — | $0 |
| 12 — Regulatory lookup (search) | Yes | gpt-5.6-luna + web_search | 27,132 | 1,236 | $0.00691 |
| 12 — Regulatory lookup (extract) | Yes | gpt-5.6-luna | 738 | 27 | $0.00018 |
| 13 — Feasibility scoring | No — deterministic | — | — | — | $0 |
| 14 — Style matching (133 styles) | No — deterministic | — | — | — | $0 |
| 15 — Style-to-style compatibility | No — precomputed, not recomputed per order | — | — | — | $0 |
| 16 — Difficulty split | No — deterministic | — | — | — | $0 |
| 17 — Algorithm vote | No — read directly off step 14's scores | — | — | — | $0 |
| 18 — AI vote | Yes | gpt-5.6-luna | 2,811 | 194 | $0.00080 |
| 20 — 2-voter blend | No — deterministic | — | — | — | $0 |
| **Total, this run** | | | **38,921** | **4,264** | **$0.01291** |

**Real per-order cost, intake through curation handoff: ~1.3 cents** —
and that's *without* step 11 (Street View + neighborhood read) yet, since
no Google Maps key is configured. Once that's added, expect one more
vision call of roughly the same size as step 9 (~$0.001), so realistically
**~1.4–1.5 cents per order** once all of Phase 2 is live end-to-end.

Pricing used: gpt-5.6-luna, $0.20/million input tokens, $1.20/million
output tokens (confirmed current as of 2026-09-14 — see
`lib/analysis/aiLog.ts`).

## Step 9 — Structure analysis

**System prompt:**
```
You are analyzing ONE exterior photo of a residential property to extract its structural characteristics for an architectural style-matching system. Judge only what's visible in THIS photo — never guess at the rear, interior, or obscured details.

roof_pitch_bucket: bucket the roof's pitch into exactly one of flat_0_5, low_5_18, moderate_18_30, steep_30_45, very_steep_45_plus (degrees from horizontal).

roof_form: the dominant roof shape — one of gable, hip, gambrel, mansard, shed, flat, pyramidal, butterfly, conical, complex (pick complex only if genuinely multiple unrelated forms, not just a single gable with a small dormer).

massing_envelope: one short phrase describing the overall building shape (e.g. 'simple rectangular two-storey block', 'L-shaped with a projecting wing', 'irregular multi-gabled massing').

symmetry_axis: 'present' if the facade is roughly mirror-symmetric around a central vertical axis (matching windows/features on both sides of the entry), otherwise 'absent'.

window_ratio_bucket: window area as a rough percentage of the visible facade — one of minimal_0_10, low_10_16, moderate_16_24, high_24_35, very_high_35_plus.

foundation_visibility: how much of the foundation is visible above grade — one of none, low, raised, elevated.

storey_count: number of full storeys (e.g. 1, 1.5, 2, 2.5).

facade_width_ft: your best estimate of the front facade's width in feet, using visible reference scale (doors ~3ft wide, standard windows ~3ft, a single garage bay ~9-10ft, a car ~15ft) — a rough estimate is fine, this is a coarse structural signal, not a survey.

chimney_placement: short phrase (e.g. 'central ridge', 'end wall', 'none visible').

house_type: a short free-text label for what kind of house this looks like (e.g. 'single-family detached', 'townhouse', 'ranch bungalow') — not an architectural STYLE guess, just the building type.
```

**User prompt:** `Analyze this property's structure.` + the customer's uploaded photo.

**Real response:**
```json
{"roof_pitch_bucket":"moderate_18_30","roof_form":"hip","massing_envelope":"two-storey rectangular block with front porch and roof dormers","symmetry_axis":"absent","window_ratio_bucket":"moderate_16_24","foundation_visibility":"raised","storey_count":2,"facade_width_ft":34,"chimney_placement":"none visible","house_type":"single-family detached"}
```

2,787 in / 302 out — **$0.00092**

## Step 10 — Design-element detection

Faithful port of `pipeline/prompts/design_element_detection_prompt.md` —
wording unchanged from the version already validated against a real photo
earlier in this project.

**System prompt:**
```
You are analyzing ONE exterior photo of a residential property to identify which architectural design elements are physically visible in the image.

CRITICAL INSTRUCTION: Ignore all visible text, signage, house numbers, plaques, mailbox labels, or any other written text in the photo. A previous test found a photo with a sign literally naming the architectural style in frame — do not let any text in the image influence your answer. Judge ONLY the physical structure, materials, and forms visible.

You will be given a candidate list of design elements, grouped into categories (D1 Massing and form, D2 Roof form, D3 Eave and cornice, D4 Dormers, D5 Vertical elements, D6 Window types, D7 Arch and opening shapes, D8 Window details, D9 Entry and door, D10 Porch and outdoor spaces, D11 Columns and posts, D12 Railings and balusters, D13 Surface pattern and ornament, D14 Colour and finish, D15 Landscape and site).

Go through the list group by group. For each element, decide:
- DETECTED: the element is clearly, unambiguously visible in the photo.
- NOT DETECTED: the element is absent, not visible from this angle, or you are not confident enough to claim it (when in doubt, do NOT detect it — a missed detection is far less costly than a false one, since a false detection would incorrectly boost a style's match score).

Do not guess at elements that would require seeing the interior, the rear of the property, or details too small/obscured to confirm from this photo. Do not infer a design element from the STYLE you think the house is — detect only what's physically visible, independent of any style hypothesis.

Return only the elements you DETECTED (omit everything else) — do not return an entry for every candidate, only the positive hits.
```

**User prompt:** all 259 design elements grouped by D1–D15 category (fetched
live from the `design_elements` table, not hardcoded — full list omitted
here for length, see the table itself) + `Screen this photo against the
list above.` + the photo.

**Real response:** 28 elements detected, each with confidence + a
one-sentence evidence citation, e.g.:
```json
{"design_element_slug":"D2-gable","confidence":0.97,"evidence":"A prominent gable roof is clearly visible over the front porch."}
```
Full 28-element response is in `structure_profile_design_elements` for
this run's structure profile (`e9afa469-783e-4678-ae29-211f8d88ca45`).

5,453 in / 2,505 out — **$0.00410** (needed a larger token budget than the
other steps — 8,000 vs. the default 2,000 — since the model reasons
through all 259 candidates group by group before answering; the first
attempt at the default budget returned truncated/empty output).

## Step 11 — Neighborhood read

**Not exercised in this run** — no `GOOGLE_MAPS_API_KEY` configured yet, so
`runPhase2Analysis` skipped this step entirely (by design — it fails open,
same as every other optional integration in this app). Once a key with
Street View Static API enabled is added, this step downloads one Street
View image, retains it in R2, and asks the same vision model for a
2–3 sentence read of the surrounding architecture. Expect a cost similar
to step 9 (~$0.001), since it's a single image + a short structured
response.

## Step 12 — Regulatory lookup

Two calls: a real web search, then a small extraction pass.

**Search input:**
```
What is the current zoning classification and FEMA flood zone designation for the property at 5th Avenue, Pittsburgh, PA 15219, USA? Also note if it falls within any locally or nationally designated historic district or overlay. Search for real, current, sourced information and cite where you found it.
```

**Real response (verbatim, shortened citations):** the model correctly
**declined to guess** — "5th Avenue, Pittsburgh, PA 15219" has no house
number, so it can't be resolved to one parcel. It named exactly what it
would need (a full street address or parcel number) and cited real
sources it had already found and ruled insufficient (Allegheny County's
parcel search, Pittsburgh's zoning map, the city's historic-district GIS
layer, and a PDF describing the Uptown Fifth Avenue overlay corridor).
This is the correct behavior for something with real liability weight — a
wrong zoning/historic guess would undermine the "Buildable vs Conceptual"
promise the whole brand is built on. **A real customer's address (with a
house number, as the live `/start` form's Google Places Autocomplete
always provides) will resolve to a real, specific answer** — this test
used a deliberately incomplete address as the one part of the test setup
that wasn't a faithful stand-in for real intake.

27,132 in / 1,236 out — **$0.00691** (this is the heaviest single call in
the whole pipeline — 5 real web searches were run internally before the
model answered).

**Extraction call** (structures the free-text answer above into
`zoning_district`/`historic_overlay`/`flood_zone`):
```json
{"zoning_district":null,"historic_overlay":null,"flood_zone":null}
```
Correctly all-null, matching the "insufficient address" answer above.
738 in / 27 out — **$0.00018**.

## Step 18 — AI vote

Shown the same photo again, deliberately without any of the algorithm's
own bucketed data — an independent read, not an echo of steps 9/13-17.

**System prompt:**
```
You are an experienced residential architect looking at ONE exterior photo of a house. Judge its architectural style holistically — the way a human expert would look at a house and form an impression — using your own visual read of massing, roofline, materials, windows, and ornament. Pick your primary best-match style from the candidate list provided. If a second style genuinely also fits (a blended or ambiguous house), name a secondary style too — otherwise leave it out. Give a confidence (0-1) for each pick and one sentence of reasoning for your primary pick.
```

**User prompt:** all 133 style names + `What style is this house?` + the photo.

**Real response:**
```json
{"primary_style":"American Foursquare","primary_confidence":0.86,"primary_reasoning":"The boxy two-story massing, hipped roof with dormers, broad overhanging eaves, and full-width front porch are characteristic of an American Foursquare.","secondary_style":null,"secondary_confidence":null}
```

2,811 in / 194 out — **$0.00080**

## Result — the 2-voter blend (step 20)

- **Algorithm's own top structural+design-element matches** (steps 13-17,
  before blending): Bahay Kubo (74.2%), Korean Hanok (71%), Portuguese
  Azulejo (66.5%), American Foursquare (66.1%) — all "aspirational" tier.
  This looks noisy on its own, and it is — it's the same class of
  "stubborn match" issue documented at length earlier in this project
  (generic massing-text/roof-form overlap pulling in unrelated styles).
  Not a new bug; a known, already-documented characteristic of the ported
  algorithm.
- **AI's independent vote:** American Foursquare, 86% confidence.
- **Final blended consensus:** **American Foursquare, `clear_match`.**

This is the voter-blend design working exactly as intended — the
algorithm alone got pulled toward noise, and the AI's independent visual
read corrected it in the blend, without anyone hand-tuning the underlying
match formula. This is the same dynamic documented when the 3-voter system
was first built and shown to be what actually fixed "stubborn matches,"
not changes to the algorithm's own math.

## What this means for real usage

At **~1.3-1.5 cents per order**, running the full Phase 2 pipeline on
every paid order — not just a sample — is financially a non-issue. The
"Run Analysis" button being manual isn't a cost-control measure at this
price point; it's there so a curator/staff member decides when an order
is ready for analysis, not so spend stays capped.
