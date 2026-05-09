-- ============================================================
-- metal_m_feature_matrix_price: replace single "price" column
-- with granular price breakdown columns
-- ============================================================

-- 1. Add new columns
ALTER TABLE metal_m_feature_matrix_price
  ADD COLUMN base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN leg_height_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN enclosed_sides_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN enclosed_ends_price NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 2. Migrate existing price data into base_price
UPDATE metal_m_feature_matrix_price
SET base_price = COALESCE(price, 0);

-- 3. Drop the old price column
ALTER TABLE metal_m_feature_matrix_price
  DROP COLUMN price;
