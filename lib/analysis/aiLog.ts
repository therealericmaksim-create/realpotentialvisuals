// Shared shape for every AI call made anywhere in the Phase 2 pipeline —
// the orchestrator collects one of these per step and uses the list to
// write the full prompts-in/tokens-out documentation after a real run.

export type AiCallLog = {
  step: string; // e.g. "9-structure-analysis"
  model: string;
  systemPrompt: string;
  userPrompt: string;
  responseText: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
};

// gpt-5.6-luna pricing confirmed 2026-09-14: $0.20/1M input, $1.20/1M
// output (reasoning tokens bill as output). Update if pricing changes.
const INPUT_PER_TOKEN = 0.2 / 1_000_000;
const OUTPUT_PER_TOKEN = 1.2 / 1_000_000;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return inputTokens * INPUT_PER_TOKEN + outputTokens * OUTPUT_PER_TOKEN;
}
