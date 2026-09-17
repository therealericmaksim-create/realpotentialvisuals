-- Replaces the 'in_progress' order status with 'in_production'.
--
-- SQLite cannot alter a CHECK constraint in place, so the whole orders
-- table has to be rebuilt. This is the standard rebuild: create the table
-- with the new constraint, copy every row (mapping the old value to the
-- new one), drop the original, rename into place.
--
-- orders is referenced by order_items, payments and contest_entries.
-- defer_foreign_keys holds those checks until COMMIT, by which point the
-- rebuilt table contains exactly the same ids, so nothing is orphaned.
--
-- Run this BEFORE deploying the code that writes 'in_production'. The
-- only code path that writes this status is QC approval, so the window
-- between migrating and deploying is safe as long as nobody approves an
-- order in QC during it.

PRAGMA defer_foreign_keys = TRUE;

CREATE TABLE orders_new (
  id                         TEXT PRIMARY KEY,
  job_id                     TEXT REFERENCES jobs(id),
  order_type                 TEXT NOT NULL DEFAULT 'standard'
    CHECK (order_type IN ('standard','contest_entry')),
  status                     TEXT NOT NULL DEFAULT 'started'
    CHECK (status IN ('started','verified','queued','placed','analyzing',
                       'in_curation','awaiting_selection','in_production',
                       'in_qc','complete','cancelled','refunded','error')),
  curbappeal_photo_key       TEXT,
  disclosure_accepted_at     TEXT,
  starter_night              INTEGER NOT NULL DEFAULT 0,
  starter_seasonal           INTEGER NOT NULL DEFAULT 0,
  starter_season_choice      TEXT,
  starter_holiday            INTEGER NOT NULL DEFAULT 0,
  starter_holiday_choice     TEXT,
  starter_breakdown          INTEGER NOT NULL DEFAULT 0,
  premium_enabled            INTEGER NOT NULL DEFAULT 0,
  premium_text               TEXT,
  logo_key                   TEXT,
  total_amount_cents         INTEGER NOT NULL,
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL,
  property_address           TEXT,
  hoa_answer                 TEXT,
  historic_district_answer   TEXT,
  gate_passed                INTEGER,
  gate_reason                TEXT,
  queue_position             INTEGER,
  customer_email             TEXT,
  customer_google_account_id TEXT
);

INSERT INTO orders_new (
  id, job_id, order_type, status, curbappeal_photo_key, disclosure_accepted_at,
  starter_night, starter_seasonal, starter_season_choice, starter_holiday,
  starter_holiday_choice, starter_breakdown, premium_enabled, premium_text,
  logo_key, total_amount_cents, created_at, updated_at, property_address,
  hoa_answer, historic_district_answer, gate_passed, gate_reason,
  queue_position, customer_email, customer_google_account_id
)
SELECT
  id, job_id, order_type,
  CASE status WHEN 'in_progress' THEN 'in_production' ELSE status END,
  curbappeal_photo_key, disclosure_accepted_at,
  starter_night, starter_seasonal, starter_season_choice, starter_holiday,
  starter_holiday_choice, starter_breakdown, premium_enabled, premium_text,
  logo_key, total_amount_cents, created_at, updated_at, property_address,
  hoa_answer, historic_district_answer, gate_passed, gate_reason,
  queue_position, customer_email, customer_google_account_id
FROM orders;

DROP TABLE orders;

ALTER TABLE orders_new RENAME TO orders;
