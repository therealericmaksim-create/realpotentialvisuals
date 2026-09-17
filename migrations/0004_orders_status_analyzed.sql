-- v0.15.0 (2026-09-17): rename the orders.status enum value 'analyzing'
-- (present participle, never actually used by any code — nothing sets
-- it today) to 'analyzed' (past tense, set once Run Analysis actually
-- completes for that order). SQLite has no ALTER COLUMN for a CHECK
-- constraint, so this requires a full table rebuild rather than a plain
-- RENAME — blocked by Claude Code's own safety classifier against a
-- table with real customer data, so this has to be run by a human via
-- `wrangler d1 execute realpotential --remote --file migrations/0004_orders_status_analyzed.sql`
-- or the Cloudflare D1 dashboard console.
--
-- Deliberately renames the OLD table rather than dropping it, so this
-- stays reversible and never touches DROP TABLE. orders_pre_v0_15_legacy
-- is dead weight afterward (2 rows as of this writing) — safe to ignore,
-- or drop manually later once you've confirmed the new orders table is
-- correct.
--
-- Every other column is copied verbatim, unchanged, in the same order.

ALTER TABLE orders RENAME TO orders_pre_v0_15_legacy;

CREATE TABLE orders (
  id                      TEXT PRIMARY KEY,
  job_id                  TEXT REFERENCES jobs(id),
  order_type              TEXT NOT NULL DEFAULT 'standard'
    CHECK (order_type IN ('standard','contest_entry')),
  status                  TEXT NOT NULL DEFAULT 'started'
    CHECK (status IN ('started','verified','queued','placed','analyzed',
                       'in_curation','awaiting_selection','in_progress',
                       'in_qc','complete','cancelled','refunded','error')),
  curbappeal_photo_key    TEXT,
  disclosure_accepted_at  TEXT,
  starter_night           INTEGER NOT NULL DEFAULT 0,
  starter_seasonal        INTEGER NOT NULL DEFAULT 0,
  starter_season_choice   TEXT,
  starter_holiday         INTEGER NOT NULL DEFAULT 0,
  starter_holiday_choice  TEXT,
  starter_breakdown       INTEGER NOT NULL DEFAULT 0,
  premium_enabled         INTEGER NOT NULL DEFAULT 0,
  premium_text            TEXT,
  logo_key                TEXT,
  total_amount_cents      INTEGER NOT NULL,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  property_address        TEXT,
  hoa_answer              TEXT,
  historic_district_answer TEXT,
  gate_passed             INTEGER,
  gate_reason             TEXT,
  queue_position          INTEGER,
  customer_email          TEXT
);

INSERT INTO orders SELECT * FROM orders_pre_v0_15_legacy;

-- Verification (run manually after the above, before trusting the app
-- against this table): row counts must match, and every column for
-- every row must be identical between the two tables.
--   SELECT count(*) FROM orders;
--   SELECT count(*) FROM orders_pre_v0_15_legacy;
