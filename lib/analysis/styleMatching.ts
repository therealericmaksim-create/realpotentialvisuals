// Faithful TS port of ../../../Claude Code/pipeline/compute_profile_style_compatibility.py
// (structural match, material match, design-element match, and transformation-
// difficulty scoring). This is a MECHANICAL port of a validated Python reference
// (spot-checked against 12 real test photos) -- every constant, weight, and
// formula below must match the source exactly. Do not "improve," re-tune, or
// simplify anything here without re-validating against the pipeline's 12-photo
// spot-check set first.
//
// Pure functions only: everything here takes already-fetched plain data (D1 rows
// the caller has already queried) as arguments and returns plain data. No D1, no
// fetch, no I/O. The Python source queries sqlite directly inside
// compute_material_score() (style_materials_typical, materials.category) --
// those lookups are replaced below with plain arguments the caller resolves
// first (see MaterialScoreInput).
//
// Field names mirror the D1 column names implied by the schema comments in the
// Python source (roof_pitch_bucket, window_ratio_bucket, massing_envelope,
// foundation_visibility, storey_count, facade_width_ft, roof_form,
// symmetry_axis) translated to camelCase per this codebase's TS convention.

// ---------------------------------------------------------------------------
// Ratified v1 bucket vocabulary (mirrors CHECK constraints on
// curbappeal_structure_profiles / curbappeal_property_structure_analysis in
// realpotential-schema.sql).
// ---------------------------------------------------------------------------
export type RoofPitchBucket =
  | "flat_0_5"
  | "low_5_18"
  | "moderate_18_30"
  | "steep_30_45"
  | "very_steep_45_plus";

export type WindowRatioBucket =
  | "minimal_0_10"
  | "low_10_16"
  | "moderate_16_24"
  | "high_24_35"
  | "very_high_35_plus";

export type FoundationVisibilityCategory = "none" | "low" | "raised" | "elevated";

export type SymmetryAxis = "present" | "absent";

export const ROOF_PITCH_BUCKETS: Record<RoofPitchBucket, [number, number]> = {
  flat_0_5: [0.0, 5.0],
  low_5_18: [5.0, 18.0],
  moderate_18_30: [18.0, 30.0],
  steep_30_45: [30.0, 45.0],
  very_steep_45_plus: [45.0, 90.0],
};

export const WINDOW_RATIO_BUCKETS: Record<WindowRatioBucket, [number, number]> = {
  minimal_0_10: [0.0, 0.1],
  low_10_16: [0.1, 0.16],
  moderate_16_24: [0.16, 0.24],
  high_24_35: [0.24, 0.35],
  very_high_35_plus: [0.35, 1.0],
};

export const FOUNDATION_ORDER: Record<FoundationVisibilityCategory, number> = {
  none: 0,
  low: 1,
  raised: 2,
  elevated: 3,
};

// Base weights sum to 100 when every criterion applies AND every criterion is
// maximally specific. Actual per-style weight = base * specificity (below) --
// renormalized over whichever criteria apply to that style.
export const WEIGHTS = {
  roof_pitch: 20,
  window_ratio: 15,
  massing: 20,
  foundation: 12,
  symmetry: 13,
  roof_form: 20,
  storey_count: 10,
  facade_width: 8,
} as const;

// storey_count is a range like roof_pitch/window_ratio, so it gets the same
// specificity treatment (a style locked to exactly 1 storey is far more
// diagnostic than one spanning 1-3). facade_width is a one-sided floor only
// (min_facade_width_ft, no max) so there's no range width to be specific
// about -- it gets a flat weight like foundation_visibility instead.
export const STOREY_COUNT_DOMAIN = 3.0; // widest real span across the 133 styles
export const STOREY_GAP_DECAY = 2.0; // storeys past the range before credit hits 0
export const FACADE_WIDTH_GAP_DECAY_FT = 20.0; // feet short of the minimum before credit hits 0

// design_element_score_pct: required elements matter far more than optional
// ones (a style is defined by its required composition; optional elements are
// just "consistent with," not diagnostic). Detected elements NOT in a style's
// list are never penalized.
export const DE_REQUIRED_WEIGHT = 0.8;
export const DE_OPTIONAL_WEIGHT = 0.2;

