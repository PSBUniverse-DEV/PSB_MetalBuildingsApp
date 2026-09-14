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

-- ═══════════════════════════════════════════════════════════
-- VIEW: metal_vw_leg_price_lookup
--
-- Exposes leg-height upgrade prices scoped by region + style + width/length.
-- Joins:
--   metal_s_region            -> region multiplier
--   metal_m_feature_matrix_price -> structure size (width, length, style_id)
--   metal_m_leg_price_matrix    -> leg height price rows
--   metal_m_region_legprice_matrix -> region assignments for leg price rows
--
-- The V1 configurator queries this view with:
--   region_id, style_id, width, length, leg_height
-- and expects columns including leg_price, leg_matrix_id, leg_type_id,
-- region_multiplier.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.metal_vw_leg_price_lookup AS
SELECT
  r.region_id,
  r.multiplier AS region_multiplier,
  s.style_id,
  s.name AS style_name,
  fmp.width,
  fmp.length,
  lpm.leg_matrix_id,
  lpm.leg_type_id,
  lt.name AS leg_type_name,
  lpm.leg_height,
  lpm.price AS leg_price
FROM public.metal_m_leg_price_matrix lpm
JOIN public.metal_m_feature_matrix_price fmp
  ON fmp.matrix_price_id = lpm.matrix_price_id
JOIN public.metal_s_style s
  ON s.style_id = fmp.style_id
JOIN public.metal_m_region_legprice_matrix rlm
  ON rlm.leg_matrix_id = lpm.leg_matrix_id
JOIN public.metal_s_region r
  ON r.region_id = rlm.region_id
LEFT JOIN public.metal_s_leg_type lt
  ON lt.leg_type_id = lpm.leg_type_id
WHERE fmp.is_active = true
  AND r.is_active = true;