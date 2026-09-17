-- v0.13.0 (2026-09-17): stores the AI's ranked-with-reasoning shortlist
-- for curated-tier orders — a starting point for the human curator, not
-- part of the existing 2-voter blend/consensus math (steps 18/20). Given
-- the neighborhood-read text and the algorithm's own top 8 style
-- candidates (curbappeal_profile_style_compatibility, same set already
-- shown in admin as "Top matches"), the AI re-ranks its top 6 of those
-- with one sentence of reasoning each, mirroring a manual ChatGPT
-- workflow the business was already doing by hand.
--
-- style_name is stored alongside style_id (nullable) so a lookup miss on
-- a slightly-off AI-returned name still displays something sensible
-- rather than silently dropping the row.

CREATE TABLE curbappeal_structure_profile_curation_ranks (
  id                    TEXT PRIMARY KEY,
  structure_profile_id  TEXT NOT NULL REFERENCES curbappeal_structure_profiles(id),
  rank                  INTEGER NOT NULL,
  style_id              TEXT REFERENCES styles(id),
  style_name            TEXT NOT NULL,
  reasoning             TEXT NOT NULL,
  computed_at           TEXT NOT NULL,
  UNIQUE (structure_profile_id, rank)
);
