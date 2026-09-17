// Curator-assist ranking — not part of the 2-voter blend/consensus math
// (steps 18/20). Only runs for curated-tier orders, right alongside the
// AI vote. Mirrors a workflow the business was already doing by hand:
// pasting the neighborhood-read description and the algorithm's own top
// style candidates (with their combined_score_pct and believable/
// aspirational fit_tier) into a chat model and asking it to rank the
// best six for an exterior-only style change, one sentence of reasoning
// each. This is a text-only call — no photo needed, since the reasoning
// is over the neighborhood context and the algorithm's own candidate
// list, not a fresh visual read of the house.

import { callVisionJson } from "./openaiClient";
import type { AiCallLog } from "./aiLog";

const SYSTEM_PROMPT =
  "You are helping a human curator quickly shortlist an exterior " +
  "architectural style change for a real home, given a description of " +
  "its immediate neighborhood and a shortlist of candidate styles an " +
  "algorithm has already scored. Each candidate has a combined_score_pct " +
  "(0-100) and a coarse fit_tier: 'believable' (a natural, high-confidence " +
  "fit) or 'aspirational' (a bigger stylistic leap that could still work). " +
  "Rank your top 6 of the candidates in the order you would recommend a " +
  "curator consider them, based on how naturally each style could " +
  "translate onto this specific home in this specific neighborhood while " +
  "still giving it a distinctive new look. For each ranked style, give " +
  "exactly one sentence of reasoning tied to why it holds that position. " +
  "Only choose from the exact candidate list given — never invent a style " +
  "not on the list.";

const SCHEMA = {
  type: "object",
  properties: {
    rankings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          style_name: { type: "string" },
          reasoning: { type: "string" },
        },
        required: ["style_name", "reasoning"],
        additionalProperties: false,
      },
    },
  },
  required: ["rankings"],
  additionalProperties: false,
};

export type CurationCandidate = {
  styleName: string;
  combinedScorePct: number;
  fitTier: string;
};

export type CurationRanking = { styleName: string; reasoning: string };

export async function rankCurationCandidates(
  apiKey: string,
  neighborhoodContext: string,
  candidates: CurationCandidate[]
): Promise<{ result: CurationRanking[]; log: AiCallLog }> {
  const candidateText = candidates
    .map(
      (c) =>
        `${c.styleName} — ${c.combinedScorePct}% (${c.fitTier})`
    )
    .join("\n");

  const userText =
    `Neighborhood context:\n${neighborhoodContext}\n\n` +
    `Candidate styles (algorithm-scored, pick and rank only from this exact list):\n${candidateText}\n\n` +
    `Rank your top 6 for an exterior-only style change on this home.`;

  const { parsed, log } = await callVisionJson(
    apiKey,
    "19-curation-ranking",
    SYSTEM_PROMPT,
    userText,
    [],
    "curation_rankings",
    SCHEMA,
    2000
  );

  const raw = parsed as { rankings: { style_name: string; reasoning: string }[] };
  const result: CurationRanking[] = raw.rankings
    .slice(0, 6)
    .map((r) => ({ styleName: r.style_name, reasoning: r.reasoning }));
  return { result, log };
}
