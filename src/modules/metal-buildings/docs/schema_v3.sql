-- ═══════════════════════════════════════════════════════════
-- METAL BUILDINGS — SCHEMA v3 (Style + Region + Panels)
-- Run this against your Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════

-- ─── DROP OLD TABLES (clean slate) ─────────────────────────

DROP TABLE IF EXISTS metal_s_panel_option;
DROP TABLE IF EXISTS metal_s_panel_location;
DROP TABLE IF EXISTS metal_m_feature_rate;
DROP TABLE IF EXISTS metal_m_feature_matrix_price;
DROP TABLE IF EXISTS metal_s_feature_option;
DROP TABLE IF EXISTS metal_s_feature;
DROP TABLE IF EXISTS metal_s_region;
DROP TABLE IF EXISTS metal_s_style;

-- ─── SETUP: STRUCTURE STYLES ──────────────────────────────

CREATE TABLE metal_s_style (
  style_id      SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── SETUP: REGIONS (state-based pricing multiplier) ───────

CREATE TABLE metal_s_region (
  region_id     SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  state_code    VARCHAR(5) NOT NULL,
  multiplier    DECIMAL(5,3) NOT NULL DEFAULT 1.000,
  is_active     BOOLEAN DEFAULT true
);

-- ─── SETUP: FEATURES ──────────────────────────────────────

CREATE TABLE metal_s_feature (
  feature_id    SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  pricing_type  VARCHAR(20) NOT NULL CHECK (pricing_type IN ('MATRIX', 'PANEL', 'RATE', 'FIXED')),
  description   TEXT,
  category      VARCHAR(50),
  is_required   BOOLEAN DEFAULT false,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── MAPPING: MATRIX PRICES (style × width × length × height → price) ──

CREATE TABLE metal_m_feature_matrix_price (
  matrix_price_id  SERIAL PRIMARY KEY,
  feature_id       INT NOT NULL REFERENCES metal_s_feature(feature_id),
  style_id         INT REFERENCES metal_s_style(style_id),
  width            INT NULL,
  length           INT NULL,
  height           INT NULL,
  price            DECIMAL(10,2) NOT NULL,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ─── PANEL: LOCATIONS (the 4 walls of a structure) ─────────

CREATE TABLE metal_s_panel_location (
  location_id   SERIAL PRIMARY KEY,
  feature_id    INT NOT NULL REFERENCES metal_s_feature(feature_id),
  name          VARCHAR(100) NOT NULL,
  location_type VARCHAR(10) NOT NULL CHECK (location_type IN ('end', 'side')),
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT true
);

-- ─── PANEL: OPTIONS per location_type (with price_per_foot) ─

CREATE TABLE metal_s_panel_option (
  option_id       SERIAL PRIMARY KEY,
  feature_id      INT NOT NULL REFERENCES metal_s_feature(feature_id),
  location_type   VARCHAR(10) NOT NULL CHECK (location_type IN ('end', 'side')),
  name            VARCHAR(100) NOT NULL,
  price_per_foot  DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order      INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT true
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
