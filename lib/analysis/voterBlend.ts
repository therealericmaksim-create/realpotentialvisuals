// Faithful TS port of ../../../Claude Code/pipeline/compute_voter_consensus.py's
// voter-blend mechanics -- ADAPTED from 3 voters to 2. The Python source
// blends AI (0.40) + algorithm (0.35) + customer (0.25); this app has no
// customer/curator vote feeding the blend (a curator now reviews the blended
// output afterward instead of voting into it), so this port rewires the
// weights to exactly 0.5 / 0.5 (AI / algorithm) and removes the customer-vote
// and abstain-redistribution logic entirely. The AI sparse-vote splitting,
// the dense algorithm distribution, and the classification_status
// (clear_match / blended / unknown) derivation are otherwise unchanged from
// the source -- do not re-tune the thresholds below without re-validating
// against the pipeline's spot-check set.
//
// Pure function only: no D1, no fetch. The Python original queries sqlite
// directly for styles.family (twice) and for the AI voter's own reasoning
// row; both are replaced here with plain arguments the caller resolves first
// (styleFamilyById, and a `reasoning` field on each AiVote).

export const AI_WEIGHT = 0.5;
export const ALGORITHM_WEIGHT = 0.5;

// How AI's own confidence splits across its primary/secondary pick.
export const AI_PRIMARY_SHARE = 0.8;
export const AI_SECONDARY_SHARE = 0.2;

export const UNKNOWN_THRESHOLD = 25.0; // blended top score below this -> 'unknown'
export const BLENDED_GAP_PCT = 8.0; // top-2 within this many points, different families -> 'blended'

export type ClassificationStatus = "unknown" | "blended" | "clear_match";

// The algorithm's vote is dense (all styles scored) -- one row per style read
// directly from curbappeal_profile_style_compatibility.combined_score_pct.
export type AlgorithmVoteRow = {
  styleId: string;
  combinedScorePct: number;
};

// The AI's vote is sparse -- 1-2 rows (a primary pick and an optional
// secondary), each with a confidence. reasoning is carried on the row so
// dissent_reasoning can be resolved without a separate DB query.
export type AiVote = {
  styleId: string;
  voteRank: 1 | 2;
  confidence: number | null;
  reasoning?: string | null;
};

export type ConsensusResult = {
  primaryStyleId: string | null;
  primaryScorePct: number | null;
  secondaryStyleId: string | null;
  secondaryScorePct: number | null;
  classificationStatus: ClassificationStatus;
  aiDissented: boolean;
  dissentReasoning: string | null;
  voterWeightsUsed: { ai: number; algorithm: number };
  ranked: Array<[string, number]>;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Blends the AI voter's sparse distribution and the algorithm's dense
 * distribution into one consensus per structure_profile. Does not write to
 * the db -- the caller persists the result, same pattern as the rest of the
 * pipeline this was ported from.
 *
 * algoRows: every curbappeal_profile_style_compatibility row with a non-null
 * combined_score_pct for this profile, already fetched.
 * aiVotes: the AI voter's 1-2 rows for this profile, already fetched.
 * styleFamilyById: styles.family for whichever style ids show up in the top 2
 * of the blended ranking, already fetched -- only used for the
 * clear_match/blended family-difference check.
 */
export function computeVoterConsensus(
  algoRows: AlgorithmVoteRow[],
  aiVotes: AiVote[],
  styleFamilyById: Record<string, string>
): ConsensusResult {
  const algoTotal = algoRows.reduce((sum, row) => sum + row.combinedScorePct, 0) || 1.0;
  const algoDist = new Map<string, number>();
  for (const row of algoRows) {
    algoDist.set(row.styleId, row.combinedScorePct / algoTotal);
  }

  const aiDist = new Map<string, number>();
  let aiPrimaryStyleId: string | null = null;
  for (const vote of aiVotes) {
    const share = vote.voteRank === 1 ? AI_PRIMARY_SHARE : AI_SECONDARY_SHARE;
    const confidence = vote.confidence !== null ? vote.confidence : 1.0;
    aiDist.set(vote.styleId, (aiDist.get(vote.styleId) ?? 0.0) + share * confidence);
    if (vote.voteRank === 1) {
      aiPrimaryStyleId = vote.styleId;
    }
  }
  const aiMass = [...aiDist.values()].reduce((sum, v) => sum + v, 0);
  if (aiMass > 0) {
    for (const [styleId, v] of aiDist) {
      aiDist.set(styleId, v / aiMass);
    }
  }

  const allStyles = new Set<string>([...algoDist.keys(), ...aiDist.keys()]);
  const blended = new Map<string, number>();
  for (const styleId of allStyles) {
    blended.set(
      styleId,
      (AI_WEIGHT * (aiDist.get(styleId) ?? 0.0) + ALGORITHM_WEIGHT * (algoDist.get(styleId) ?? 0.0)) * 100
    );
  }
  const ranked = [...blended.entries()].sort((a, b) => b[1] - a[1]);

  let status: ClassificationStatus;
  let primaryId: string | null;
  let primaryPct: number | null;
  let secondaryId: string | null = null;
  let secondaryPct: number | null = null;

  if (ranked.length === 0 || ranked[0][1] < UNKNOWN_THRESHOLD) {
    status = "unknown";
    if (ranked.length === 0) {
      primaryId = null;
      primaryPct = null;
    } else {
      [primaryId, primaryPct] = ranked[0];
    }
  } else {
    [primaryId, primaryPct] = ranked[0];
    if (ranked.length > 1) {
      const [secondId, secondPct] = ranked[1];
      const gap = primaryPct - secondPct;
      const primaryFamily = styleFamilyById[primaryId];
      const secondFamily = styleFamilyById[secondId];
      if (gap <= BLENDED_GAP_PCT && primaryFamily !== secondFamily) {
        secondaryId = secondId;
        secondaryPct = secondPct;
      }
    }
    status = secondaryId ? "blended" : "clear_match";
  }

  const aiDissented = Boolean(aiPrimaryStyleId && primaryId && aiPrimaryStyleId !== primaryId);
  let dissentReasoning: string | null = null;
  if (aiDissented) {
    const primaryAiVote = aiVotes.find((v) => v.voteRank === 1);
    dissentReasoning = primaryAiVote?.reasoning ?? null;
  }

  return {
    // Faithful to the Python source's own "if primary_pct else None" check --
    // a literal 0.0 score also collapses to null here, same latent quirk.
    primaryStyleId: primaryId,
    primaryScorePct: primaryPct ? round1(primaryPct) : null,
    secondaryStyleId: secondaryId,
    secondaryScorePct: secondaryPct ? round1(secondaryPct) : null,
    classificationStatus: status,
    aiDissented,
    dissentReasoning,
    voterWeightsUsed: { ai: round3(AI_WEIGHT), algorithm: round3(ALGORITHM_WEIGHT) },
    ranked: ranked.slice(0, 10),
  };
}
