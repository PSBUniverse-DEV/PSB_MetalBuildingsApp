-- ═══════════════════════════════════════════════════════════
-- METAL BUILDINGS — Migration: Roof Style range pricing columns
-- Adds width_max / length_max / roof_stye to metal_m_feature_matrix_price
-- for the "Roof Style" feature.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE metal_m_feature_matrix_price
  ADD COLUMN IF NOT EXISTS width_max    INT NULL,
  ADD COLUMN IF NOT EXISTS length_max   INT NULL,
  ADD COLUMN IF NOT EXISTS roof_stye    TEXT NULL;
