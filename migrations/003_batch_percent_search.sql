-- Migration 003 — Batch-size-based percent costing, customer-name search,
-- and image-extraction support fields.
-- Run once via: npm run db:migrate3
-- Safe to run on a database that already has data.

-- ============================================================
-- FORMULATIONS — batch size is the anchor for percent <-> kg conversion.
-- percent for a raw material = qty_kg / batch_size_kg * 100.
-- Existing formulations won't have a batch_size_kg yet; the app will ask
-- you to set one (or infer it from current total recipe weight) before
-- percent-based entry can be used on them.
-- ============================================================
ALTER TABLE formulations ADD COLUMN IF NOT EXISTS batch_size_kg NUMERIC;

-- Packing cost on the Nett row is "per batch" (per your confirmation),
-- divided by batch_size_kg to get the per-kg Nett add-on. No schema change
-- needed for this — it's computed from existing packing_materials.cost and
-- the new batch_size_kg at read time.

-- ============================================================
-- FORMULATION LINES — store percent as a first-class column alongside
-- qty_kg. Both are kept in sync: editing one recalculates the other using
-- the formulation's batch_size_kg. Storing both (rather than deriving
-- percent on the fly) lets a formulation be saved with percent entry even
-- before a batch size is locked in, and avoids repeated rounding drift.
-- ============================================================
ALTER TABLE formulation_lines ADD COLUMN IF NOT EXISTS percent NUMERIC;

-- ============================================================
-- CUSTOMER NAME SEARCH — formulations.customer_name already exists;
-- add a trigram-free simple index to keep ILIKE search reasonably fast
-- as the table grows. (Full trigram/pg_trgm would be better at scale but
-- requires a Postgres extension your hosting may not have enabled.)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_formulations_customer_name ON formulations (customer_name);
