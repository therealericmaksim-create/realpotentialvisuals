// Step 9 (Automation Routing Sheet Phase 2): structure analysis. Unlike
// design-element detection, this step never had a real prompt written
// before now — curbappeal_structure_profiles has only ever held hand-authored test
// data. This is the first real version.

import { callVisionJson } from "./openaiClient";
import type { AiCallLog } from "./aiLog";

const SYSTEM_PROMPT =
  "You are analyzing ONE exterior photo of a residential property to " +
  "extract its structural characteristics for an architectural style-" +
  "matching system. Judge only what's visible in THIS photo — never guess " +
  "at the rear, interior, or obscured details. " +
  "\n\nroof_pitch_bucket: bucket the roof's pitch into exactly one of " +
  "flat_0_5, low_5_18, moderate_18_30, steep_30_45, very_steep_45_plus " +
  "(degrees from horizontal). " +
  "\n\nroof_form: the dominant roof shape — one of gable, hip, gambrel, " +
  "mansard, shed, flat, pyramidal, butterfly, conical, complex (pick " +
  "complex only if genuinely multiple unrelated forms, not just a single " +
  "gable with a small dormer). " +
  "\n\nmassing_envelope: one short phrase describing the overall building " +
  "shape (e.g. 'simple rectangular two-storey block', 'L-shaped with a " +
  "projecting wing', 'irregular multi-gabled massing'). " +
  "\n\nsymmetry_axis: 'present' if the facade is roughly mirror-symmetric " +
  "around a central vertical axis (matching windows/features on both " +
  "sides of the entry), otherwise 'absent'. " +
  "\n\nwindow_ratio_bucket: window area as a rough percentage of the " +
  "visible facade — one of minimal_0_10, low_10_16, moderate_16_24, " +
  "high_24_35, very_high_35_plus. " +
  "\n\nfoundation_visibility: how much of the foundation is visible above " +
  "grade — one of none, low, raised, elevated. " +
  "\n\nstorey_count: number of full storeys (e.g. 1, 1.5, 2, 2.5). " +
  "\n\nfacade_width_ft: your best estimate of the front facade's width in " +
  "feet, using visible reference scale (doors ~3ft wide, standard windows " +
  "~3ft, a single garage bay ~9-10ft, a car ~15ft) — a rough estimate is " +
  "fine, this is a coarse structural signal, not a survey. " +
  "\n\nchimney_placement: short phrase (e.g. 'central ridge', 'end wall', " +
  "'none visible'). " +
  "\n\nhouse_type: a short free-text label for what kind of house this " +
  "looks like (e.g. 'single-family detached', 'townhouse', 'ranch " +
  "bungalow') — not an architectural STYLE guess, just the building type.";

const SCHEMA = {
  type: "object",
  properties: {
    roof_pitch_bucket: {
      type: "string",
      enum: ["flat_0_5", "low_5_18", "moderate_18_30", "steep_30_45", "very_steep_45_plus"],
    },
    roof_form: {
      type: "string",
      enum: ["gable", "hip", "gambrel", "mansard", "shed", "flat", "pyramidal", "butterfly", "conical", "complex"],
    },
    massing_envelope: { type: "string" },
    symmetry_axis: { type: "string", enum: ["present", "absent"] },
    window_ratio_bucket: {
      type: "string",
      enum: ["minimal_0_10", "low_10_16", "moderate_16_24", "high_24_35", "very_high_35_plus"],
    },
    foundation_visibility: { type: "string", enum: ["none", "low", "raised", "elevated"] },
    storey_count: { type: "number" },
    facade_width_ft: { type: "number" },
    chimney_placement: { type: "string" },
    house_type: { type: "string" },
  },
  required: [
    "roof_pitch_bucket",
    "roof_form",
    "massing_envelope",
    "symmetry_axis",
    "window_ratio_bucket",
    "foundation_visibility",
    "storey_count",
    "facade_width_ft",
    "chimney_placement",
    "house_type",
  ],
  additionalProperties: false,
};

export type StructureAnalysisResult = {
  roof_pitch_bucket: string;
  roof_form: string;
  massing_envelope: string;
  symmetry_axis: "present" | "absent";
  window_ratio_bucket: string;
  foundation_visibility: string;
  storey_count: number;
  facade_width_ft: number;
  chimney_placement: string;
  house_type: string;
};

export async function analyzeStructure(
  apiKey: string,
  photoDataUrl: string
): Promise<{ result: StructureAnalysisResult; log: AiCallLog }> {
  const { parsed, log } = await callVisionJson(
    apiKey,
    "9-structure-analysis",
    SYSTEM_PROMPT,
    "Analyze this property's structure.",
    [photoDataUrl],
    "structure_analysis",
    SCHEMA
  );
  return { result: parsed as StructureAnalysisResult, log };
}
