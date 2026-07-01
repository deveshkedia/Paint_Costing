-- Migration 002 — Search, history tracking, manual litre-density override,
-- three-pack support, and bulk raw material entry support.
-- Run once via: npm run db:migrate2
-- Safe to run on a database that already has data (uses IF NOT EXISTS /
-- ALTER ... ADD COLUMN IF NOT EXISTS throughout).

-- ============================================================
-- RAW MATERIAL PRICE HISTORY
-- Every time a raw material's price_per_kg changes, the OLD value is
-- archived here with a timestamp before the new price is written.
-- Lets you ask "what was X's price on/around date Y" and plot a timeline.
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_material_price_history (
  id              SERIAL PRIMARY KEY,
  raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  price_per_kg    NUMERIC NOT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rm_price_history_material ON raw_material_price_history(raw_material_id, recorded_at);

-- ============================================================
-- FORMULATION COST HISTORY
-- A snapshot of computed cost (per kg / per litre) recorded whenever a
-- formulation is created or its recipe/loss/packing is edited — not on
-- every raw material price tick (per your instruction).
-- ============================================================
CREATE TABLE IF NOT EXISTS formulation_cost_history (
  id              SERIAL PRIMARY KEY,
  formulation_id  INTEGER NOT NULL REFERENCES formulations(id) ON DELETE CASCADE,
  cost_per_kg     NUMERIC NOT NULL,
  cost_per_litre  NUMERIC,             -- null if no litre_density_kg_per_l set yet
  litre_density_kg_per_l NUMERIC,      -- the manual override value used, snapshotted
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_formulation_cost_history_formulation ON formulation_cost_history(formulation_id, recorded_at);

-- ============================================================
-- FORMULATIONS — add manual litre-density override (per formulation,
-- entered by the technical team) and three-pack support.
-- Cost/litre is now: cost_per_kg * litre_density_kg_per_l (manual figure),
-- NOT derived from raw material densities. Raw material density is kept
-- for internal weight/volume bookkeeping only.
-- ============================================================
ALTER TABLE formulations ADD COLUMN IF NOT EXISTS litre_density_kg_per_l NUMERIC;

-- Drop and recreate the pack_type check on products to allow 'three_pack'.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_pack_type_check;
ALTER TABLE products ADD CONSTRAINT products_pack_type_check
  CHECK (pack_type IN ('single', 'two_pack', 'three_pack'));

-- Formulations: third-component packing reference (mirrors hardener_packing_id).
ALTER TABLE formulations ADD COLUMN IF NOT EXISTS component_c_packing_id INTEGER REFERENCES packing_materials(id);
ALTER TABLE formulations ADD COLUMN IF NOT EXISTS mix_ratio_weight_c NUMERIC;
ALTER TABLE formulations ADD COLUMN IF NOT EXISTS mix_ratio_vol_c NUMERIC;

-- formulation_lines: allow a third side. Drop and recreate the check.
ALTER TABLE formulation_lines DROP CONSTRAINT IF EXISTS formulation_lines_side_check;
ALTER TABLE formulation_lines ADD CONSTRAINT formulation_lines_side_check
  CHECK (side IN ('single', 'base', 'hardener', 'component_c'));

-- packing_materials: allow a third pack role to match.
ALTER TABLE packing_materials DROP CONSTRAINT IF EXISTS packing_materials_pack_role_check;
ALTER TABLE packing_materials ADD CONSTRAINT packing_materials_pack_role_check
  CHECK (pack_role IN ('single', 'base', 'hardener', 'component_c'));

-- ============================================================
-- BACKUP LOG — tracks when a backup was last taken, so the app can
-- prompt you weekly if one hasn't been done.
-- ============================================================
CREATE TABLE IF NOT EXISTS backup_log (
  id          SERIAL PRIMARY KEY,
  taken_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  taken_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT
);
