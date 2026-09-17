// Assembles the image-generation instruction for one ordered render.
//
// This is a deterministic template fill, NOT an AI call: the render itself
// is produced by a human pasting this text into Midjourney (no official
// API — see the Automation Routing Sheet), so the value here is producing
// instructions complete enough that two different operators get the same
// result. Everything it interpolates already exists in the catalog the
// Python pipeline seeded: the style's typical materials
// (style_materials_typical, commented in the schema as "feeds prompt
// generation"), its required design elements (style_design_elements), and
// the house's own measured structure profile.
//
// The single most important property of this prompt is the structure/style
// split: the business promise is "your actual house, restyled", so every
// structural fact we measured is stated as must-not-change, and only
// surface treatment is opened up. A prompt that lets the model redesign
// the house is worse than no prompt at all.

export const PROMPT_TEMPLATE_VERSION = "rpv-retexture-v2";

// 'retexture' vs 'full_generation' is the prompt_generations CHECK
// vocabulary. Everything this builder produces is a retexture by
// construction — full_generation would mean abandoning the source photo.
export const PROMPT_GENERATION_MODE = "retexture";

export type PromptSlot = {
  orderItemId: string;
  tier: string;
  styleId: string;
  styleName: string;
  customText: string | null;
  night: number;
  seasonal: number;
  seasonChoice: string | null;
  holiday: number;
  holidayChoice: string | null;
  breakdown: number;
};

export type BuiltPrompt = {
  orderItemId: string;
  styleId: string;
  styleName: string;
  tier: string;
  assembledPrompt: string;
  negativePrompt: string;
  templateVersion: string;
};

type StructureFacts = {
  house_type: string;
  roof_form: string | null;
  roof_pitch_bucket: string | null;
  massing_envelope: string;
  symmetry_axis: string | null;
  window_ratio_bucket: string | null;
  foundation_visibility: string | null;
  storey_count: number | null;
  facade_width_ft: number | null;
  chimney_placement: string | null;
};

const PITCH_LABELS: Record<string, string> = {
  flat_0_5: "flat (0–5°)",
  low_5_18: "low (5–18°)",
  moderate_18_30: "moderate (18–30°)",
  steep_30_45: "steep (30–45°)",
  very_steep_45_plus: "very steep (45°+)",
};

const WINDOW_RATIO_LABELS: Record<string, string> = {
  minimal_0_10: "minimal glazing (0–10% of facade)",
  low_10_16: "low glazing (10–16% of facade)",
  moderate_16_24: "moderate glazing (16–24% of facade)",
  high_24_35: "high glazing (24–35% of facade)",
  very_high_35_plus: "very high glazing (35%+ of facade)",
};

const NEGATIVE_PROMPT = [
  "different house",
  "different floor plan",
  "changed footprint",
  "added storey",
  "removed storey",
  "moved windows",
  "resized windows",
  "moved doors",
  "changed roof pitch",
  "changed roofline",
  "new addition",
  "different camera angle",
  "different perspective",
  "cropped differently",
  "cartoon",
  "illustration",
  "painting",
  "sketch",
  "distorted proportions",
  "warped straight lines",
  "extra buildings",
  "people",
  "text",
  "watermark",
  "signature",
].join(", ");

