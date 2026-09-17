-- Moves workflow state from the order down to the individual render.
--
-- An order can hold several renders, and they do not move through the
-- pipeline together: QC can deny one back to curation while another is
-- already being rendered. orders.status cannot express that, so every
-- queue that keyed off it was wrong for any multi-render order.
--
-- DELIBERATELY NO CHECK CONSTRAINT on stage. SQLite cannot alter a CHECK
-- in place, and the orders-table rebuild needed to change one fails
-- against D1 (defer_foreign_keys resets between statements, so dropping a
-- referenced table violates its children). Putting this vocabulary in a
-- CHECK would make adding a stage later impossible. The allowed values
-- live in lib/orderStage.ts and are enforced in application code.
--
-- All four statements are plain ADD COLUMN / UPDATE — no table rebuild,
-- so this is safe to run statement by statement in the D1 console.

ALTER TABLE order_items ADD COLUMN stage TEXT NOT NULL DEFAULT 'new';

ALTER TABLE order_items ADD COLUMN qc_denied_reason TEXT;

ALTER TABLE order_items ADD COLUMN qc_denied_style TEXT;

UPDATE order_items
SET stage = CASE
  -- self_directed has no human stage yet; that path is deliberately
  -- deferred, so these sit out of every queue rather than appearing in
  -- one nobody has built the handling for.
  WHEN tier = 'self_directed' THEN 'on_hold'
  WHEN (SELECT o.status FROM orders o WHERE o.id = order_items.order_id) = 'complete' THEN 'complete'
  WHEN (SELECT o.status FROM orders o WHERE o.id = order_items.order_id) = 'in_progress' THEN 'in_production'
  WHEN style_id IS NOT NULL
       AND (SELECT o.status FROM orders o WHERE o.id = order_items.order_id) IN ('in_curation','in_qc')
       THEN 'awaiting_qc'
  WHEN style_id IS NULL
       AND (SELECT o.status FROM orders o WHERE o.id = order_items.order_id) = 'in_curation'
       THEN 'awaiting_curation'
  ELSE 'new'
END;
