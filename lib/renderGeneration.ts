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

const IMAGE_MODEL = "gpt-image-1";

// The only sizes the model emits. It cannot return arbitrary dimensions,
// so an exact pixel match with the customer's photo is not achievable at
// this layer — the best available behaviour is to pick the shape closest
// to the source, which keeps the framing and crop honest. The first real
// render hardcoded landscape and came back re-framed.
const SUPPORTED_SIZES = [
  { size: "1024x1024", width: 1024, height: 1024 },
  { size: "1536x1024", width: 1536, height: 1024 },
  { size: "1024x1536", width: 1024, height: 1536 },
] as const;

export type GeneratedImage = {
  bytes: Uint8Array;
  contentType: string;
  // What was asked for and what came back, so the caller can record the
  // mismatch rather than silently pretending the sizes line up.
  requestedSize: string;
  sourceWidth: number | null;
  sourceHeight: number | null;
};

// Closest by aspect ratio, so a tall photo never comes back cropped into a
// wide frame (or the reverse).
export function chooseOutputSize(source: { width: number; height: number } | null): string {
  if (!source || source.width <= 0 || source.height <= 0) return "1536x1024";
  const target = source.width / source.height;
  let best: (typeof SUPPORTED_SIZES)[number] = SUPPORTED_SIZES[0];
  let bestDelta = Infinity;
  for (const candidate of SUPPORTED_SIZES) {
    const delta = Math.abs(candidate.width / candidate.height - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best.size;
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
  prompt: string
): Promise<GeneratedImage> {
  const sourceBytes = new Uint8Array(source.bytes);
  const dimensions = readImageDimensions(sourceBytes);
  const size = chooseOutputSize(dimensions);

  const form = new FormData();
  form.append("model", IMAGE_MODEL);
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
    throw new Error(`OpenAI image edit failed (${res.status}): ${text.slice(0, 500)}`);
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
  };
}
