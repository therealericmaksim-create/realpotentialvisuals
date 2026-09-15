// Runs Phase 2 (Automation Routing Sheet steps 9-20) for one order, start
// to finish. Triggered only by the admin "Run Analysis" button
// (app/admin/orders/[id]/actions.ts) — never automatically on payment, so
// AI spend stays under staff control. ensurePropertyLinkage() is the part
// that DOES run automatically on payment (see the webhook/confirm routes)
// since it costs nothing and just gets the order ready for this to run.

import { imageUrlToDataUrl } from "./openaiClient";
import { resolveClimateZoneId } from "./climateZone";
import { analyzeStructure } from "./structureAnalysis";
import { detectDesignElements } from "./designElementDetection";
import { fetchStreetViewImage, readNeighborhood } from "./neighborhoodRead";
import { lookupRegulatory } from "./regulatoryLookup";
import { scoreStyleFeasibility } from "./feasibility";
import { castAiVote } from "./aiVote";
import {
  computeMatch,
  computeDesignElementScore,
  combineScores,
  computeTransformationDifficulty,
  deriveFitTier,
  type StructureProfile,
  type StyleStructuralRequirements,
  type ElementAttrs,
} from "./styleMatching";
import { computeVoterConsensus, type AlgorithmVoteRow, type AiVote as VoterAiVote } from "./voterBlend";
import type { AiCallLog } from "./aiLog";