// Same specificity principle already applied to roof_pitch/window_ratio: a
// style with only 1 required element trivially hits 100% if the photo happens
// to show that one common feature -- that's luck, not a diagnostic match.
// Trust (and therefore blend weight) scales up with how many required
// elements a style actually defines, floored so a thin style still counts
// for something rather than being discarded outright.
export const DE_SPECIFICITY_TARGET = 4; // required-element count at which trust maxes out
export const DE_CONFIDENCE_FLOOR = 0.25;

// combined_score_pct blend. Structural (the building's bones) and material
// (what it's actually clad in) are both "make or break" signals -- a brick
// house cannot read as Scandinavian Modern no matter how well its
// massing/roof geometry lines up, the same way a building with the wrong
// roof pitch/form can't either. Design elements (dormers, porches, mouldings)
// are real but secondary evidence, not co-equal with structure and material.
export const STRUCTURAL_BLEND_WEIGHT = 0.4;
export const MATERIAL_BLEND_WEIGHT = 0.4;
export const DESIGN_ELEMENT_BLEND_WEIGHT = 0.2;

// ---------------------------------------------------------------------------
// Material scoring. v1 scores the DETECTED PRIMARY material only against the
// style's primary/accent/trim rows -- graduated, not binary. Family
// similarity (brick~stone) beyond same-category role matching was explicitly
// deferred, not built here -- do not add it without re-validating, same
// reasoning as the roof_form/foundation frequency-discount attempt below.
// ---------------------------------------------------------------------------
export const MATERIAL_ROLE_MATCH_PCT = { primary: 100.0, accent: 55.0, trim: 30.0 } as const;

// Not zero -- material is the single most changeable dimension of a building,
// unlike its structural bones, so a total mismatch still isn't disqualifying
// on its own.
export const MATERIAL_MISMATCH_FLOOR = 15.0;
export const MATERIAL_CONFIDENCE_FLOOR = 0.3;

// Same-category partial credit: "detected shingle, style wants clapboard"
// (both M1 wood claddings) should score better than "detected brick, style
// wants wood siding" (a genuinely different category) even though neither is
// an exact slug match.
export const MATERIAL_SAME_CATEGORY_PCT = { primary: 65.0, accent: 40.0, trim: 25.0 } as const;

// A faux/manufactured material (vinyl "shake," adhered manufactured-stone
// veneer, faux-brick panel) can visually read as the real thing but is a
// surface-level, easily-reversed choice -- it shouldn't drag down an
// otherwise-correct structural match as hard as a genuine material would.
// This discounts the confidence value that already shrinks a signal's blend
// weight elsewhere in this module, rather than being a parallel system.
export const FAUX_MATERIAL_CONFIDENCE_DISCOUNT = 0.5;

export type MaterialAuthenticity = "genuine" | "likely_faux" | "uncertain";
export type MaterialRole = "primary" | "accent" | "trim";

// role -> material id, already fetched from style_materials_typical for one style.
export type StyleMaterialRoles = Partial<Record<MaterialRole, string>>;

// role -> materials.category, already fetched for whichever material ids that
// style role points at (only the roles present in styleMaterials need entries).
export type StyleMaterialRoleCategories = Partial<Record<MaterialRole, string | null>>;

export type MaterialScoreResult = {
  scorePct: number | null;
  confidence: number;
  matchedRole:
    | "primary"
    | "accent"
    | "trim"
    | "primary_same_category"
    | "accent_same_category"
    | "trim_same_category"
    | null;
  authenticity: MaterialAuthenticity;
};

/**
 * Compares the detected primary wall material against a style's own
 * style_materials_typical roles. Returns a null scorePct (not 0) if the style
 * has no material data at all -- same "not evaluated" convention used
 * elsewhere in this module. Unlike the Python original (which queries
 * style_materials_typical/materials directly via a sqlite connection), this
 * takes the already-fetched role->material-id map (styleMaterials) and, when
 * no exact role match is found, the already-fetched role->category map
 * (styleMaterialRoleCategories) plus the detected material's own category
 * (detectedMaterialCategory) as plain arguments.
 */
