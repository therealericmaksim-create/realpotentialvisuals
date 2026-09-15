// Shared OpenAI callers for the Phase 2 analysis pipeline. Two shapes:
// callVisionJson (plain chat/completions, structured JSON output, used for
// steps 9/10/11/18) and callWebSearch (the Responses API's hosted
// web_search tool, used for step 12 — regulatory lookup). Both return an
// AiCallLog alongside the parsed result so the orchestrator can build the
// full prompts-in/tokens-out documentation from real runs.

import { estimateCostUsd, type AiCallLog } from "./aiLog";

const VISION_MODEL = "gpt-5.6-luna";

export async function imageUrlToDataUrl(
  bucket: R2Bucket,
  key: string
): Promise<string> {
  const obj = await bucket.get(key);
  if (!obj) throw new Error(`R2 object not found: ${key}`);
  const contentType = obj.httpMetadata?.contentType || "image/jpeg";
  const bytes = new Uint8Array(await obj.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

export async function callVisionJson(
  apiKey: string,
  step: string,
  systemPrompt: string,
  userText: string,
  imageDataUrls: string[],
  jsonSchemaName: string,
  jsonSchema: Record<string, unknown>,
  maxCompletionTokens = 2000
): Promise<{ parsed: unknown; log: AiCallLog }> {
  const content: unknown[] = [{ type: "text", text: userText }];
  for (const url of imageDataUrls) {
    content.push({ type: "image_url", image_url: { url } });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: jsonSchemaName, strict: true, schema: jsonSchema },
      },
      max_completion_tokens: maxCompletionTokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI vision call failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const finishReason = data.choices?.[0]?.finish_reason;
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  if (!raw) {
    throw new Error(
      `OpenAI vision call for step "${step}" returned empty content ` +
        `(finish_reason=${finishReason}, output_tokens=${outputTokens}, ` +
        `max_completion_tokens=${maxCompletionTokens}) — likely truncated ` +
        `by the token budget before any JSON was written; raise maxCompletionTokens.`
    );
  }

  return {
    parsed: JSON.parse(raw),
    log: {
      step,
      model: VISION_MODEL,
      systemPrompt,
      userPrompt: userText + (imageDataUrls.length ? ` [+${imageDataUrls.length} image(s)]` : ""),
      responseText: raw,
      inputTokens,
      outputTokens,
      totalTokens: data.usage?.total_tokens ?? inputTokens + outputTokens,
      costUsd: estimateCostUsd(inputTokens, outputTokens),
    },
  };
}

export async function callWebSearch(
  apiKey: string,
  step: string,
  input: string
): Promise<{ text: string; citations: { title: string; url: string }[]; log: AiCallLog }> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      tools: [{ type: "web_search" }],
      input,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI web_search call failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    output?: {
      type: string;
      role?: string;
      content?: { type: string; text?: string; annotations?: { type: string; title?: string; url?: string }[] }[];
    }[];
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };

  const message = (data.output ?? []).find((o) => o.type === "message");
  const textContent = message?.content?.find((c) => c.type === "output_text");
  const text = textContent?.text ?? "";
  const citations = (textContent?.annotations ?? [])
    .filter((a) => a.type === "url_citation" && a.url)
    .map((a) => ({ title: a.title ?? a.url ?? "", url: a.url ?? "" }));

  const inputTokens = data.usage?.input_tokens ?? 0;
  const outputTokens = data.usage?.output_tokens ?? 0;

  return {
    text,
    citations,
    log: {
      step,
      model: VISION_MODEL,
      systemPrompt: "(web_search tool enabled, no separate system prompt)",
      userPrompt: input,
      responseText: text,
      inputTokens,
      outputTokens,
      totalTokens: data.usage?.total_tokens ?? inputTokens + outputTokens,
      costUsd: estimateCostUsd(inputTokens, outputTokens),
    },
  };
}
