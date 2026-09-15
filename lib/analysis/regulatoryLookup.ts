// Step 12 (Automation Routing Sheet Phase 2): regulatory lookup. Verified
// working 2026-09-14 against a real address via OpenAI's hosted web_search
// tool (Responses API) — genuinely searches live government GIS/zoning
// pages and FEMA's flood layer, returns real cited sources. Reliability
// will vary by how well-documented a jurisdiction's public records are
// online (excellent for a city like DC, unknown for a small rural county),
// so every result retains its sources — a curator should glance at them
// before trusting the result, same principle as retaining the Street View
// image for step 11.
//
// Two calls: one real web_search (does the actual research), one tiny
// plain extraction call (structures the free-text answer into the
// properties.zoning_district/historic_overlay/flood_zone columns) — kept
// separate because forcing a strict JSON schema onto a tool-using response
// isn't well-supported, and the extraction call is cheap enough (a few
// hundred tokens) not to matter.

import { callWebSearch, callVisionJson } from "./openaiClient";
import type { AiCallLog } from "./aiLog";

export type RegulatoryLookupResult = {
  zoningDistrict: string | null;
  historicOverlay: boolean | null;
  floodZone: string | null;
  summary: string;
  citations: { title: string; url: string }[];
};

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    zoning_district: { type: ["string", "null"] },
    historic_overlay: { type: ["boolean", "null"] },
    flood_zone: { type: ["string", "null"] },
  },
  required: ["zoning_district", "historic_overlay", "flood_zone"],
  additionalProperties: false,
};

export async function lookupRegulatory(
  apiKey: string,
  propertyAddress: string
): Promise<{ result: RegulatoryLookupResult; logs: AiCallLog[] }> {
  const searchInput =
    `What is the current zoning classification and FEMA flood zone ` +
    `designation for the property at ${propertyAddress}? Also note if it ` +
    `falls within any locally or nationally designated historic district ` +
    `or overlay. Search for real, current, sourced information and cite ` +
    `where you found it.`;

  const { text, citations, log: searchLog } = await callWebSearch(
    apiKey,
    "12-regulatory-lookup-search",
    searchInput
  );

  const { parsed, log: extractLog } = await callVisionJson(
    apiKey,
    "12-regulatory-lookup-extract",
    "Extract structured fields from a regulatory research summary. Use " +
      "null for anything not clearly stated. historic_overlay is true " +
      "only if a historic district/overlay/landmark designation is " +
      "explicitly mentioned as applying to this property.",
    text,
    [],
    "regulatory_extract",
    EXTRACT_SCHEMA
  );

  const extracted = parsed as {
    zoning_district: string | null;
    historic_overlay: boolean | null;
    flood_zone: string | null;
  };

  return {
    result: {
      zoningDistrict: extracted.zoning_district,
      historicOverlay: extracted.historic_overlay,
      floodZone: extracted.flood_zone,
      summary: text,
      citations,
    },
    logs: [searchLog, extractLog],
  };
}