export function computeMaterialScore(
  detectedPrimaryMaterialId: string | null,
  detectionConfidence: number,
  styleMaterials: StyleMaterialRoles,
  detectedMaterialCategory: string | null,
  styleMaterialRoleCategories: StyleMaterialRoleCategories,
  authenticity: MaterialAuthenticity = "genuine"
): MaterialScoreResult {
  if (detectedPrimaryMaterialId === null) {
    return { scorePct: null, confidence: 0.0, matchedRole: null, authenticity };
  }
  if (
    styleMaterials.primary === undefined &&
    styleMaterials.accent === undefined &&
    styleMaterials.trim === undefined
  ) {
    return { scorePct: null, confidence: 0.0, matchedRole: null, authenticity };
  }

  let score: number;
  let matchedRole: MaterialScoreResult["matchedRole"];

  if (detectedPrimaryMaterialId === styleMaterials.primary) {
    score = MATERIAL_ROLE_MATCH_PCT.primary;
    matchedRole = "primary";
  } else if (detectedPrimaryMaterialId === styleMaterials.accent) {
    score = MATERIAL_ROLE_MATCH_PCT.accent;
    matchedRole = "accent";
  } else if (detectedPrimaryMaterialId === styleMaterials.trim) {
    score = MATERIAL_ROLE_MATCH_PCT.trim;
    matchedRole = "trim";
  } else if (
    detectedMaterialCategory !== null &&
    styleMaterialRoleCategories.primary === detectedMaterialCategory
  ) {
    score = MATERIAL_SAME_CATEGORY_PCT.primary;
    matchedRole = "primary_same_category";
  } else if (
    detectedMaterialCategory !== null &&
    styleMaterialRoleCategories.accent === detectedMaterialCategory
  ) {
    score = MATERIAL_SAME_CATEGORY_PCT.accent;
    matchedRole = "accent_same_category";
  } else if (
    detectedMaterialCategory !== null &&
    styleMaterialRoleCategories.trim === detectedMaterialCategory
  ) {
    score = MATERIAL_SAME_CATEGORY_PCT.trim;
    matchedRole = "trim_same_category";
  } else {
    score = MATERIAL_MISMATCH_FLOOR;
    matchedRole = null;
  }

  let effectiveConfidence = detectionConfidence;
  if (authenticity === "likely_faux") {
    effectiveConfidence *= FAUX_MATERIAL_CONFIDENCE_DISCOUNT;
  }
  const confidence = Math.max(MATERIAL_CONFIDENCE_FLOOR, effectiveConfidence);
  return { scorePct: score, confidence, matchedRole, authenticity };
}

// How many degrees/ratio-units past a range's edge it takes to decay a
// near-miss to zero credit.
export const ROOF_GAP_DECAY_DEG = 30.0;
export const WINDOW_GAP_DECAY = 0.25;

// ---------------------------------------------------------------------------
// Specificity weighting: a style that accepts almost any roof pitch or
// window ratio shouldn't get full credit just for "not conflicting" with the
// profile -- that criterion isn't telling us anything about THIS style
// specifically. A style with a narrow, precise range should have that
// criterion count for a lot (reward AND penalty both amplified); a style
// with a wide, permissive range should have it count for little either way.
// Same idea applied to symmetry: "doesn't care about symmetry" is the
// permissive case and gets down-weighted, not a free pass.
// ---------------------------------------------------------------------------
export const ROOF_PITCH_DOMAIN_DEG = 70.0;
export const WINDOW_RATIO_DOMAIN = 0.7;
export const SPECIFICITY_FLOOR = 0.15;
export const SYMMETRY_NOT_REQUIRED_DISCOUNT = 0.2; // "no requirement" counts as 20% of full weight

export function specificity(width: number, domain: number): number {
  return Math.max(SPECIFICITY_FLOOR, 1.0 - Math.min(1.0, width / domain));
}

// ---------------------------------------------------------------------------
// TRIED AND REVERTED in the Python reference: frequency-based specificity
// discounting for roof_form/foundation_visibility (down-weight a value
// proportional to how many of the 133 styles share it). Testing it against a
// real photo made the correct answer rank WORSE, not better, because a
// common category (e.g. "gable") is often common precisely BECAUSE it's
// genuinely, correctly the right answer for common vernacular styles.
// roof_form stays at flat weight -- do NOT implement any such discount here.
// ---------------------------------------------------------------------------

