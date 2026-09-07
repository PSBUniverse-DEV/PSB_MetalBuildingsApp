-- ═══════════════════════════════════════════════════════════
-- METAL BUILDINGS — Leg Height pricing support
-- Run this against your Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════

-- The Leg Height pricing editor uses dedicated tables you already created:
--   metal_m_leg_price_matrix        -> leg price rows (one per size x leg type x height)
--   metal_m_region_legprice_matrix  -> region assignments per leg price row
--   metal_s_leg_type                -> leg type names (Standard / Double-legs / Ladder-legs)
--
-- metal_m_leg_price_matrix currently only has matrix_price_id (FK to the
-- structure-size row in metal_m_feature_matrix_price), leg_height and price.
-- It needs the leg_type_id FK to metal_s_leg_type in order for the admin
-- table's "Leg Type" column/dropdown to work.

ALTER TABLE metal_m_leg_price_matrix
  ADD COLUMN IF NOT EXISTS leg_type_id INT NULL REFERENCES metal_s_leg_type(leg_type_id);

-- Index for quick lookups by leg type.
CREATE INDEX IF NOT EXISTS idx_leg_price_matrix_leg_type
  ON metal_m_leg_price_matrix (leg_type_id);

-- Index for lookups by structure size (matrix_price_id).
CREATE INDEX IF NOT EXISTS idx_leg_price_matrix_matrix_price
  ON metal_m_leg_price_matrix (matrix_price_id);

-- Optional cleanup (only if confirmed unused): there is a typo table from
-- an earlier draft that duplicates this design.
-- DROP TABLE IF EXISTS metel_m_leg_price_matrix;