export type Phase2RunResult = {
  orderId: string;
  propertyId: string;
  structureProfileId: string;
  reused: boolean;
  logs: AiCallLog[];
  totalCostUsd: number;
  // null when the order has no curated-tier render to judge — self_directed
  // (customer already picked their style) and premium (a custom request,
  // not matched against the catalog) don't need an AI vote or a
  // curator/algorithm consensus, so steps 18 and 20 are skipped entirely
  // rather than spending an AI call on a question nobody's asking.
  consensus: {
    primaryStyleId: string | null;
    primaryStyleName: string | null;
    secondaryStyleId: string | null;
    secondaryStyleName: string | null;
    classificationStatus: string;
  } | null;
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function runPhase2Analysis(
  env: {
    DB: D1Database;
    MEDIA: R2Bucket;
    OPENAI_API_KEY: string;
    GOOGLE_MAPS_API_KEY?: string;
  },
  orderId: string
): Promise<Phase2RunResult> {
  const logs: AiCallLog[] = [];

  const order = await env.DB.prepare(
    `SELECT o.id, o.curbappeal_photo_key, o.property_address, o.job_id, j.property_id
     FROM orders o LEFT JOIN jobs j ON j.id = o.job_id WHERE o.id = ?`
  )
    .bind(orderId)
    .first<{ id: string; curbappeal_photo_key: string; property_address: string; job_id: string | null; property_id: string | null }>();

  if (!order) throw new Error(`Order not found: ${orderId}`);
  if (!order.property_id) throw new Error(`Order has no linked property yet: ${orderId}`);
  if (!order.curbappeal_photo_key) throw new Error(`Order has no photo: ${orderId}`);

  // A curated-tier render is the only reason to run the AI vote / consensus
  // steps (18, 20) — self_directed already has its style, premium isn't
  // matched against the catalog at all. No order_items rows at all (e.g. a
  // pre-v0.10.0 legacy order) falls back to running the full pipeline,
  // matching the behavior every order had before tiers existed.
  const orderItemTiers = await env.DB.prepare(
    `SELECT tier FROM order_items WHERE order_id = ?`
  )
    .bind(orderId)
    .all<{ tier: string }>();
  const tierRows = orderItemTiers.results ?? [];
  const needsCuration = tierRows.length === 0 || tierRows.some((r) => r.tier === "curated");

  const zoneResolution = await resolveClimateZoneId(env.DB, order.property_address);
  if (!zoneResolution) {
    throw new Error(`Could not resolve a climate zone for address: ${order.property_address}`);
  }
  const climateZoneId = zoneResolution.climateZoneId;

  const photoDataUrl = await imageUrlToDataUrl(env.MEDIA, order.curbappeal_photo_key);

  // --- Step 9: structure analysis ---
  const { result: structure, log: structureLog } = await analyzeStructure(env.OPENAI_API_KEY, photoDataUrl);
  logs.push(structureLog);

  const hashInput = [
    structure.roof_pitch_bucket,
    structure.roof_form,
    structure.window_ratio_bucket,
    structure.foundation_visibility,
    structure.symmetry_axis,
    Math.round(structure.storey_count * 2) / 2,
    Math.round(structure.facade_width_ft / 5) * 5,
    climateZoneId,
  ].join("|");
  const hashKey = await sha256Hex(hashInput);

  let structureProfileId: string;
  let reused = false;
  const existingProfile = await env.DB.prepare(`SELECT id FROM curbappeal_structure_profiles WHERE hash_key = ?`)
    .bind(hashKey)
    .first<{ id: string }>();

  const now = new Date().toISOString();

  if (existingProfile) {
    structureProfileId = existingProfile.id;
    reused = true;
  } else {
    structureProfileId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO curbappeal_structure_profiles (
         id, hash_key, climate_zone_id, house_type, roof_pitch_bucket, roof_form,
         massing_envelope, symmetry_axis, window_ratio_bucket, foundation_visibility,
         storey_count, facade_width_ft, chimney_placement, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        structureProfileId,
        hashKey,
        climateZoneId,
        structure.house_type,
        structure.roof_pitch_bucket,
        structure.roof_form,
        structure.massing_envelope,
        structure.symmetry_axis,
        structure.window_ratio_bucket,
        structure.foundation_visibility,
        structure.storey_count,
        structure.facade_width_ft,
        structure.chimney_placement,
        now
      )
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO curbappeal_property_structure_analysis (
       id, property_id, house_type, roof_pitch_deg, foundation_visibility,
       massing_envelope, storey_count, facade_width_ft, chimney_placement,
       symmetry_axis, structure_profile_id, confidence_flag, analyzed_at
     ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'full', ?)
     ON CONFLICT(property_id) DO UPDATE SET
       house_type = excluded.house_type, structure_profile_id = excluded.structure_profile_id,
       analyzed_at = excluded.analyzed_at`
  )
    .bind(
      crypto.randomUUID(),
      order.property_id,
      structure.house_type,
      structure.foundation_visibility,
      structure.massing_envelope,
      structure.storey_count,
      structure.facade_width_ft,
      structure.chimney_placement,
      structure.symmetry_axis,
      structureProfileId,
      now
    )
    .run();

  // --- Step 10: design-element detection ---
  const allElements = await env.DB.prepare(`SELECT id, category, slug, name FROM design_elements`).all<{
    id: string;
    category: string;
    slug: string;
    name: string;
  }>();
  const elementsBySlug = new Map((allElements.results ?? []).map((e) => [e.slug, e]));

  const { detections, log: detectionLog } = await detectDesignElements(
    env.OPENAI_API_KEY,
    photoDataUrl,
    allElements.results ?? []
  );
  logs.push(detectionLog);

  const detectedSlugs = new Set<string>();
  for (const d of detections) {
    const el = elementsBySlug.get(d.design_element_slug);
    if (!el) continue; // model hallucinated a slug that doesn't exist -- skip rather than guess
    detectedSlugs.add(d.design_element_slug);
    await env.DB.prepare(
      `INSERT INTO curbappeal_structure_profile_design_elements (id, structure_profile_id, design_element_id, confidence)
       VALUES (?, ?, ?, ?) ON CONFLICT(structure_profile_id, design_element_id) DO UPDATE SET confidence = excluded.confidence`
    )
      .bind(crypto.randomUUID(), structureProfileId, el.id, d.confidence)
      .run();
  }

  // --- Step 11: neighborhood read ---
  if (env.GOOGLE_MAPS_API_KEY) {
    try {
      const streetViewBytes = await fetchStreetViewImage(env.GOOGLE_MAPS_API_KEY, order.property_address);
      const { result: neighborhood, imageKey, log: neighborhoodLog } = await readNeighborhood(
        env.OPENAI_API_KEY,
        env.MEDIA,
        streetViewBytes
      );
      logs.push(neighborhoodLog);
      await env.DB.prepare(
        `INSERT INTO curbappeal_property_neighborhood_reads (id, property_id, street_view_key, style_read, homes_visible, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(crypto.randomUUID(), order.property_id, imageKey, neighborhood.style_read, neighborhood.homes_visible ? 1 : 0, now)
        .run();
    } catch {
      // Street View can fail for addresses with no coverage -- non-fatal,
      // the rest of the pipeline doesn't depend on this step.
    }
  }

  // --- Step 12: regulatory lookup ---
  const { result: regulatory, logs: regulatoryLogs } = await lookupRegulatory(env.OPENAI_API_KEY, order.property_address);
  logs.push(...regulatoryLogs);
  await env.DB.prepare(
    `INSERT INTO curbappeal_property_regulatory_lookups (id, property_id, zoning_district, historic_overlay, flood_zone, summary, citations_json, looked_up_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      order.property_id,
      regulatory.zoningDistrict,
      regulatory.historicOverlay === null ? null : regulatory.historicOverlay ? 1 : 0,
      regulatory.floodZone,
      regulatory.summary,
      JSON.stringify(regulatory.citations),
      now
    )
    .run();
  await env.DB.prepare(
    `UPDATE properties SET zoning_district = ?, historic_overlay = ?, flood_zone = ?, climate_zone_id = ? WHERE id = ?`
  )
    .bind(
      regulatory.zoningDistrict,
      regulatory.historicOverlay === null ? null : regulatory.historicOverlay ? 1 : 0,
      regulatory.floodZone,
      climateZoneId,
      order.property_id
    )
    .run();

  // --- Steps 13-17: feasibility + matching + difficulty, all 133 styles ---
  const styleRows = await env.DB.prepare(
    `SELECT s.id, s.name, s.family, r.massing_envelope, r.roof_pitch_min_deg, r.roof_pitch_max_deg,
            r.roof_form, r.symmetry_axis_required, r.min_facade_width_ft, r.foundation_visibility_req,
            r.window_ratio_min, r.window_ratio_max, r.storey_count_min, r.storey_count_max
     FROM styles s JOIN style_structural_requirements r ON r.style_id = s.id`
  ).all<{
    id: string;
    name: string;
    family: string;
    massing_envelope: string;
    roof_pitch_min_deg: number | null;
    roof_pitch_max_deg: number | null;
    roof_form: string | null;
    symmetry_axis_required: number;
    min_facade_width_ft: number | null;
    foundation_visibility_req: string | null;
    window_ratio_min: number | null;
    window_ratio_max: number | null;
    storey_count_min: number | null;
    storey_count_max: number | null;
  }>();

  const sdeRows = await env.DB.prepare(
    `SELECT sde.style_id, de.slug, sde.requirement FROM style_design_elements sde JOIN design_elements de ON de.id = sde.design_element_id`
  ).all<{ style_id: string; slug: string; requirement: string }>();
  const requiredByStyle = new Map<string, Set<string>>();
  const optionalByStyle = new Map<string, Set<string>>();
  for (const row of sdeRows.results ?? []) {
    const target = row.requirement === "required" ? requiredByStyle : optionalByStyle;
    if (!target.has(row.style_id)) target.set(row.style_id, new Set());
    target.get(row.style_id)!.add(row.slug);
  }

  const attrRows = await env.DB.prepare(
    `SELECT de.slug, dea.structural_or_applied, dea.requires_framing_change, dea.requires_load_path, dea.labour_intensity
     FROM design_element_attributes dea JOIN design_elements de ON de.id = dea.design_element_id`
  ).all<{
    slug: string;
    structural_or_applied: "structural" | "applied";
    requires_framing_change: number;
    requires_load_path: number;
    labour_intensity: "low" | "medium" | "high";
  }>();
  const elementAttrs: Record<string, ElementAttrs> = {};
  for (const row of attrRows.results ?? []) {
    elementAttrs[row.slug] = {
      structuralOrApplied: row.structural_or_applied,
      requiresFramingChange: !!row.requires_framing_change,
      requiresLoadPath: !!row.requires_load_path,
      labourIntensity: row.labour_intensity,
    };
  }

  const profile: StructureProfile = {
    massingEnvelope: structure.massing_envelope,
    symmetryAxis: structure.symmetry_axis,
    foundationVisibility: structure.foundation_visibility as StructureProfile["foundationVisibility"],
    roofPitchBucket: structure.roof_pitch_bucket as StructureProfile["roofPitchBucket"],
    windowRatioBucket: structure.window_ratio_bucket as StructureProfile["windowRatioBucket"],
    roofForm: structure.roof_form,
    storeyCount: structure.storey_count,
    facadeWidthFt: structure.facade_width_ft,
  };

  const algoRows: AlgorithmVoteRow[] = [];
  const compatRowsSql: string[] = [];
  const styleFamilyById: Record<string, string> = {};

  for (const style of styleRows.results ?? []) {
    styleFamilyById[style.id] = style.family;
    const req: StyleStructuralRequirements = {
      name: style.name,
      massingEnvelope: style.massing_envelope,
      roofPitchMinDeg: style.roof_pitch_min_deg,
      roofPitchMaxDeg: style.roof_pitch_max_deg,
      roofForm: style.roof_form,
      symmetryAxisRequired: !!style.symmetry_axis_required,
      minFacadeWidthFt: style.min_facade_width_ft,
      foundationVisibilityReq: style.foundation_visibility_req,
      windowRatioMin: style.window_ratio_min,
      windowRatioMax: style.window_ratio_max,
      storeyCountMin: style.storey_count_min,
      storeyCountMax: style.storey_count_max,
    };

    const structural = computeMatch(profile, req);
    const required = requiredByStyle.get(style.id) ?? new Set<string>();
    const optional = optionalByStyle.get(style.id) ?? new Set<string>();
    const de = computeDesignElementScore(detectedSlugs, required, optional);
    const combined = combineScores(structural.scorePct, de.scorePct, de.confidence);
    const fitTier = deriveFitTier(combined);
    const difficulty = computeTransformationDifficulty(detectedSlugs, required, elementAttrs);
    const feasibility = await scoreStyleFeasibility(env.DB, climateZoneId, style.id);

    algoRows.push({ styleId: style.id, combinedScorePct: combined });

    const notesWithFeasibility =
      feasibility.result !== "pass"
        ? [...structural.notes, `feasibility: ${feasibility.result} (${feasibility.failingMaterials.join(", ")})`]
        : structural.notes;

    compatRowsSql.push(
      `('${crypto.randomUUID()}','${structureProfileId}','${style.id}',${structural.scorePct},${de.scorePct ?? "NULL"},` +
        `${de.matchedRequired},${de.totalRequired},${de.matchedOptional},${de.totalOptional},${combined},'${fitTier}',` +
        `${difficulty.structuralDifficultyPct},${difficulty.decorativeDifficultyPct},` +
        `'${JSON.stringify(notesWithFeasibility).replace(/'/g, "''")}','${now}')`
    );
  }

  const CHUNK = 25;
  for (let i = 0; i < compatRowsSql.length; i += CHUNK) {
    const chunk = compatRowsSql.slice(i, i + CHUNK);
    await env.DB.prepare(
      `INSERT INTO curbappeal_profile_style_compatibility (
         id, structure_profile_id, style_id, match_score_pct, design_element_score_pct,
         design_element_matched_required, design_element_total_required,
         design_element_matched_optional, design_element_total_optional,
         combined_score_pct, fit_tier, structural_difficulty_pct, decorative_difficulty_pct,
         failing_elements, computed_at
       ) VALUES ${chunk.join(",")}
       ON CONFLICT(structure_profile_id, style_id) DO UPDATE SET
         match_score_pct = excluded.match_score_pct, combined_score_pct = excluded.combined_score_pct,
         fit_tier = excluded.fit_tier, computed_at = excluded.computed_at`
    ).run();
  }

  const styleNameById = new Map((styleRows.results ?? []).map((s) => [s.id, s.name]));

  let consensusResult: Phase2RunResult["consensus"] = null;

  if (needsCuration) {
    // --- Step 18: AI vote ---
    const styleIdByName = new Map((styleRows.results ?? []).map((s) => [s.name, s.id]));
    const { result: vote, log: voteLog } = await castAiVote(
      env.OPENAI_API_KEY,
      photoDataUrl,
      [...styleNameById.values()]
    );
    logs.push(voteLog);

    const aiVotes: VoterAiVote[] = [];
    const primaryStyleId = styleIdByName.get(vote.primary_style);
    if (primaryStyleId) {
      aiVotes.push({ styleId: primaryStyleId, voteRank: 1, confidence: vote.primary_confidence, reasoning: vote.primary_reasoning });
      await env.DB.prepare(
        `INSERT INTO curbappeal_structure_profile_style_votes (id, structure_profile_id, voter_type, style_id, vote_rank, confidence, is_abstain, reasoning, voted_at)
         VALUES (?, ?, 'ai', ?, 1, ?, 0, ?, ?)
         ON CONFLICT(structure_profile_id, voter_type, vote_rank) DO UPDATE SET style_id = excluded.style_id, confidence = excluded.confidence`
      )
        .bind(crypto.randomUUID(), structureProfileId, primaryStyleId, vote.primary_confidence, vote.primary_reasoning, now)
        .run();
    }
    const secondaryStyleId = vote.secondary_style ? styleIdByName.get(vote.secondary_style) : null;
    if (secondaryStyleId) {
      aiVotes.push({ styleId: secondaryStyleId, voteRank: 2, confidence: vote.secondary_confidence });
      await env.DB.prepare(
        `INSERT INTO curbappeal_structure_profile_style_votes (id, structure_profile_id, voter_type, style_id, vote_rank, confidence, is_abstain, voted_at)
         VALUES (?, ?, 'ai', ?, 2, ?, 0, ?)
         ON CONFLICT(structure_profile_id, voter_type, vote_rank) DO UPDATE SET style_id = excluded.style_id, confidence = excluded.confidence`
      )
        .bind(crypto.randomUUID(), structureProfileId, secondaryStyleId, vote.secondary_confidence, now)
        .run();
    }

    // --- Step 20: 2-voter blend ---
    const consensus = computeVoterConsensus(algoRows, aiVotes, styleFamilyById);
    await env.DB.prepare(
      `INSERT INTO curbappeal_structure_profile_consensus (
         id, structure_profile_id, primary_style_id, primary_score_pct, secondary_style_id, secondary_score_pct,
         classification_status, ai_dissented, dissent_reasoning, voter_weights_used, computed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(structure_profile_id) DO UPDATE SET
         primary_style_id = excluded.primary_style_id, primary_score_pct = excluded.primary_score_pct,
         secondary_style_id = excluded.secondary_style_id, secondary_score_pct = excluded.secondary_score_pct,
         classification_status = excluded.classification_status, computed_at = excluded.computed_at`
    )
      .bind(
        crypto.randomUUID(),
        structureProfileId,
        consensus.primaryStyleId,
        consensus.primaryScorePct,
        consensus.secondaryStyleId,
        consensus.secondaryScorePct,
        consensus.classificationStatus,
        consensus.aiDissented ? 1 : 0,
        consensus.dissentReasoning,
        JSON.stringify(consensus.voterWeightsUsed),
        now
      )
      .run();

    consensusResult = {
      primaryStyleId: consensus.primaryStyleId,
      primaryStyleName: consensus.primaryStyleId ? (styleNameById.get(consensus.primaryStyleId) ?? null) : null,
      secondaryStyleId: consensus.secondaryStyleId,
      secondaryStyleName: consensus.secondaryStyleId ? (styleNameById.get(consensus.secondaryStyleId) ?? null) : null,
      classificationStatus: consensus.classificationStatus,
    };
  }

  return {
    orderId,
    propertyId: order.property_id,
    structureProfileId,
    reused,
    logs,
    totalCostUsd: logs.reduce((sum, l) => sum + l.costUsd, 0),
    consensus: consensusResult,
  };
}
