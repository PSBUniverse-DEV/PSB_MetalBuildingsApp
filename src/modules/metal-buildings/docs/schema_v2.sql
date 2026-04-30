-- ═══════════════════════════════════════════════════════════
-- METAL BUILDINGS — SCHEMA v2 (simplified)
-- Drop old tables first, then recreate with minimal set.
-- ═══════════════════════════════════════════════════════════

-- ─── DROP OLD TABLES ───────────────────────────────────────

DROP TABLE IF EXISTS metal_t_quote_line_item;
DROP TABLE IF EXISTS metal_t_quote;
DROP TABLE IF EXISTS metal_m_discount_rule;
DROP TABLE IF EXISTS metal_m_feature_dimension;
DROP TABLE IF EXISTS metal_m_feature_rate;
DROP TABLE IF EXISTS metal_m_feature_matrix_price;
DROP TABLE IF EXISTS metal_s_feature_option;
DROP TABLE IF EXISTS metal_s_feature;

-- ─── SETUP: FEATURES ──────────────────────────────────────

CREATE TABLE metal_s_feature (
  feature_id    SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  pricing_type  VARCHAR(20) NOT NULL CHECK (pricing_type IN ('MATRIX', 'RATE', 'FIXED')),
  description   TEXT,
  category      VARCHAR(50),
  label         VARCHAR(100),
  input_type    VARCHAR(20) CHECK (input_type IN ('dropdown', 'checkbox', 'input', 'radio')),
  is_required   BOOLEAN DEFAULT false,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── MAPPING: MATRIX PRICES (width × length × height → price) ──

CREATE TABLE metal_m_feature_matrix_price (
  matrix_price_id  SERIAL PRIMARY KEY,
  feature_id       INT NOT NULL REFERENCES metal_s_feature(feature_id),
  width            INT NULL,
  length           INT NULL,
  height           INT NULL,
  price            DECIMAL(10,2) NOT NULL,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ─── MAPPING: RATE PRICES (rate × measurement) ────────────

CREATE TABLE metal_m_feature_rate (
  rate_id       SERIAL PRIMARY KEY,
  feature_id    INT NOT NULL REFERENCES metal_s_feature(feature_id),
  rate          DECIMAL(10,2) NOT NULL,
  unit          VARCHAR(20) NOT NULL CHECK (unit IN ('sqft', 'linear_ft')),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── SETUP: FIXED OPTIONS (named choices with flat price) ──

CREATE TABLE metal_s_feature_option (
  option_id     SERIAL PRIMARY KEY,
  feature_id    INT NOT NULL REFERENCES metal_s_feature(feature_id),
  name          VARCHAR(100) NOT NULL,
  price         DECIMAL(10,2) NOT NULL,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
