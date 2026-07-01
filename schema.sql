-- Anupam Paints — Formulation Costing & Quoting System
-- Run once via: npm run db:migrate

-- ============================================================
-- USERS & AUTH
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'estimator' CHECK (role IN ('admin', 'estimator', 'rm_manager')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RAW MATERIALS
-- price_per_kg is the live, editable figure. Every formulation cost
-- recalculates from this on every read — nothing about cost is stored stale.
-- density_kg_per_litre is used only for internal weight/volume bookkeeping;
-- the customer-facing cost/litre instead uses each formulation's manually
-- entered litre_density_kg_per_l (see formulations table below).
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_materials (
  id                   SERIAL PRIMARY KEY,
  name                 TEXT NOT NULL UNIQUE,
  price_per_kg         NUMERIC NOT NULL,
  density_kg_per_litre NUMERIC NOT NULL DEFAULT 1.0,
  supplier             TEXT,
  notes                TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every price change to a raw material archives the OLD value here first.
CREATE TABLE IF NOT EXISTS raw_material_price_history (
  id              SERIAL PRIMARY KEY,
  raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  price_per_kg    NUMERIC NOT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rm_price_history_material ON raw_material_price_history(raw_material_id, recorded_at);

-- ============================================================
-- PACKING MATERIALS
-- Flat cost per pack unit, same across all products (per your spec).
-- e.g. "20L Drum", "1kg Tin", "Base Container 16kg", "Hardener Container 4kg"
-- ============================================================
CREATE TABLE IF NOT EXISTS packing_materials (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  pack_role   TEXT NOT NULL DEFAULT 'single' CHECK (pack_role IN ('single', 'base', 'hardener', 'component_c')),
  cost        NUMERIC NOT NULL,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PRODUCTS
-- A product is the named item (e.g. "Synthetic Enamel", "Epoxy Primer ZRP").
-- pack_type determines whether it has one formulation list or a base+hardener pair.
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'industrial', -- decorative | industrial | specialty
  pack_type  TEXT NOT NULL CHECK (pack_type IN ('single', 'two_pack', 'three_pack')),
  notes      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- FORMULATIONS
-- Same product can have multiple formulations — one per customer/spec.
-- Loss % and packing selection live here because they vary by formulation.
-- mix_ratio fields are informational/display (e.g. "4:1") for two/three-pack;
-- actual costing always derives from the literal kg quantities entered below.
-- litre_density_kg_per_l is a MANUAL figure your technical team enters per
-- formulation (measured kg per litre for that actual batch) — cost/litre is
-- computed as cost_per_kg * litre_density_kg_per_l, not derived automatically.
-- ============================================================
CREATE TABLE IF NOT EXISTS formulations (
  id                    SERIAL PRIMARY KEY,
  product_id            INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_name         TEXT NOT NULL,         -- e.g. "L&T Spec", "Standard", "Indian Railways"
  loss_pct              NUMERIC NOT NULL DEFAULT 0,
  base_packing_id       INTEGER REFERENCES packing_materials(id),
  hardener_packing_id   INTEGER REFERENCES packing_materials(id), -- null for single-pack
  component_c_packing_id INTEGER REFERENCES packing_materials(id), -- null unless three-pack
  mix_ratio_weight_base NUMERIC,               -- e.g. 4  (display only, e.g. "4:1" by weight)
  mix_ratio_weight_hard NUMERIC,               -- e.g. 1
  mix_ratio_weight_c    NUMERIC,
  mix_ratio_vol_base    NUMERIC,               -- e.g. 4  (display only, e.g. "4:1" by volume)
  mix_ratio_vol_hard    NUMERIC,
  mix_ratio_vol_c       NUMERIC,
  litre_density_kg_per_l NUMERIC,              -- manual override for SINGLE-PACK products only
  base_litre_density_kg_per_l NUMERIC,         -- manual weight/litre for the Base side (two/three-pack)
  hardener_litre_density_kg_per_l NUMERIC,     -- manual weight/litre for the Hardener side (two/three-pack)
  component_c_litre_density_kg_per_l NUMERIC,  -- manual weight/litre for Component C (three-pack only)
  batch_size_kg         NUMERIC,               -- total finished-goods weight this recipe makes; anchors percent <-> kg conversion
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Snapshot of computed cost, recorded whenever a formulation is created or edited.
CREATE TABLE IF NOT EXISTS formulation_cost_history (
  id              SERIAL PRIMARY KEY,
  formulation_id  INTEGER NOT NULL REFERENCES formulations(id) ON DELETE CASCADE,
  cost_per_kg     NUMERIC NOT NULL,
  cost_per_litre  NUMERIC,
  litre_density_kg_per_l NUMERIC,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_formulation_cost_history_formulation ON formulation_cost_history(formulation_id, recorded_at);

-- ============================================================
-- FORMULATION LINES
-- The actual recipe: raw material + quantity (kg) per batch, plus its
-- percent of the formulation's batch_size_kg. Both are stored and kept in
-- sync — editing one in the UI recalculates the other.
-- side = 'single' | 'base' | 'hardener' | 'component_c' depending on product pack_type.
-- ============================================================
CREATE TABLE IF NOT EXISTS formulation_lines (
  id              SERIAL PRIMARY KEY,
  formulation_id  INTEGER NOT NULL REFERENCES formulations(id) ON DELETE CASCADE,
  raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id),
  side            TEXT NOT NULL DEFAULT 'single' CHECK (side IN ('single', 'base', 'hardener', 'component_c')),
  qty_kg          NUMERIC NOT NULL,
  percent         NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_formulations_customer_name ON formulations (customer_name);

-- ============================================================
-- QUOTES — customer-facing pricing built on top of formulations
-- ============================================================
CREATE TABLE IF NOT EXISTS quotes (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  client_name     TEXT,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  margin_pct      NUMERIC NOT NULL DEFAULT 18,
  gst_pct         NUMERIC NOT NULL DEFAULT 18,
  grand_total     NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_lines (
  id                SERIAL PRIMARY KEY,
  quote_id          INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  formulation_id     INTEGER REFERENCES formulations(id),
  product_name      TEXT NOT NULL,    -- snapshot
  customer_spec     TEXT,             -- snapshot of formulation.customer_name
  quantity_kg       NUMERIC,          -- ordered quantity (kg) — one of kg/litre filled
  quantity_litre    NUMERIC,          -- ordered quantity (litre)
  cost_per_kg_snap  NUMERIC NOT NULL, -- snapshot of computed cost at quoting time
  cost_per_litre_snap NUMERIC NOT NULL,
  line_total        NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_formulations_product ON formulations(product_id);
CREATE INDEX IF NOT EXISTS idx_formulation_lines_formulation ON formulation_lines(formulation_id);
CREATE INDEX IF NOT EXISTS idx_formulation_lines_raw_material ON formulation_lines(raw_material_id);
CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON quote_lines(quote_id);

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
