// Step 18 (Automation Routing Sheet Phase 2): the AI vote. Deliberately
// shown the photo directly and asked for its own holistic read — NOT given
// the algorithm's bucketed structure data or scores. The two voters need
// to stay genuinely independent (one reading the actual image, one reading
// derived structured facts) for the blend in step 20 to mean anything;
// feeding the AI the algorithm's own inputs would just make it echo the
// same signal twice under two names.

import { callVisionJson } from "./openaiClient";
import type { AiCallLog } from "./aiLog";

const SYSTEM_PROMPT =
  "You are an experienced residential architect looking at ONE exterior " +
  "photo of a house. Judge its architectural style holistically — the " +
  "way a human expert would look at a house and form an impression — " +
  "using your own visual read of massing, roofline, materials, windows, " +
  "and ornament. Pick your primary best-match style from the candidate " +
  "list provided. If a second style genuinely also fits (a blended or " +
  "ambiguous house), name a secondary style too — otherwise leave it out. " +
  "Give a confidence (0-1) for each pick and one sentence of reasoning " +
  "for your primary pick.";

const SCHEMA = {
  type: "object",
  properties: {
    primary_style: { type: "string" },
    primary_confidence: { type: "number" },
    primary_reasoning: { type: "string" },
    secondary_style: { type: ["string", "null"] },
    secondary_confidence: { type: ["number", "null"] },
  },
  required: ["primary_style", "primary_confidence", "primary_reasoning", "secondary_style", "secondary_confidence"],
  additionalProperties: false,
};

export type AiVoteResult = {
  primary_style: string;
  primary_confidence: number;
  primary_reasoning: string;
  secondary_style: string | null;
  secondary_confidence: number | null;
};

export async function castAiVote(
  apiKey: string,
  photoDataUrl: string,
  candidateStyleNames: string[]
): Promise<{ result: AiVoteResult; log: AiCallLog }> {
  const userText =
    `Candidate styles (pick your primary, and an optional secondary, ` +
    `only from this exact list):\n\n${candidateStyleNames.join(", ")}\n\n` +
    `What style is this house?`;

  const { parsed, log } = await callVisionJson(
    apiKey,
    "18-ai-vote",
    SYSTEM_PROMPT,
    userText,
    [photoDataUrl],
    "ai_style_vote",
    SCHEMA,
    3000
  );

  return { result: parsed as AiVoteResult, log };
}