function structureLines(s: StructureFacts | null): string[] {
  if (!s) {
    return [
      "- No structural analysis was run on this property, so treat EVERY structural feature visible in the source photo as fixed: footprint, storey count, roofline and pitch, every window and door opening, porch, garage, chimney, and foundation height.",
    ];
  }

  const lines = [
    `- Building type and massing: ${s.house_type}, ${s.massing_envelope} — keep the footprint and overall silhouette identical.`,
  ];
  if (s.storey_count) lines.push(`- Storey count: ${s.storey_count} — do not add or remove floors.`);
  if (s.roof_form || s.roof_pitch_bucket) {
    const pitch = s.roof_pitch_bucket ? PITCH_LABELS[s.roof_pitch_bucket] ?? s.roof_pitch_bucket : null;
    lines.push(
      `- Roof: ${[s.roof_form ? `${s.roof_form} form` : null, pitch ? `${pitch} pitch` : null]
        .filter(Boolean)
        .join(", ")} — keep the same roof geometry, ridge lines and eave overhangs.`
    );
  }
  if (s.symmetry_axis) lines.push(`- Facade symmetry: ${s.symmetry_axis} — preserve it exactly.`);
  if (s.window_ratio_bucket) {
    lines.push(
      `- Window-to-wall ratio: ${WINDOW_RATIO_LABELS[s.window_ratio_bucket] ?? s.window_ratio_bucket} — every opening keeps its existing position, size and proportion.`
    );
  }
  if (s.foundation_visibility) {
    lines.push(`- Foundation visibility: ${s.foundation_visibility} — keep the same height above grade.`);
  }
  if (s.chimney_placement) lines.push(`- Chimney: ${s.chimney_placement} — keep it where it is.`);
  if (s.facade_width_ft) lines.push(`- Facade width: approximately ${s.facade_width_ft} ft — do not widen or narrow the house.`);
  return lines;
}

function extrasSection(slot: PromptSlot): string {
  const blocks: string[] = [];
  if (slot.night) {
    blocks.push(
      "NIGHT VIEW: render this at dusk under a deep blue evening sky, with warm interior light visible through the windows and tasteful exterior architectural lighting (path, facade wash, porch fixtures). Keep the same camera position as the daylight framing."
    );
  }
  if (slot.seasonal) {
    blocks.push(
      `SEASONAL TREATMENT: depict the property in ${slot.seasonChoice ?? "the requested season"} — adjust foliage, ground cover, light quality and sky to match that season, without changing the building itself or removing mature trees.`
    );
  }
  if (slot.holiday) {
    blocks.push(
      `HOLIDAY DECOR: add tasteful ${slot.holidayChoice ?? "seasonal"} decoration appropriate to the style — exterior lighting, wreaths, garland and door dressing only. Decoration is temporary dressing: it must not hide or alter architecture.`
    );
  }
  return blocks.join("\n\n");
}