// Roof form similarity -- exact match is always 1.0; unlisted/related forms
// get partial credit based on how visually/structurally related they are.
// Not subject to specificity weighting the way ranges are (see the reverted-
// attempt note above for why that doesn't help here).
const ROOF_FORM_SIMILARITY_ENTRIES: Array<[string, string, number]> = [
  ["gable", "hip", 0.45],
  ["gable", "gambrel", 0.55],
  ["gable", "mansard", 0.15],
  ["gable", "shed", 0.35],
  ["flat", "gable", 0.05],
  ["gable", "pyramidal", 0.35],
  ["conical", "gable", 0.15],
  ["butterfly", "gable", 0.25],
  ["complex", "gable", 0.5],
  ["gambrel", "hip", 0.35],
  ["hip", "mansard", 0.35],
  ["hip", "shed", 0.25],
  ["flat", "hip", 0.1],
  ["hip", "pyramidal", 0.7],
  ["conical", "hip", 0.4],
  ["butterfly", "hip", 0.1],
  ["complex", "hip", 0.45],
  ["gambrel", "mansard", 0.5],
  ["gambrel", "shed", 0.2],
  ["flat", "gambrel", 0.05],
  ["gambrel", "pyramidal", 0.2],
  ["conical", "gambrel", 0.15],
  ["butterfly", "gambrel", 0.1],
  ["complex", "gambrel", 0.4],
  ["mansard", "shed", 0.15],
  ["flat", "mansard", 0.3],
  ["mansard", "pyramidal", 0.25],
  ["conical", "mansard", 0.2],
  ["butterfly", "mansard", 0.1],
  ["complex", "mansard", 0.4],
  ["flat", "shed", 0.5],
  ["pyramidal", "shed", 0.15],
  ["conical", "shed", 0.1],
  ["butterfly", "shed", 0.4],
  ["complex", "shed", 0.3],
  ["flat", "pyramidal", 0.1],
  ["conical", "flat", 0.1],
  ["butterfly", "flat", 0.3],
  ["complex", "flat", 0.15],
  ["conical", "pyramidal", 0.6],
  ["butterfly", "pyramidal", 0.1],
  ["complex", "pyramidal", 0.35],
  ["butterfly", "conical", 0.05],
  ["complex", "conical", 0.35],
  ["butterfly", "complex", 0.25],
];

function roofFormPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export const ROOF_FORM_SIMILARITY: ReadonlyMap<string, number> = new Map(
  ROOF_FORM_SIMILARITY_ENTRIES.map(([a, b, v]) => [roofFormPairKey(a, b), v])
);

export const ROOF_FORM_SIMILARITY_DEFAULT = 0.2;

export function roofFormScore(profileForm: string, styleForm: string): number {
  if (profileForm === styleForm) {
    return 1.0;
  }
  return ROOF_FORM_SIMILARITY.get(roofFormPairKey(profileForm, styleForm)) ?? ROOF_FORM_SIMILARITY_DEFAULT;
}

export function foundationTextToCategory(text: string | null | undefined): FoundationVisibilityCategory | null {
  if (!text) {
    return null;
  }
  const t = text.toLowerCase();
  if (t.includes("elevated") || t.includes("piles") || t.includes("piers")) {
    return "elevated";
  }
  if (t.includes("raised")) {
    return "raised";
  }
  if (t.includes("exposed")) {
    return "raised";
  }
  if (t.includes("none") || t.includes("bermed") || t.includes("mass wall to grade")) {
    return "none";
  }
  if (t.includes("low")) {
    return "low";
  }
  return "low";
}

/**
 * 1.0 if profileRange sits fully inside styleRange, partial credit for
 * partial overlap, and a linear decay from the nearest edge if there's no
 * overlap at all -- so a near-miss scores higher than a wild miss.
 */
export function rangeProximityScore(
  profileRange: [number, number],
  styleRange: [number, number],
  gapDecay: number
): number {
  const [pLo, pHi] = profileRange;
  const [sLo, sHi] = styleRange;
  const overlap = Math.min(pHi, sHi) - Math.max(pLo, sLo);
  if (overlap > 0) {
    return Math.min(1.0, overlap / (pHi - pLo));
  }
  const gap = Math.max(pLo, sLo) - Math.min(pHi, sHi);
  return Math.max(0.0, 1.0 - gap / gapDecay);
}

/**
 * 1.0 if profileStoreys falls within [styleMin, styleMax], linear decay per
 * storey of distance from the nearest edge otherwise -- a storey is a large,
 * unmistakable visual difference, so the decay is steep.
 */
export function storeyCountScore(profileStoreys: number, styleMin: number, styleMax: number): number {
  if (styleMin <= profileStoreys && profileStoreys <= styleMax) {
    return 1.0;
  }
  const gap = profileStoreys < styleMin ? styleMin - profileStoreys : profileStoreys - styleMax;
  return Math.max(0.0, 1.0 - gap / STOREY_GAP_DECAY);
}

