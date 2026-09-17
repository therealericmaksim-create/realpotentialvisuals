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

const IMAGE_MODEL = "gpt-image-1";

// House photos are landscape; matching the aspect ratio avoids the model
// cropping or letterboxing the facade to fit a square.
const IMAGE_SIZE = "1536x1024";

export type GeneratedImage = {
  bytes: Uint8Array;
  contentType: string;
};

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
  const form = new FormData();
  form.append("model", IMAGE_MODEL);
  form.append("prompt", prompt);
  form.append("size", IMAGE_SIZE);
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

  return { bytes: base64ToBytes(b64), contentType: "image/png" };
}
