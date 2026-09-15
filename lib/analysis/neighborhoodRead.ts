// Step 11 (Automation Routing Sheet Phase 2): neighborhood read. Per the
// routing sheet this was originally "Click" tier (a staff click fetches
// Street View and runs the read) — fully automated here instead, since
// there's no reason a human needs to be the one clicking "fetch image."
// Downloads a real Street View Static image, retains it in R2 (so a
// curator can pull up exactly what the AI saw), then asks the vision model
// for a style read of the surrounding area.
//
// Known limitation, stated plainly rather than overclaimed: Street View
// Static returns ONE image from the property's own vantage point, not a
// true survey of the block — a real "neighborhood" read would need several
// nearby panoramas. This is a reasonable first version, not the ceiling.

import { callVisionJson } from "./openaiClient";
import type { AiCallLog } from "./aiLog";

const SYSTEM_PROMPT =
  "You are looking at a Google Street View image of a residential street. " +
  "Describe the dominant architectural style(s) of the neighboring homes " +
  "visible in the image, and note anything relevant to what styles would " +
  "fit in visually (e.g. 'mostly Craftsman bungalows and Ranch homes, " +
  "modest single-storey massing, mature trees'). Be concise — 2-3 " +
  "sentences. If no other homes are clearly visible in the frame, say so " +
  "plainly rather than guessing.";

const SCHEMA = {
  type: "object",
  properties: {
    style_read: { type: "string" },
    homes_visible: { type: "boolean" },
  },
  required: ["style_read", "homes_visible"],
  additionalProperties: false,
};

export type NeighborhoodReadResult = {
  style_read: string;
  homes_visible: boolean;
};

export async function fetchStreetViewImage(
  mapsApiKey: string,
  address: string
): Promise<ArrayBuffer> {
  const url = `https://maps.googleapis.com/maps/api/streetview?size=640x640&location=${encodeURIComponent(
    address
  )}&key=${mapsApiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Street View Static API failed (${res.status})`);
  }
  return res.arrayBuffer();
}

function arrayBufferToDataUrl(buffer: ArrayBuffer, contentType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

export async function readNeighborhood(
  openaiApiKey: string,
  mediaBucket: R2Bucket,
  imageBytes: ArrayBuffer
): Promise<{ result: NeighborhoodReadResult; imageKey: string; log: AiCallLog }> {
  const imageKey = `neighborhood/${crypto.randomUUID()}.jpg`;
  await mediaBucket.put(imageKey, imageBytes, {
    httpMetadata: { contentType: "image/jpeg" },
  });

  const dataUrl = arrayBufferToDataUrl(imageBytes, "image/jpeg");
  const { parsed, log } = await callVisionJson(
    openaiApiKey,
    "11-neighborhood-read",
    SYSTEM_PROMPT,
    "Read this street view image.",
    [dataUrl],
    "neighborhood_read",
    SCHEMA
  );

  return { result: parsed as NeighborhoodReadResult, imageKey, log };
}