/**
 * styleMinFt is a floor only (no max in the schema) -- full credit at or
 * above it, linear decay per foot short otherwise.
 */
export function facadeWidthScore(profileWidthFt: number, styleMinFt: number): number {
  if (profileWidthFt >= styleMinFt) {
    return 1.0;
  }
  const gap = styleMinFt - profileWidthFt;
  return Math.max(0.0, 1.0 - gap / FACADE_WIDTH_GAP_DECAY_FT);
}

// "rectangle"/"rectangular" -> "recta"[:5]="recta"... see stem() in
// massingOverlapScore() below.
const MASSING_STEM_LEN = 5;

/**
 * Text-based massing description overlap. Splits on hyphens too --
 * "low-slope" and "low horizontal" should share the word "low". Uses a
 * lightweight prefix stem (no NLP library, this vocabulary is small and
 * domain-specific) so common noun/adjective suffix variants match
 * ("rectangle" vs "rectangular", "gable" vs "gabled", "porch" vs "porches").
 */
export function massingOverlapScore(a: string, b: string): number {
  const stem = (word: string): string => (word.length > MASSING_STEM_LEN ? word.slice(0, MASSING_STEM_LEN) : word);

  const tokenize = (s: string): Set<string> => {
    const words = s
      .toLowerCase()
      .split(/[,/\-\s]+/)
      .filter((w) => w !== "");
    return new Set(words.map(stem));
  };

  const wa = tokenize(a);
  const wb = tokenize(b);
  if (wa.size === 0 || wb.size === 0) {
    return 0.0;
  }
  let intersectionSize = 0;
  for (const w of wa) {
    if (wb.has(w)) {
      intersectionSize += 1;
    }
  }
  const unionSize = wa.size + wb.size - intersectionSize;
  return intersectionSize / unionSize;
}

export type FitTier = "believable" | "aspirational" | "excluded";

export const FIT_TIER_BELIEVABLE_THRESHOLD = 75;
export const FIT_TIER_ASPIRATIONAL_THRESHOLD = 40;

/**
 * Derives the coarse fit_tier bucket from a 0-100 score. Used in the Python
 * source both inside compute_match() (on structural score_pct) and again in
 * main() (on combined_score_pct) with the identical 75/40 cutoffs -- factored
 * into one function here since the thresholds must stay in lockstep.
 */
export function deriveFitTier(scorePct: number): FitTier {
  if (scorePct >= FIT_TIER_BELIEVABLE_THRESHOLD) {
    return "believable";
  }
  if (scorePct >= FIT_TIER_ASPIRATIONAL_THRESHOLD) {
    return "aspirational";
  }
  return "excluded";
}

// A structure_profile (real photo analysis) or a style's own self-derived
// profile (style-vs-style comparison). Optional fields mirror profile.get(...)
// in the Python source -- missing on either side just excludes that
// criterion from the average, it is never penalized or rewarded.
export type StructureProfile = {
  massingEnvelope: string;
  symmetryAxis: SymmetryAxis;
  foundationVisibility: FoundationVisibilityCategory;
  roofPitchBucket?: RoofPitchBucket | null;
  windowRatioBucket?: WindowRatioBucket | null;
  roofForm?: string | null;
  storeyCount?: number | null;
  facadeWidthFt?: number | null;
};

// style_structural_requirements row for one style, already joined/fetched.
// Mirrors the (name, massing_envelope, pitch_min, pitch_max, roof_form,
// symmetry_required, min_facade_width_ft, foundation_vis_req, win_min,
// win_max, storey_min, storey_max) tuple compute_match() takes in the source.
export type StyleStructuralRequirements = {
  name: string;
  massingEnvelope: string;
  roofPitchMinDeg: number | null;
  roofPitchMaxDeg: number | null;
  roofForm: string | null;
  symmetryAxisRequired: boolean;
  minFacadeWidthFt: number | null;
  foundationVisibilityReq: string | null;
  windowRatioMin: number | null;
  windowRatioMax: number | null;
  storeyCountMin: number | null;
  storeyCountMax: number | null;
};

