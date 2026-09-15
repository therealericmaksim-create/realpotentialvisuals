// Resolves a property's IECC climate zone from its street address, via the
// zip_climate_zones table (see realpotential-schema.sql for provenance —
// built from HUD's ZIP-county crosswalk + PNNL/DOE's county zone table).

export function extractZip(address: string): string | null {
  const match = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

export async function resolveClimateZoneId(
  db: D1Database,
  propertyAddress: string
): Promise<{ climateZoneId: string; zip: string } | null> {
  const zip = extractZip(propertyAddress);
  if (!zip) return null;

  const row = await db
    .prepare(`SELECT climate_zone_id FROM zip_climate_zones WHERE zip5 = ?`)
    .bind(zip)
    .first<{ climate_zone_id: string }>();

  return row ? { climateZoneId: row.climate_zone_id, zip } : null;
}
