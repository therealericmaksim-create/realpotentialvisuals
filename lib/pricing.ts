// Order-configurator pricing. Source of truth for both the UI display and
// (eventually) the server-side Stripe line-item calculation — never trust
// a client-submitted total, this file is what the server re-derives too.

export const STARTER_PRICE = 99;
export const ADD_STYLE_PRICE = 39.99;
export const PREMIUM_PRICE = 129.99;
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

// Base single-render price for each extra.
export const EXTRA_BASE_PRICE: Record<ExtraKey, number> = {
  night: 29.99,
  seasonal: 29.99,
  holiday: 39.99,
};

// Selected now, applies to all 3 Starter renders before the customer has
// even seen which styles they'll get (25% off the base rate x3). After
// curation, the customer can instead apply an extra to just one specific
// Starter render at the full EXTRA_BASE_PRICE rate — that choice happens
// later, on the post-curation order page, not here.
export const EXTRA_STARTER_BUNDLE_PRICE: Record<ExtraKey, number> = {
  night: 67.48,
  seasonal: 67.48,
  holiday: 89.98,
};

// Attached to one additional (customer-picked) style — 25% off base.
export const EXTRA_ADDITIONAL_STYLE_PRICE: Record<ExtraKey, number> = {
  night: 22.49,
  seasonal: 22.49,
  holiday: 29.99,
};

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
