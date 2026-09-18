// Assembles the image-generation instruction for one ordered render.
//
// Deterministic template fill, not an AI call. Everything it interpolates
// already exists in the catalog the Python pipeline seeded: the style's
// typical materials (style_materials_typical), its required design
// elements (style_design_elements), and the house's own measured
// structure profile.
//
// THE GOVERNING LESSON (2026-09-17, from the first real render):
// an image model treats anything not explicitly protected as fair game.
// The first version of this template protected the building's geometry
// and little else, and the result came back with the driveway and fence
// altered, the gutters and downspouts deleted, and the first-storey brick
// re-clad in siding. None of that was "wrong" against that prompt — it
// simply had not been forbidden.
//
// So protection here is exhaustive and organised by category, the
// may-change list is deliberately narrow and closed, and there is a
// catch-all rule: if applying a style feature would require touching
// anything protected, the feature is dropped rather than the protection.
// When a render comes back wrong, the fix belongs in the relevant
// constraint section — not in a revision request, and not in the
// operator's memory.

export const PROMPT_TEMPLATE_VERSION = "rpv-retexture-v4";

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
  // geometry
  "different house",
  "changed footprint",
  "added storey",
  "removed storey",
  "moved windows",
  "resized windows",
  "enlarged window",
  "shrunken window",
  "changed window proportions",
  "regularised windows",
  "evenly spaced windows",
  "moved doors",
  "merged front doors",
  "removed second door",
  "single door replacing two",
  "missing entrance",
  "added window",
  "added door",
  "simplified facade",
  "changed roof pitch",
  "changed roofline",
  "new addition",
  // materials that must survive
  "brick replaced with siding",
  "stone replaced with siding",
  "masonry re-clad",
  "painted over brick",
  // building hardware
  "missing gutters",
  "missing downspouts",
  "removed vents",
  "removed utility meter",
  // site
  "changed driveway",
  "repaved driveway",
  "changed walkway",
  "changed fence",
  "removed fence",
  "new landscaping",
  "removed trees",
  "changed neighbouring houses",
  // framing
  "different camera angle",
  "different perspective",
  "zoomed in",
  "zoomed out",
  "cropped differently",
  "different aspect ratio",
  // rendering quality
  "cartoon",
  "illustration",
  "painting",
  "sketch",
  "distorted proportions",
  "warped straight lines",
  "people",
  "text",
  "watermark",
  "signature",
].join(", ");

function structureLines(s: StructureFacts | null): string[] {
  if (!s) {
    return [
      "   - No structural analysis was run on this property. Treat EVERY structural feature visible in the photo as fixed: footprint, storey count, roofline and pitch, every window and door opening, porch, garage, chimney and foundation height.",
    ];
  }

  const lines = [
    `   - Building type and massing: ${s.house_type}, ${s.massing_envelope}. Footprint and overall silhouette identical.`,
  ];
  if (s.storey_count) lines.push(`   - Storey count: ${s.storey_count}. Do not add or remove floors.`);
  if (s.roof_form || s.roof_pitch_bucket) {
    const pitch = s.roof_pitch_bucket ? PITCH_LABELS[s.roof_pitch_bucket] ?? s.roof_pitch_bucket : null;
    lines.push(
      `   - Roof: ${[s.roof_form ? `${s.roof_form} form` : null, pitch ? `${pitch} pitch` : null]
        .filter(Boolean)
        .join(", ")}. Same roof geometry, ridge lines, eave overhangs and rake lines.`
    );
  }
  if (s.symmetry_axis) lines.push(`   - Facade symmetry: ${s.symmetry_axis}. Preserve exactly.`);
  if (s.window_ratio_bucket) {
    lines.push(
      `   - Glazing: ${WINDOW_RATIO_LABELS[s.window_ratio_bucket] ?? s.window_ratio_bucket}. Every opening keeps its existing position, size, proportion and operation.`
    );
  }
  if (s.foundation_visibility) {
    lines.push(`   - Foundation visibility: ${s.foundation_visibility}. Same height above grade.`);
  }
  if (s.chimney_placement) lines.push(`   - Chimney: ${s.chimney_placement}. Same position, height and count.`);
  if (s.facade_width_ft) {
    lines.push(`   - Facade width: approximately ${s.facade_width_ft} ft. Do not widen or narrow the house.`);
  }
  return lines;
}

// Night and seasonal renders are the one sanctioned exception to "same
// light, same season" — so the constraint has to say so, or the model is
// being handed a direct contradiction.
function hasVariant(slot: PromptSlot): boolean {
  return Boolean(slot.night || slot.seasonal || slot.holiday);
}

