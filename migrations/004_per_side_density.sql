-- Migration 004 — Per-side weight-per-litre for two/three-pack products.
-- Base and Hardener (and Component C) are supplied in separate containers
-- with different densities — costing must blend them via the volume mix
-- ratio rather than using one shared "weight per litre" figure.
-- Run once via: npm run db:migrate2 (auto-picks up new migration files).
-- Safe to run on a database that already has data.

ALTER TABLE formulations ADD COLUMN IF NOT EXISTS base_litre_density_kg_per_l NUMERIC;
ALTER TABLE formulations ADD COLUMN IF NOT EXISTS hardener_litre_density_kg_per_l NUMERIC;
ALTER TABLE formulations ADD COLUMN IF NOT EXISTS component_c_litre_density_kg_per_l NUMERIC;

-- litre_density_kg_per_l (added in migration 002) remains in use for
-- single-pack products only. For existing two/three-pack formulations that
-- already had a value there, copy it into base_litre_density_kg_per_l as a
-- reasonable starting point — better than losing the figure entirely. You
-- should still review and set the hardener (and component C) density
-- separately, since they're rarely the same as the base.
UPDATE formulations f
SET base_litre_density_kg_per_l = f.litre_density_kg_per_l
FROM products p
WHERE f.product_id = p.id
  AND p.pack_type IN ('two_pack', 'three_pack')
  AND f.litre_density_kg_per_l IS NOT NULL
  AND f.base_litre_density_kg_per_l IS NULL;
