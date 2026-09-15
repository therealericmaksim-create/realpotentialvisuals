// Step 10 (Automation Routing Sheet Phase 2): design-element detection.
// Faithful port of pipeline/prompts/design_element_detection_prompt.md —
// the one AI vision prompt in this whole pipeline that had already been
// written and validated (against a real photo, see the pipeline's
// 14_real_vision_detection.py) before this build. Wording is preserved
// verbatim; only the output shape changes, to fit OpenAI's strict JSON
// schema (an object wrapping the array, since a bare top-level array isn't
// representable in json_schema strict mode).

import { callVisionJson } from "./openaiClient";
import type { AiCallLog } from "./aiLog";

const SYSTEM_PROMPT =
  "You are analyzing ONE exterior photo of a residential property to " +
  "identify which architectural design elements are physically visible " +
  "in the image.\n\n" +
  "CRITICAL INSTRUCTION: Ignore all visible text, signage, house numbers, " +
  "plaques, mailbox labels, or any other written text in the photo. A " +
  "previous test found a photo with a sign literally naming the " +
  "architectural style in frame — do not let any text in the image " +
  "influence your answer. Judge ONLY the physical structure, materials, " +
  "and forms visible.\n\n" +
  "You will be given a candidate list of design elements, grouped into " +
  "categories (D1 Massing and form, D2 Roof form, D3 Eave and cornice, " +
  "D4 Dormers, D5 Vertical elements, D6 Window types, D7 Arch and opening " +
  "shapes, D8 Window details, D9 Entry and door, D10 Porch and outdoor " +
  "spaces, D11 Columns and posts, D12 Railings and balusters, D13 Surface " +
  "pattern and ornament, D14 Colour and finish, D15 Landscape and site).\n\n" +
  "Go through the list group by group. For each element, decide:\n" +
  "- DETECTED: the element is clearly, unambiguously visible in the photo.\n" +
  "- NOT DETECTED: the element is absent, not visible from this angle, or " +
  "you are not confident enough to claim it (when in doubt, do NOT detect " +
  "it — a missed detection is far less costly than a false one, since a " +
  "false detection would incorrectly boost a style's match score).\n\n" +
  "Do not guess at elements that would require seeing the interior, the " +
  "rear of the property, or details too small/obscured to confirm from " +
  "this photo. Do not infer a design element from the STYLE you think the " +
  "house is — detect only what's physically visible, independent of any " +
  "style hypothesis.\n\n" +
  "Return only the elements you DETECTED (omit everything else) — do not " +
  "return an entry for every candidate, only the positive hits.";

const SCHEMA = {
  type: "object",
  properties: {
    detections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          design_element_slug: { type: "string" },
          confidence: { type: "number" },
          evidence: { type: "string" },
        },
        required: ["design_element_slug", "confidence", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["detections"],
  additionalProperties: false,
};

export type DesignElementDetection = {
  design_element_slug: string;
  confidence: number;
  evidence: string;
};

export async function detectDesignElements(
  apiKey: string,
  photoDataUrl: string,
  candidateSlugs: { category: string; slug: string; name: string }[]
): Promise<{ detections: DesignElementDetection[]; log: AiCallLog }> {
  const byCategory = new Map<string, string[]>();
  for (const c of candidateSlugs) {
    const list = byCategory.get(c.category) ?? [];
    list.push(`${c.slug} (${c.name})`);
    byCategory.set(c.category, list);
  }
  const candidateText = [...byCategory.entries()]
    .map(([category, items]) => `${category}:\n${items.join(", ")}`)
    .join("\n\n");

  const userText = `Candidate design elements, grouped by category:\n\n${candidateText}\n\nScreen this photo against the list above.`;

  const { parsed, log } = await callVisionJson(
    apiKey,
    "10-design-element-detection",
    SYSTEM_PROMPT,
    userText,
    [photoDataUrl],
    "design_element_detections",
    SCHEMA,
    // Much larger than the default budget — this call reasons through
    // ~259 candidates group by group, and a reasoning model can burn a lot
    // of tokens doing that before writing any actual output.
    8000
  );
  const result = parsed as { detections: DesignElementDetection[] };
  return { detections: result.detections, log };
}