function variantSection(slot: PromptSlot): string {
  const blocks: string[] = [];
  if (slot.night) {
    blocks.push(
      "- NIGHT VIEW: render at dusk under a deep blue evening sky, with warm interior light in the windows and tasteful exterior architectural lighting (path, facade wash, porch fixtures). This overrides the daylight/time-of-day constraint ONLY. Camera, building, hardscape and landscape are still fixed."
    );
  }
  if (slot.seasonal) {
    blocks.push(
      `- SEASONAL: depict the property in ${slot.seasonChoice ?? "the requested season"}. Foliage state, ground cover, light quality and sky may change to match. This overrides the season constraint ONLY — trees, beds and hardscape keep their existing positions, shapes and extents; nothing is added or removed.`
    );
  }
  if (slot.holiday) {
    blocks.push(
      `- HOLIDAY DECOR: add tasteful ${slot.holidayChoice ?? "seasonal"} decoration — exterior lighting, wreaths, garland, door dressing. Decoration is temporary dressing laid over the house: it must not hide, replace or alter any architecture, hardware or planting beneath it.`
    );
  }
  return blocks.join("\n");
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
    const variants = variantSection(slot);

    const parts: string[] = [];

    parts.push(
      `TASK: Restyle the exterior surfaces of the house in this photograph into ${styleName.toUpperCase()}. This is a surface retexture of one specific real house, photographed as it exists today. The same building, on the same site, must be immediately recognisable in the result. You are redecorating it, not redesigning or rebuilding it.

BEFORE YOU START, read the photograph and note: how many exterior doors it has, how many windows, and where each one sits. The result must match those counts and positions exactly. Most failures of this task come from quietly simplifying the building — merging two entrances into one, evening up windows that are genuinely uneven, or deleting something half-hidden. Reproduce the building as it is, awkwardness included.`
    );

    parts.push(
      `TARGET STYLE: ${styleName}${style?.family ? ` (${style.family} family)` : ""}\n${
        style?.description ?? "No catalog description available for this style."
      }`
    );

    parts.push(
      `ABSOLUTE CONSTRAINTS — everything in this section must come through unchanged. These outrank the style direction in every case.

1. FRAMING AND OUTPUT
   - Identical camera position, angle, height, focal length and distance.
   - Identical framing and crop: same aspect ratio, same composition, same amount of the scene visible. Do not zoom, pan, straighten, re-centre or recompose.
   - The output must align with the source photograph if the two were laid on top of each other.

2. BUILDING GEOMETRY
${structureLines(structure).join("\n")}
   - Porches, stoops, garages, bays, dormers and attached structures keep their existing positions, footprints and rooflines.

2a. OPENINGS — COUNT THEM, THEN REPRODUCE THEM EXACTLY
   - Count every door and every window visible in the photograph. The result must contain the SAME NUMBER of each, in the same places.
   - ENTRANCES: reproduce every exterior door. Many houses are duplexes or have a secondary entrance, and a second front door is often half-hidden behind a porch post, planting, a downpipe, a vehicle or deep shadow, or is foreshortened by the camera angle. A door that is hard to see is still a door. NEVER merge two entrances into one, remove one, or "tidy" a facade into a single-entry composition.
   - WINDOWS: each window keeps its exact width, height, sill height, head height and proportion. Do not enlarge, shrink, stretch, square up or re-proportion any window. A window that is smaller, narrower or oddly placed compared with its neighbours is a real feature of this building, not a defect to correct.
   - Do NOT regularise, align, balance or evenly space openings. Asymmetry and odd spacing are what make this house this house.
   - Nothing is added: no new windows, no new doors, no new dormers, no decorative openings the photograph does not already contain.

2b. PARTIALLY OBSCURED FEATURES ARE STILL THERE
   - Anything the photograph only partly shows — hidden behind a shrub, a car, a post, a shadow, or cut off at the frame edge — must still be present, in the same place, at the same size. Do not delete it, do not merge it into a neighbouring feature, and do not invent a cleaner arrangement in its place. When a feature is ambiguous, reproduce what is visible rather than resolving the ambiguity in favour of a tidier facade.

3. EXISTING MASONRY — NEVER RE-CLAD
   - Any brick, stone, block or other masonry visible on the house STAYS masonry, in the same place, over the same extent, in the same colour family. It is never replaced with siding, shingle, stucco, panel or board.
   - Where the house uses different materials on different storeys or wings (for example masonry on the first storey and siding above), that division line stays exactly where it is. Do not extend one material over the other.
   - Re-cladding masonry is a structural-scale renovation, not a restyle, and it is out of scope for this image no matter what the target style normally uses. The style's materials apply ONLY to surfaces that are already non-masonry.

4. BUILDING HARDWARE AND FUNCTIONAL ELEMENTS — all present, all in place
   - Gutters, downspouts, leader boxes, drip edge and flashing: same number, same runs, same positions. These are never removed or hidden.
   - Roof vents, ridge vents, plumbing stacks, attic vents, chimney caps.
   - Electric meter, service mast and drop, utility boxes, hose bibs, AC condenser and its pad, satellite dish, exterior outlets.
   - Steps, stair treads, handrails and railings keep their existing positions and geometry.

5. SITE AND HARDSCAPE — outside the building's walls, nothing changes at all
   - Driveway: same material, colour, shape, width, extent, joints and staining.
   - Walkways, paths, front steps, patios, porches at grade: unchanged.
   - Fencing and gates: same material, height, style, colour and line. Retaining walls, curbs and edging: unchanged.
   - Mailbox, lamp posts, freestanding house numbers, utility poles, guy wires, drains and grates: unchanged.

6. LANDSCAPE AND SURROUNDINGS
   - Every tree, shrub, hedge, planting bed, lawn area, mulch line and ground cover keeps its existing position, size, shape and species. Nothing is added, removed, moved or "tidied".
   - Neighbouring houses, the street, kerb, sidewalk, parked vehicles, power lines, terrain and grade: unchanged.
   - Sky, weather, season, time of day, light direction and shadow geometry: unchanged${
     hasVariant(slot) ? ", except where a VARIANT instruction below explicitly overrides it" : ""
   }.

7. THE OVERRIDE RULE
   - If applying any feature of ${styleName} would require moving a wall, changing an opening, altering the roofline, re-cladding masonry, or touching anything in sections 4, 5 or 6 — DO NOT APPLY THAT FEATURE. Omit it silently and restyle what you legitimately can. A partially-styled house that matches the photograph is correct; a fully-styled house that has changed the property is wrong.`
    );

    const changeLines: string[] = [];
    if (byRole("primary").length > 0) {
      changeLines.push(
        `   - Wall cladding on NON-MASONRY surfaces only: ${byRole("primary").join(", ")}.`
      );
    }
    if (byRole("accent").length > 0) changeLines.push(`   - Accent materials: ${byRole("accent").join(", ")}.`);
    if (byRole("trim").length > 0) changeLines.push(`   - Trim materials: ${byRole("trim").join(", ")}.`);
    changeLines.push(
      "   - Paint, stain and finish colours on siding, trim, fascia, soffit, front door, garage door and shutters."
    );
    changeLines.push(
      "   - Window and door STYLING only: muntin/grille pattern, sash detailing, panel profile, hardware and surround trim. The opening itself never changes."
    );
    changeLines.push(
      "   - Shutters, porch column and railing profiles within the porch's existing footprint, and trim detailing applied to surfaces that already exist."
    );
    changeLines.push("   - Roofing material and colour on the existing roof planes, keeping the same geometry.");
    changeLines.push("   - Light fixtures and house numbers mounted on the building.");
    if (required.length > 0) {
      changeLines.push(
        `   - Details this style requires, applied only where they attach to existing surfaces without violating any constraint above: ${required.join(", ")}.`
      );
    }
    if (optional.length > 0) {
      changeLines.push(
        `   - Optional period-correct details, same condition: ${optional.join(", ")}.`
      );
    }

    parts.push(
      `WHAT MAY CHANGE — this list is closed. Anything not named here stays as photographed.\n${changeLines.join("\n")}`
    );

    if (detectedNames.length > 0) {
      parts.push(
        `EXISTING CHARACTER DETECTED ON THIS HOUSE (context, not a to-do list — these describe what is there now; protect anything covered by the constraints above and restyle only what section "WHAT MAY CHANGE" permits):\n${detectedNames.join(", ")}.`
      );
    }

    if (slot.tier === "premium" && slot.customText) {
      parts.push(
        `CUSTOMER'S OWN REQUEST (premium tier — honour this alongside the style direction; where it conflicts with the style, the customer wins. It NEVER overrides the ABSOLUTE CONSTRAINTS — if the request cannot be satisfied within them, apply the part that can be):\n${slot.customText}`
      );
    }

    if (variants) parts.push(`VARIANT INSTRUCTIONS\n${variants}`);

    parts.push(
      "OUTPUT: a single photorealistic architectural exterior photograph of this same house on this same site, from the same camera position and with the same framing and aspect ratio as the source image. Sharp detail, realistic materials, physically consistent lighting. No people, no text, no watermark."
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
