-- ═══════════════════════════════════════════════════════════
-- METAL BUILDINGS — SCHEMA v4 (Materials, Doors/Windows, Colors)
-- Run AFTER schema_v3.sql + seed_v3.sql
-- ═══════════════════════════════════════════════════════════

-- ─── NEW PRICING TYPE: 'PER_WALL' + 'PER_ITEM' + 'COLOR' ──
-- Expand the CHECK constraint on metal_s_feature to allow new types.

ALTER TABLE metal_s_feature
  DROP CONSTRAINT IF EXISTS metal_s_feature_pricing_type_check;

ALTER TABLE metal_s_feature
  ADD CONSTRAINT metal_s_feature_pricing_type_check
  CHECK (pricing_type IN ('MATRIX', 'PANEL', 'RATE', 'FIXED', 'PER_WALL', 'PER_ITEM', 'COLOR'));

-- ═══════════════════════════════════════════════════════════
-- MATERIALS — uses existing FIXED/RATE/PER_WALL types
-- These are just features with category = 'Materials'
-- No new tables needed for most — they use metal_s_feature_option
-- or metal_m_feature_rate already.
--
-- PER_WALL: like "Drip Stop" where user picks yes/no per wall
-- and pricing is per-foot per enabled wall.
-- ═══════════════════════════════════════════════════════════

-- ─── PER_WALL: pricing per enabled wall ───────────────────
-- Rate per linear foot, user selects which walls. 
-- Price = sum of enabled wall lengths × rate.
-- Reuses metal_m_feature_rate for the rate value.
-- Wall selections stored client-side only (sent with quote).

-- ═══════════════════════════════════════════════════════════
-- DOORS & WINDOWS — PER_ITEM pricing type
-- User can add multiple items to any wall.
-- Each item is a catalog entry with a fixed price.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE metal_s_door_window_item (
  item_id       SERIAL PRIMARY KEY,
  feature_id    INT NOT NULL REFERENCES metal_s_feature(feature_id),
  name          VARCHAR(150) NOT NULL,         -- e.g. "36×80 Walk-in Door (Standard)"
  item_type     VARCHAR(20) NOT NULL CHECK (item_type IN ('door', 'window', 'frameout', 'rollup_door', 'vent')),
  price         DECIMAL(10,2) NOT NULL,
  description   TEXT,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- COLORS — COLOR pricing type
-- Groups of color swatches for different parts (roof, trim, siding).
-- Some colors may have an upcharge (premium).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE metal_s_color_group (
  color_group_id  SERIAL PRIMARY KEY,
  feature_id      INT NOT NULL REFERENCES metal_s_feature(feature_id),
  name            VARCHAR(50) NOT NULL,        -- e.g. "Roof", "Trim", "Siding", "Two Tone Siding"
  sort_order      INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT true
);

CREATE TABLE metal_s_color_option (
  color_option_id  SERIAL PRIMARY KEY,
  color_group_id   INT NOT NULL REFERENCES metal_s_color_group(color_group_id),
  name             VARCHAR(80) NOT NULL,       -- e.g. "Barn Red", "Gallery Blue"
  hex_code         VARCHAR(7) NOT NULL,        -- e.g. "#8B0000"
  upcharge         DECIMAL(10,2) DEFAULT 0,    -- 0 = standard, >0 = premium
  sort_order       INT DEFAULT 0,
  is_active        BOOLEAN DEFAULT true
);
