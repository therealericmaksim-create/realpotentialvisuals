// Step 13: feasibility scoring. Deterministic — a lookup against the
// already-precomputed climate_material_feasibility cache (climate_zone x
// material), joined through a style's typical materials. No AI call.
// Worst-case across a style's materials wins (a style with one 'fail'
// material is flagged, even if its other materials are fine) since the
// point is warning about a real liability, not averaging it away.

export type FeasibilityResult = {
  result: "pass" | "conditional" | "fail";
  failingMaterials: string[];
};

export async function scoreStyleFeasibility(
  db: D1Database,
  climateZoneId: string,
  styleId: string
): Promise<FeasibilityResult> {
  const rows = await db
    .prepare(
      `SELECT m.name as material_name, cmf.result
       FROM style_materials_typical smt
       JOIN materials m ON m.id = smt.material_id
       LEFT JOIN climate_material_feasibility cmf
         ON cmf.material_id = smt.material_id AND cmf.climate_zone_id = ?
       WHERE smt.style_id = ?`
    )
    .bind(climateZoneId, styleId)
    .all<{ material_name: string; result: string | null }>();

  const materials = rows.results ?? [];
  const order: Record<string, number> = { pass: 0, conditional: 1, fail: 2 };
  let worst: "pass" | "conditional" | "fail" = "pass";
  const failingMaterials: string[] = [];

  for (const m of materials) {
    const result = (m.result ?? "pass") as "pass" | "conditional" | "fail";
    if (order[result] > order[worst]) worst = result;
    if (result === "fail" || result === "conditional") failingMaterials.push(m.material_name);
  }

  return { result: worst, failingMaterials };
}
