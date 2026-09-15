-- v0.10.0 pricing rewrite (2026-09-15): replace the fixed Starter Package
-- + a la carte additional-style model with pure per-render pricing across
-- three tiers (self_directed / curated / premium).
--
-- Purely additive — order_items is confirmed empty in production at
-- migration time, but ADD COLUMN (not DROP+recreate) avoids any
-- destructive operation regardless. style_name stays NOT NULL from the
-- original table; the app passes '' for curated-tier rows (style not
-- assigned yet) rather than NULL until a real curation workspace exists
-- to fill it in properly.
--
-- The old orders.starter_*/premium_* columns are deliberately left in
-- place rather than dropped — they all have defaults (0 or NULL), so
-- every new INSERT that omits them is unaffected, and they're simply
-- vestigial going forward rather than being worth a destructive migration
-- to remove.

ALTER TABLE order_items ADD COLUMN tier TEXT NOT NULL DEFAULT 'self_directed'
  CHECK (tier IN ('self_directed','curated','premium'));
ALTER TABLE order_items ADD COLUMN custom_text TEXT;
