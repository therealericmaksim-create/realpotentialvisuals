// The evidence bundle for one job: the property, its photo, the ordered
// curated/premium render slots, and everything the analysis pipeline
// produced about the house. Shared by the QC workspace and the Production
// workspace, which deliberately show identical context — each stage is
// re-checking the previous one's work, which only means something if both
// are looking at the same information.

export type WorkspaceSlot = {
  id: string;
  order_id: string;
  tier: string;
  stage: string;
  style_id: string | null;
  style_name: string;
  custom_text: string | null;
  qc_denied_reason: string | null;
  qc_denied_style: string | null;
  night: number;
  seasonal: number;
  season_choice: string | null;
  holiday: number;
  holiday_choice: string | null;
  breakdown: number;
};

export type JobWorkspace = {
  job: {
    id: string;
    propertyId: string;
    propertyAddress: string;
    curbappealPhotoKey: string | null;
  };
  slots: WorkspaceSlot[];
  analysis: {
    structure_profile_id: string;
    house_type: string;
    roof_form: string;
    massing_envelope: string;
  } | null;
  topMatches: { name: string; combined_score_pct: number; fit_tier: string }[];
  curationRanks: { rank: number; style_name: string; reasoning: string }[];
  regulatory: {
    zoning_district: string | null;
    historic_overlay: number | null;
    flood_zone: string | null;
    summary: string;
  } | null;
  neighborhood: { style_read: string; homes_visible: number; street_view_key: string | null } | null;
};

// `stages` narrows the slots to the ones a given queue cares about — the
// QC workspace should not show renders that are still being curated, and
// production should not show renders QC hasn't cleared. Omit it to load
// every render on the job.
export async function loadJobWorkspace(
  db: D1Database,
  jobId: string,
  stages?: readonly string[]
): Promise<JobWorkspace | null> {
  const job = await db
    .prepare(
      `SELECT j.id, p.id as property_id, p.address as property_address
       FROM jobs j JOIN properties p ON p.id = j.property_id WHERE j.id = ?`
    )
    .bind(jobId)
    .first<{ id: string; property_id: string; property_address: string }>();

  if (!job) return null;

  const photoRow = await db
    .prepare(
      `SELECT curbappeal_photo_key FROM orders
       WHERE job_id = ? AND curbappeal_photo_key IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(jobId)
    .first<{ curbappeal_photo_key: string }>();

  const stageFilter =
    stages && stages.length > 0
      ? ` AND oi.stage IN (${stages.map(() => "?").join(",")})`
      : "";

  const slots = await db
    .prepare(
      `SELECT oi.id, oi.order_id, oi.tier, oi.stage, oi.style_id, oi.style_name,
              oi.custom_text, oi.qc_denied_reason, oi.qc_denied_style,
              oi.night, oi.seasonal, oi.season_choice, oi.holiday, oi.holiday_choice, oi.breakdown
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.job_id = ?${stageFilter}
       ORDER BY oi.rowid ASC`
    )
    .bind(jobId, ...(stages ?? []))
    .all<WorkspaceSlot>();

  const analysis = await db
    .prepare(
      `SELECT psa.structure_profile_id, sp.house_type, sp.roof_form, sp.massing_envelope
       FROM curbappeal_property_structure_analysis psa
       JOIN curbappeal_structure_profiles sp ON sp.id = psa.structure_profile_id
       WHERE psa.property_id = ?`
    )
    .bind(job.property_id)
    .first<{
      structure_profile_id: string;
      house_type: string;
      roof_form: string;
      massing_envelope: string;
    }>();

  const topMatches = analysis
    ? await db
        .prepare(
          `SELECT s.name, c.combined_score_pct, c.fit_tier
           FROM curbappeal_profile_style_compatibility c JOIN styles s ON s.id = c.style_id
           WHERE c.structure_profile_id = ? ORDER BY c.combined_score_pct DESC LIMIT 8`
        )
        .bind(analysis.structure_profile_id)
        .all<{ name: string; combined_score_pct: number; fit_tier: string }>()
    : null;

  const curationRanks = analysis
    ? await db
        .prepare(
          `SELECT rank, style_name, reasoning FROM curbappeal_structure_profile_curation_ranks
           WHERE structure_profile_id = ? ORDER BY rank ASC`
        )
        .bind(analysis.structure_profile_id)
        .all<{ rank: number; style_name: string; reasoning: string }>()
    : null;

  const regulatory = await db
    .prepare(
      `SELECT zoning_district, historic_overlay, flood_zone, summary
       FROM curbappeal_property_regulatory_lookups
       WHERE property_id = ? ORDER BY looked_up_at DESC LIMIT 1`
    )
    .bind(job.property_id)
    .first<{
      zoning_district: string | null;
      historic_overlay: number | null;
      flood_zone: string | null;
      summary: string;
    }>();

  const neighborhood = await db
    .prepare(
      `SELECT style_read, homes_visible, street_view_key
       FROM curbappeal_property_neighborhood_reads
       WHERE property_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .bind(job.property_id)
    .first<{ style_read: string; homes_visible: number; street_view_key: string | null }>();

  return {
    job: {
      id: job.id,
      propertyId: job.property_id,
      propertyAddress: job.property_address,
      curbappealPhotoKey: photoRow?.curbappeal_photo_key ?? null,
    },
    slots: slots.results ?? [],
    analysis,
    topMatches: topMatches?.results ?? [],
    curationRanks: curationRanks?.results ?? [],
    regulatory,
    neighborhood,
  };
}

// The render slots that actually have a style, in the shape the prompt
// builder wants.
export function promptSlotsFrom(slots: WorkspaceSlot[]) {
  return slots
    .filter((s): s is WorkspaceSlot & { style_id: string } => Boolean(s.style_id))
    .map((s) => ({
      orderItemId: s.id,
      tier: s.tier,
      styleId: s.style_id,
      styleName: s.style_name,
      customText: s.custom_text,
      night: s.night,
      seasonal: s.seasonal,
      seasonChoice: s.season_choice,
      holiday: s.holiday,
      holidayChoice: s.holiday_choice,
      breakdown: s.breakdown,
    }));
}
