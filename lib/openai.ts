// Gate 0/1 (Automation Routing Sheet Phase 1, steps 3-4): is this photo a
// building at all, and is it residential? Bundled into one vision call
// along with a basic quality read (step 2's framing/lighting/blur check),
// since it's the same image and the same model call either way.
//
// Fails open: with no OPENAI_API_KEY configured, checkGatePhoto() returns
// a "skipped" result rather than blocking uploads — this gate is additive
// on top of the magic-byte/size validation that already runs regardless.

export type GateResult = {
  ran: boolean;
  passed: boolean;
  reason: string;
};

type VisionResponse = {
  is_structure: boolean;
  is_residential: boolean;
  quality_ok: boolean;
  reason: string;
};

export async function checkGatePhoto(
  apiKey: string | undefined,
  imageBytes: ArrayBuffer,
  contentType: string
): Promise<GateResult> {
  if (!apiKey) {
    return { ran: false, passed: true, reason: "skipped: OPENAI_API_KEY not configured" };
  }

  const base64 = arrayBufferToBase64(imageBytes);
  const dataUrl = `data:${contentType};base64,${base64}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You screen photos for a home-exterior visualization service. " +
            "Respond only with JSON matching the given schema. " +
            "is_structure: is there a real building in the photo (not a car, " +
            "person, landscape, drawing, or interior shot)? is_residential: " +
            "is it a residential home (not commercial/civic/industrial)? " +
            "quality_ok: is it usable — not extremely dark, blurry, or so " +
            "cropped the front exterior isn't visible? reason: one short " +
            "sentence explaining any false value, or 'ok' if all true.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Screen this photo." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "gate_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              is_structure: { type: "boolean" },
              is_residential: { type: "boolean" },
              quality_ok: { type: "boolean" },
              reason: { type: "string" },
            },
            required: ["is_structure", "is_residential", "quality_ok", "reason"],
            additionalProperties: false,
          },
        },
      },
      max_tokens: 200,
    }),
  });

  if (!res.ok) {
    // Fail open — a flaky vision call shouldn't block a real customer's
    // upload. The order-level gate_reason records that this happened.
    return { ran: false, passed: true, reason: `skipped: OpenAI request failed (${res.status})` };
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    return { ran: false, passed: true, reason: "skipped: no response content" };
  }

  let parsed: VisionResponse;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ran: false, passed: true, reason: "skipped: unparseable response" };
  }

  const passed = parsed.is_structure && parsed.is_residential && parsed.quality_ok;
  return { ran: true, passed, reason: parsed.reason || (passed ? "ok" : "failed gate") };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
