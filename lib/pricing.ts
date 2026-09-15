// Order-configurator pricing. Source of truth for both the UI display and
// the server-side Stripe line-item calculation (lib/orderPricing.ts) —
// never trust a client-submitted total, that file is what the server
// re-derives too.
//
// v0.10.0 (2026-09-15): replaced the old fixed Starter Package + à la
// carte additional styles with a pure per-render model. Every render a
// customer orders is one of three tiers; there's no free/included render
// anymore. See docs/admin-navigation-ia.md and CHANGELOG.md for the
// business reasoning.

export type RenderTier = "self_directed" | "curated" | "premium";

export const RENDER_PRICE: Record<RenderTier, number> = {
  self_directed: 29.99,
  curated: 44.99,
  premium: 59.99,
};

export const TIER_LABELS: Record<RenderTier, string> = {
  self_directed: "Self-Directed",
  curated: "Curated",
  premium: "Premium",
};

export const TIER_DESCRIPTIONS: Record<RenderTier, string> = {
  self_directed:
    "You pick the style yourself from our full catalog. Fully automated — no waiting on a curator.",
  curated:
    "Our team picks the style for your specific home and neighborhood, using the same structural analysis as every tier.",
  premium:
    "Describe exactly what you want — a specific era, an unusual roofline, a full custom vision.",
};

// A revision costs whatever that render's own tier already costs — same
// rate card, no separate revision price list to keep in sync.
export const REVISION_PRICE = RENDER_PRICE;

export const LOGO_PRICE = 29.99;
export const PREMIUM_CHAR_LIMIT = 550;

// Phone photos commonly run 3-10MB; 15MB comfortably covers even
// high-res shots without accepting absurdly large files. Logos are
// almost always well under 1MB, so 5MB is already generous headroom.
export const HOUSE_PHOTO_MAX_MB = 15;
export const LOGO_MAX_MB = 5;

export type ExtraKey = "night" | "seasonal" | "holiday";

export const EXTRA_LABELS: Record<ExtraKey, string> = {
  night: "Night View",
  seasonal: "Seasonal Look",
  holiday: "Holiday Decor",
};

// Flat per-render price — same regardless of tier, no bundle discount.
export const EXTRA_PRICE = 9.99;

export type SeasonOption = {
  value: string;
  label: string;
  description: string;
};

export const SEASON_OPTIONS: SeasonOption[] = [
  { value: "spring", label: "Spring", description: "Growing grass, mild clouds" },
  { value: "summer", label: "Summer", description: "Green grass, sunny sky" },
  { value: "fall", label: "Fall", description: "Colored leaves on the ground, grey skies" },
  { value: "winter", label: "Winter", description: "Snow on the ground, wintery skies" },
];

// Itemized structural-vs-cosmetic changes list, per render, per the
// reviewed structural_or_applied field on all 259 design elements.
export const STRUCTURAL_BREAKDOWN_LABEL = "Structural vs. Cosmetic Breakdown";
export const STRUCTURAL_BREAKDOWN_PRICE = 19.99;

export const HOLIDAY_OPTIONS: string[] = [
  "Christmas",
  "Halloween",
  "Independence Day",
  "Thanksgiving",
  "Easter",
  "Valentine's Day",
  "New Year's Eve",
  "St. Patrick's Day",
  "Memorial Day",
];
