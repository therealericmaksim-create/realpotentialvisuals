-- v0.17.0 (2026-09-17): captures the customer's REAL Google identity at
-- order-creation time, once /start requires Google sign-in. Additive
-- only (matches the migrations/0001_pricing_v2.sql precedent) -- no
-- rebuild needed since this is a plain nullable column add.
--
-- Nullable and never backfilled for existing/manual orders on purpose:
-- the admin Manual Order form (/api/admin/orders/manual) has no real
-- Google session behind it at all -- those orders keep going through
-- ensurePropertyLinkage()'s existing guest:<email> synthesis. This
-- column is populated ONLY by the public /start flow, once a customer
-- has actually signed in with Google.

ALTER TABLE orders ADD COLUMN customer_google_account_id TEXT;