export type StructuralMatchResult = {
  scorePct: number;
  fitTier: FitTier;
  notes: string[];
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Main per-style structural score. Each criterion produces its own 0.0-1.0
 * sub-score that degrades gradually with distance (a near-miss scores higher
 * than a wild miss) instead of a hard pass/fail cutoff, then a weighted
 * average combines them, renormalized over whichever criteria actually apply
 * to that style (a style with no roof-pitch requirement doesn't get
 * penalized OR rewarded for it -- that criterion is just excluded from the
 * average for that style).
 */
export function computeMatch(
  profile: StructureProfile,
  styleReq: StyleStructuralRequirements
): StructuralMatchResult {
  const notes: string[] = [];
  let weightedSum = 0.0;
  let weightTotal = 0.0;

  if (styleReq.roofPitchMinDeg !== null && styleReq.roofPitchMaxDeg !== null && profile.roofPitchBucket) {
    const profRange = ROOF_PITCH_BUCKETS[profile.roofPitchBucket];
    const s = rangeProximityScore(
      profRange,
      [styleReq.roofPitchMinDeg, styleReq.roofPitchMaxDeg],
      ROOF_GAP_DECAY_DEG
    );
    const w = WEIGHTS.roof_pitch * specificity(styleReq.roofPitchMaxDeg - styleReq.roofPitchMinDeg, ROOF_PITCH_DOMAIN_DEG);
    weightedSum += s * w;
    weightTotal += w;
    if (s < 0.99) {
      notes.push(`roof_pitch:${s.toFixed(2)}`);
    }
  }

  if (styleReq.windowRatioMin !== null && styleReq.windowRatioMax !== null && profile.windowRatioBucket) {
    const profRange = WINDOW_RATIO_BUCKETS[profile.windowRatioBucket];
    const s = rangeProximityScore(profRange, [styleReq.windowRatioMin, styleReq.windowRatioMax], WINDOW_GAP_DECAY);
    const w =
      WEIGHTS.window_ratio * specificity(styleReq.windowRatioMax - styleReq.windowRatioMin, WINDOW_RATIO_DOMAIN);
    weightedSum += s * w;
    weightTotal += w;
    if (s < 0.99) {
      notes.push(`window_ratio:${s.toFixed(2)}`);
    }
  }

  if (styleReq.roofForm && profile.roofForm) {
    const s = roofFormScore(profile.roofForm, styleReq.roofForm);
    weightedSum += s * WEIGHTS.roof_form;
    weightTotal += WEIGHTS.roof_form;
    if (s < 0.99) {
      notes.push(`roof_form:${s.toFixed(2)}`);
    }
  }

  // massing always applies -- both sides always have descriptive text
  {
    const s = massingOverlapScore(profile.massingEnvelope, styleReq.massingEnvelope);
    weightedSum += s * WEIGHTS.massing;
    weightTotal += WEIGHTS.massing;
    if (s < 0.99) {
      notes.push(`massing_envelope:${s.toFixed(2)}`);
    }
  }

  const styleFndCat = foundationTextToCategory(styleReq.foundationVisibilityReq);
  if (styleFndCat !== null) {
    const pi = FOUNDATION_ORDER[profile.foundationVisibility] ?? FOUNDATION_ORDER.low;
    const si = FOUNDATION_ORDER[styleFndCat];
    const s = Math.max(0.0, 1.0 - Math.abs(pi - si) / 3.0);
    weightedSum += s * WEIGHTS.foundation;
    weightTotal += WEIGHTS.foundation;
    if (s < 0.99) {
      notes.push(`foundation_visibility:${s.toFixed(2)}`);
    }
  }

  // no symmetry requirement -> the permissive case, down-weighted rather
  // than given a free full-weight pass
  {
    let s: number;
    let w: number;
    if (styleReq.symmetryAxisRequired) {
      s = profile.symmetryAxis === "present" ? 1.0 : 0.25;
      w = WEIGHTS.symmetry;
    } else {
      s = 1.0;
      w = WEIGHTS.symmetry * SYMMETRY_NOT_REQUIRED_DISCOUNT;
    }
    weightedSum += s * w;
    weightTotal += w;
    if (s < 0.99) {
      notes.push(`symmetry:${s.toFixed(2)}`);
    }
  }

  if (styleReq.storeyCountMin !== null && styleReq.storeyCountMax !== null && profile.storeyCount != null) {
    const s = storeyCountScore(profile.storeyCount, styleReq.storeyCountMin, styleReq.storeyCountMax);
    const w = WEIGHTS.storey_count * specificity(styleReq.storeyCountMax - styleReq.storeyCountMin, STOREY_COUNT_DOMAIN);
    weightedSum += s * w;
    weightTotal += w;
    if (s < 0.99) {
      notes.push(`storey_count:${s.toFixed(2)}`);
    }
  } else if (styleReq.storeyCountMin !== null || styleReq.storeyCountMax !== null) {
    notes.push("not_evaluated:storey_count (profile has no storey_count)");
  }

  if (styleReq.minFacadeWidthFt !== null && profile.facadeWidthFt != null) {
    const s = facadeWidthScore(profile.facadeWidthFt, styleReq.minFacadeWidthFt);
    const w = WEIGHTS.facade_width;
    weightedSum += s * w;
    weightTotal += w;
    if (s < 0.99) {
      notes.push(`facade_width:${s.toFixed(2)}`);
    }
  } else if (styleReq.minFacadeWidthFt !== null) {
    notes.push("not_evaluated:min_facade_width_ft (profile has no facade_width_ft)");
  }

  const scorePct = weightTotal > 0 ? (weightedSum / weightTotal) * 100 : 0.0;
  return { scorePct: round1(scorePct), fitTier: deriveFitTier(scorePct), notes };
}

export type DesignElementScoreResult = {
  scorePct: number | null;
  confidence: number;
  matchedRequired: number;
  totalRequired: number;
  matchedOptional: number;
  totalOptional: number;
};

function setIntersectionSize<T>(a: Set<T>, b: Set<T>): number {
  let count = 0;
  for (const v of a) {
    if (b.has(v)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Overlap between what was detected in the photo and a style's defined
 * composition. score is null if the style has no design elements defined at
 * all (never scored as 0 or 100 in that case -- same "not evaluated"
 * convention as storey_count/facade_width in computeMatch()). confidence
 * scales with how many required elements the style actually defines -- see
 * DE_SPECIFICITY_TARGET above; it discounts the BLEND weight, it does not
 * hide the raw counts.
 */
export function computeDesignElementScore(
  detectedSlugs: Set<string>,
  requiredSlugs: Set<string>,
  optionalSlugs: Set<string>
): DesignElementScoreResult {
  const matchedRequired = setIntersectionSize(detectedSlugs, requiredSlugs);
  const matchedOptional = setIntersectionSize(detectedSlugs, optionalSlugs);
  const totalRequired = requiredSlugs.size;
  const totalOptional = optionalSlugs.size;

  if (requiredSlugs.size === 0 && optionalSlugs.size === 0) {
    return { scorePct: null, confidence: 0.0, matchedRequired: 0, totalRequired: 0, matchedOptional: 0, totalOptional: 0 };
  }

  let parts = 0.0;
  let weightTotal = 0.0;
  if (requiredSlugs.size > 0) {
    parts += (matchedRequired / totalRequired) * DE_REQUIRED_WEIGHT;
    weightTotal += DE_REQUIRED_WEIGHT;
  }
  if (optionalSlugs.size > 0) {
    parts += (matchedOptional / totalOptional) * DE_OPTIONAL_WEIGHT;
    weightTotal += DE_OPTIONAL_WEIGHT;
  }
  const score = weightTotal > 0 ? round1((parts / weightTotal) * 100) : null;
  const confidence = Math.max(DE_CONFIDENCE_FLOOR, Math.min(1.0, totalRequired / DE_SPECIFICITY_TARGET));
  return { scorePct: score, confidence, matchedRequired, totalRequired, matchedOptional, totalOptional };
}

/**
 * Blends up to three independent signals; falls back gracefully when a
 * signal doesn't apply (style has no design elements defined, or no material
 * was detected/no material data exists for the style). Each optional
 * signal's effective blend weight is its own confidence times its base
 * weight, so a thin-data or low-confidence signal contributes proportionally
 * less rather than being trusted as fully as a strong one. materialPct
 * defaults to null (not 0) so callers that don't pass material data at all
 * still get the original 2-way structural/design-element blend, not a
 * silently 3-way-diluted score.
 */
export function combineScores(
  structuralPct: number,
  designElementPct: number | null,
  deConfidence: number,
  materialPct: number | null = null,
  materialConfidence: number = 0.0
): number {
  let parts = structuralPct * STRUCTURAL_BLEND_WEIGHT;
  let weightTotal = STRUCTURAL_BLEND_WEIGHT;
  if (designElementPct !== null) {
    const effectiveDeWeight = DESIGN_ELEMENT_BLEND_WEIGHT * deConfidence;
    parts += designElementPct * effectiveDeWeight;
    weightTotal += effectiveDeWeight;
  }
  if (materialPct !== null) {
    const effectiveMaterialWeight = MATERIAL_BLEND_WEIGHT * materialConfidence;
    parts += materialPct * effectiveMaterialWeight;
    weightTotal += effectiveMaterialWeight;
  }
  return round1(parts / weightTotal);
}

// ---------------------------------------------------------------------------
// structural_difficulty_pct / decorative_difficulty_pct: "changing decor on a
// door is super easy compared to changing window type from square to rounded
// compared to altering roof pitch completely" -- a flat structural-vs-applied
// binary can't express that spread, so each gap element's difficulty is a
// base (by structural_or_applied) plus escalating bumps for
// requires_framing_change and requires_load_path, scaled by labour_intensity.
// ---------------------------------------------------------------------------
export type StructuralOrApplied = "applied" | "structural";
export type LabourIntensity = "low" | "medium" | "high";

export const DIFFICULTY_BASE: Record<StructuralOrApplied, number> = { applied: 10, structural: 40 };
export const FRAMING_CHANGE_BUMP = 15;
export const LOAD_PATH_BUMP = 25;
export const LABOUR_BUMP: Record<LabourIntensity, number> = { low: 0, medium: 10, high: 20 };

// Weighted toward the hardest single element in the gap, not a flat average --
// one brutal structural item (e.g. a new load path) shouldn't get diluted
// away by several trivial ones sitting alongside it in the same category.
export const DIFFICULTY_MAX_WEIGHT = 0.65;
export const DIFFICULTY_MEAN_WEIGHT = 0.35;

export function elementDifficulty(
  structuralOrApplied: StructuralOrApplied,
  requiresFramingChange: boolean,
  requiresLoadPath: boolean,
  labourIntensity: LabourIntensity
): number {
  let score = DIFFICULTY_BASE[structuralOrApplied];
  if (requiresFramingChange) {
    score += FRAMING_CHANGE_BUMP;
  }
  if (requiresLoadPath) {
    score += LOAD_PATH_BUMP;
  }
  score += LABOUR_BUMP[labourIntensity] ?? 0;
  return Math.min(100, score);
}

/**
 * 0 (not null) when the gap is empty for this category -- e.g. a
 * transformation that's purely a siding + front-door swap has a real,
 * meaningful structural_difficulty_pct of 0.
 */
export function aggregateDifficulty(perElementScores: number[]): number {
  if (perElementScores.length === 0) {
    return 0.0;
  }
  const max = Math.max(...perElementScores);
  const mean = perElementScores.reduce((sum, v) => sum + v, 0) / perElementScores.length;
  return round1(max * DIFFICULTY_MAX_WEIGHT + mean * DIFFICULTY_MEAN_WEIGHT);
}

export type ElementAttrs = {
  structuralOrApplied: StructuralOrApplied;
  requiresFramingChange: boolean;
  requiresLoadPath: boolean;
  labourIntensity: LabourIntensity;
};

export type TransformationDifficulty = {
  structuralDifficultyPct: number;
  decorativeDifficultyPct: number;
};

/**
 * fromOwnElements: set of slugs the FROM side already has (a style's own
 * required+optional elements, OR a real photo's detected elements).
 * toRequiredElements: set of slugs the TO style REQUIRES. elementAttrs:
 * slug -> reviewed design_element_attributes row, already fetched.
 */
export function computeTransformationDifficulty(
  fromOwnElements: Set<string>,
  toRequiredElements: Set<string>,
  elementAttrs: Record<string, ElementAttrs>
): TransformationDifficulty {
  const structuralScores: number[] = [];
  const appliedScores: number[] = [];
  for (const slug of toRequiredElements) {
    if (fromOwnElements.has(slug)) {
      continue;
    }
    const attrs = elementAttrs[slug];
    if (attrs === undefined) {
      continue; // no reviewed attributes for this element -- skip rather than guess
    }
    const difficulty = elementDifficulty(
      attrs.structuralOrApplied,
      attrs.requiresFramingChange,
      attrs.requiresLoadPath,
      attrs.labourIntensity
    );
    (attrs.structuralOrApplied === "structural" ? structuralScores : appliedScores).push(difficulty);
  }
  return {
    structuralDifficultyPct: aggregateDifficulty(structuralScores),
    decorativeDifficultyPct: aggregateDifficulty(appliedScores),
  };
}
