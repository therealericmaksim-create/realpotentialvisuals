// Turns an approved render instruction into an actual image.
//
// Uses OpenAI's image EDIT endpoint, not plain generation: the source
// photo goes in alongside the prompt so the model is restyling this
// specific house rather than inventing one that merely matches the
// description. That is the whole product promise, and a text-only
// generation call cannot keep it no matter how detailed the prompt.
//
// Note on timing: an edit typically takes 20–60 seconds. The call is made
// inline from the admin request, so the browser waits on it. If that ever
// becomes a problem the fix is a queue plus polling, not a shorter prompt.

import { readImageDimensions } from "./imageValidation";

export const DEFAULT_IMAGE_MODEL = "gpt-image-2";

// gpt-image-2 and later accept an arbitrary WIDTHxHEIGHT, so the output
// can match the shape of the customer's own photo. The constraints are
// the API's: both dimensions divisible by 16, aspect ratio within 1:3 to
// 3:1, nothing larger than 3840x2160.
//
// gpt-image-1 (and -1.5, -1-mini) could only emit 1024x1024, 1536x1024 or
// 1024x1536 — hardcoding the landscape one is what re-framed a portrait
// photo on the first real render. Those models still work here; they just
// fall back to the nearest preset.
const LEGACY_FIXED_SIZES = [
  { size: "1024x1024", width: 1024, height: 1024 },
  { size: "1536x1024", width: 1536, height: 1024 },
  { size: "1024x1536", width: 1024, height: 1536 },
] as const;

const MAX_EDGE = { width: 3840, height: 2160 };
const STEP = 16;
const MIN_RATIO = 1 / 3;
const MAX_RATIO = 3;

// The long edge is scaled into this band. A minimum matters for two
// reasons: a small upload would otherwise ask for a tiny output the API
// rejects outright (a fast 400 that looks like "the button did nothing"),
// and a render the customer pays for should not be smaller than this
// regardless of what they photographed it on.
const MIN_LONG_EDGE = 1024;

// Anything outside this is not a real photo dimension — it means the
// header parse went wrong, and trusting it would produce a nonsense size
// request. Falling back to a sane default beats failing the render.
const PLAUSIBLE = { min: 64, max: 20000 };

function dimensionsLookReal(d: { width: number; height: number } | null): boolean {
  if (!d) return false;
  const ok = (v: number) =>
    Number.isFinite(v) && v >= PLAUSIBLE.min && v <= PLAUSIBLE.max;
  return ok(d.width) && ok(d.height);
}

function supportsArbitrarySize(model: string): boolean {
  // Everything from gpt-image-2 onward. Matching on the "-1" generation
  // rather than allow-listing every future name, so a newer model works
  // without a code change.
  return !/^gpt-image-1(\.\d+)?(-mini)?$/.test(model) && !/^dall-e/.test(model);
}

function roundToStep(value: number): number {
  return Math.max(STEP, Math.round(value / STEP) * STEP);
}

export type GeneratedImage = {
  bytes: Uint8Array;
  contentType: string;
  // What was asked for and what came back, so the caller can record the
  // mismatch rather than silently pretending the sizes line up.
  requestedSize: string;
  sourceWidth: number | null;
  sourceHeight: number | null;
  model: string;
};

// The output size for a given source photo and model. On a model that
// takes arbitrary dimensions this lands within a few pixels of the
// original and preserves its aspect ratio; on a fixed-size model it falls
// back to the nearest-shaped preset so a tall photo is never forced into
// a wide frame.
export function chooseOutputSize(
  source: { width: number; height: number } | null,
  model: string = DEFAULT_IMAGE_MODEL
): string {
  if (!dimensionsLookReal(source)) return "1536x1024";
  source = source as { width: number; height: number };

  if (!supportsArbitrarySize(model)) {
    const target = source.width / source.height;
    let best: (typeof LEGACY_FIXED_SIZES)[number] = LEGACY_FIXED_SIZES[0];
    let bestDelta = Infinity;
    for (const candidate of LEGACY_FIXED_SIZES) {
      const delta = Math.abs(candidate.width / candidate.height - target);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = candidate;
      }
    }
    return best.size;
  }

  let { width, height } = source;

  // Clamp the aspect ratio into the API's 1:3–3:1 window before scaling,
  // so an extreme panorama is trimmed rather than rejected outright.
  const ratio = width / height;
  if (ratio > MAX_RATIO) width = height * MAX_RATIO;
  else if (ratio < MIN_RATIO) height = width / MIN_RATIO;

  // Scale UP if the photo is small, so the output never drops below the
  // minimum the API accepts (and never ships the customer a tiny render),
  // then DOWN to fit the maximum. Both preserve the shape.
  const longEdge = Math.max(width, height);
  if (longEdge < MIN_LONG_EDGE) {
    const up = MIN_LONG_EDGE / longEdge;
    width *= up;
    height *= up;
  }

  const scale = Math.min(1, MAX_EDGE.width / width, MAX_EDGE.height / height);
  width *= scale;
  height *= scale;

  return `${roundToStep(width)}x${roundToStep(height)}`;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function generateRenderImage(
  apiKey: string,
  source: { bytes: ArrayBuffer; contentType: string },
  prompt: string,
  model: string = DEFAULT_IMAGE_MODEL
): Promise<GeneratedImage> {
  const sourceBytes = new Uint8Array(source.bytes);
  const dimensions = readImageDimensions(sourceBytes);
  const size = chooseOutputSize(dimensions, model);

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("n", "1");
  form.append(
    "image",
    new Blob([source.bytes], { type: source.contentType || "image/png" }),
    "source.png"
  );

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    // Include what we asked for, not just what came back: a rejection is
    // almost always about the model name or the requested size, and
    // without those the message can't be acted on.
    throw new Error(
      `Image model rejected the request (HTTP ${res.status}). ` +
        `model=${model}, size=${size}, source=${dimensions ? `${dimensions.width}x${dimensions.height}` : "unreadable"}. ` +
        `Response: ${text.slice(0, 400)}`
    );
  }

  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI image edit returned no image data in its response");
  }

  return {
    bytes: base64ToBytes(b64),
    contentType: "image/png",
    requestedSize: size,
    sourceWidth: dimensions?.width ?? null,
    sourceHeight: dimensions?.height ?? null,
    model,
  };
}