export async function buildRenderPrompts(
  db: D1Database,
  jobId: string,
  propertyId: string | null,
  slots: PromptSlot[]
): Promise<BuiltPrompt[]> {
  if (slots.length === 0) return [];

  const structure = propertyId
    ? await db
        .prepare(
          `SELECT sp.house_type, sp.roof_form, sp.roof_pitch_bucket, sp.massing_envelope,
                  sp.symmetry_axis, sp.window_ratio_bucket, sp.foundation_visibility,
                  sp.storey_count, sp.facade_width_ft, sp.chimney_placement
           FROM curbappeal_property_structure_analysis psa
           JOIN curbappeal_structure_profiles sp ON sp.id = psa.structure_profile_id
           WHERE psa.property_id = ?`
        )
        .bind(propertyId)
        .first<StructureFacts>()
    : null;

  const detected = propertyId
    ? await db
        .prepare(
          `SELECT de.name
           FROM curbappeal_property_structure_analysis psa
           JOIN curbappeal_structure_profile_design_elements spde
             ON spde.structure_profile_id = psa.structure_profile_id
           JOIN design_elements de ON de.id = spde.design_element_id
           WHERE psa.property_id = ?
           ORDER BY de.category`
        )
        .bind(propertyId)
        .all<{ name: string }>()
    : null;
  const detectedNames = (detected?.results ?? []).map((r) => r.name);

  const built: BuiltPrompt[] = [];

  for (const slot of slots) {
    const style = await db
      .prepare(`SELECT name, family, description FROM styles WHERE id = ?`)
      .bind(slot.styleId)
      .first<{ name: string; family: string; description: string | null }>();

    const materials = await db
      .prepare(
        `SELECT m.name, smt.role FROM style_materials_typical smt
         JOIN materials m ON m.id = smt.material_id
         WHERE smt.style_id = ?`
      )
      .bind(slot.styleId)
      .all<{ name: string; role: string }>();

    const elements = await db
      .prepare(
        `SELECT de.name, sde.requirement FROM style_design_elements sde
         JOIN design_elements de ON de.id = sde.design_element_id
         WHERE sde.style_id = ?
         ORDER BY CASE sde.requirement WHEN 'required' THEN 0 ELSE 1 END, de.category`
      )
      .bind(slot.styleId)
      .all<{ name: string; requirement: string }>();

    const matRows = materials.results ?? [];
    const elRows = elements.results ?? [];
    const byRole = (role: string) => matRows.filter((m) => m.role === role).map((m) => m.name);
    const required = elRows.filter((e) => e.requirement === "required").map((e) => e.name);
    const optional = elRows.filter((e) => e.requirement === "optional").map((e) => e.name);

    const styleName = style?.name ?? slot.styleName;

    const parts: string[] = [];

    parts.push(
      `RESTYLE THE HOUSE IN THIS PHOTOGRAPH INTO ${styleName.toUpperCase()}. This is a retexture of one specific real house, not a new design — the same building must be recognisable in the result.`
    );

    parts.push(
      `TARGET STYLE: ${styleName}${style?.family ? ` (${style.family} family)` : ""}\n${
        style?.description ?? "No catalog description available for this style."
      }`
    );

    parts.push(`MUST NOT CHANGE — the existing structure, exactly as photographed:\n${structureLines(structure).join("\n")}
- Camera position, angle, focal length, framing and distance from the house.
- Everything around the house: neighbouring buildings, driveway, street, sidewalk, fencing, grade and any mature trees.`);

    const changeLines: string[] = [];
    if (byRole("primary").length > 0) {
      changeLines.push(`- Primary cladding and wall material: ${byRole("primary").join(", ")}.`);
    }
    if (byRole("accent").length > 0) changeLines.push(`- Accent materials: ${byRole("accent").join(", ")}.`);
    if (byRole("trim").length > 0) changeLines.push(`- Trim materials: ${byRole("trim").join(", ")}.`);
    if (required.length > 0) {
      changeLines.push(`- Defining details this style requires: ${required.join(", ")}.`);
    }
    if (optional.length > 0) {
      changeLines.push(`- Optional period-correct details, where they fit the existing structure: ${optional.join(", ")}.`);
    }
    changeLines.push(
      `- Colour palette, surface texture, window muntin pattern, door design, shutters, railings, porch detailing, light fixtures and house numbers — all restyled to ${styleName}.`
    );
    changeLines.push(
      "- Planting and beds may be refreshed to suit the style, but do not relocate hardscape or remove established trees."
    );

    parts.push(
      `WHAT TO CHANGE — apply ${styleName} as a surface and detail renovation only:\n${changeLines.join("\n")}`
    );

    if (detectedNames.length > 0) {
      parts.push(
        `ALREADY PRESENT ON THIS HOUSE (detected from the photo — where any of these conflict with ${styleName}, replace them with the style's equivalent rather than leaving them mixed):\n${detectedNames.join(", ")}.`
      );
    }

    if (slot.tier === "premium" && slot.customText) {
      parts.push(
        `CUSTOMER'S OWN REQUEST (premium tier — honour this alongside the style direction above; where it conflicts with the style, the customer's request wins, but it never overrides the structural constraints):\n${slot.customText}`
      );
    }

    const extras = extrasSection(slot);
    if (extras) parts.push(extras);

    parts.push(
      "OUTPUT: a single photorealistic architectural exterior photograph of this same house, shot from the same camera position as the source image, sharp detail, realistic materials and lighting, no people, no text, no watermark."
    );

    built.push({
      orderItemId: slot.orderItemId,
      styleId: slot.styleId,
      styleName,
      tier: slot.tier,
      assembledPrompt: parts.join("\n\n"),
      negativePrompt: NEGATIVE_PROMPT,
      templateVersion: PROMPT_TEMPLATE_VERSION,
    });
  }

  return built;
}
