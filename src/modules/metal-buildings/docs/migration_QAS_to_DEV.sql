-- ═══════════════════════════════════════════════════════════════════════════════
-- METAL BUILDINGS — SCHEMA MIGRATION: Premium-QAS → Premium-DEV
-- Generated: 2025-05-16
-- Purpose: Synchronize all metal_ tables in Premium-DEV to match Premium-QAS
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ────────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — DATABASE INVENTORY
-- ────────────────────────────────────────────────────────────────────────────────
--
-- TABLES IN QAS (expected full set based on code references):
--   1.  metal_s_style
--   2.  metal_s_region
--   3.  metal_s_pricing_type          ← lookup table (QAS only)
--   4.  metal_s_category              ← lookup table (QAS only)
--   5.  metal_s_feature
--   6.  metal_s_feature_option
--   7.  metal_s_panel_location
--   8.  metal_s_panel_option
--   9.  metal_s_door_window_item
--  10.  metal_s_color_group
--  11.  metal_s_color_option
--  12.  metal_s_leanto_style
--  13.  metal_s_leanto_side
--  14.  metal_s_style_default
--  15.  metal_m_feature_matrix_price
--  16.  metal_m_feature_rate
--  17.  metal_m_leanto_price
--  18.  metal_m_leanto_style_compat
--
-- TABLES IN DEV (confirmed from sidebar screenshot):
--   metal_m_feature_matrix_price, metal_m_feature_rate,
--   metal_m_leanto_price, metal_m_leanto_style_compat (truncated),
--   metal_s_category, metal_s_color_group, metal_s_color_option,
--   metal_s_door_window_item (truncated)
--   (others likely exist but not fully visible)
--
-- CRITICAL DIFFERENCES IDENTIFIED:
--   • metal_m_feature_matrix_price: DEV has only "price" column;
--     QAS has "base_price", "leg_height_price", "enclosed_sides_price",
--     "enclosed_ends_price" (this causes $NaN + 500 errors)
--   • metal_s_pricing_type: may be MISSING in DEV
--   • metal_s_category: may need audit
--   • metal_s_feature: DEV may lack "pricing_type_id" and "category_id" FK columns
--   • metal_s_style: DEV may lack dimension defaults + render_key columns
--   • metal_s_style_default: may be MISSING in DEV
--   • metal_s_leanto_style: may be MISSING in DEV
--   • metal_s_leanto_side: may be MISSING in DEV
--
-- ────────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — STRUCTURAL DIFFERENCE REPORT
-- ────────────────────────────────────────────────────────────────────────────────
--
-- ┌─────────────────────────────────┬───────────────────────────────────────────┐
-- │ Table                           │ Differences                               │
-- ├─────────────────────────────────┼───────────────────────────────────────────┤
-- │ metal_m_feature_matrix_price    │ Missing: base_price, leg_height_price,    │
-- │                                 │ enclosed_sides_price, enclosed_ends_price  │
-- │                                 │ (DEV has single "price" column instead)   │
-- ├─────────────────────────────────┼───────────────────────────────────────────┤
-- │ metal_s_pricing_type            │ Possibly missing entirely in DEV          │
-- ├─────────────────────────────────┼───────────────────────────────────────────┤
-- │ metal_s_feature                 │ Missing: pricing_type_id (FK),            │
-- │                                 │ category_id (FK). Has old "pricing_type"  │
-- │                                 │ TEXT + "category" TEXT columns             │
-- ├─────────────────────────────────┼───────────────────────────────────────────┤
-- │ metal_s_style                   │ Missing: render_key, default_width,       │
-- │                                 │ default_length, default_height,           │
-- │                                 │ default_roof_overhang, has_walls          │
-- ├─────────────────────────────────┼───────────────────────────────────────────┤
-- │ metal_s_style_default           │ Possibly missing entirely in DEV          │
-- ├─────────────────────────────────┼───────────────────────────────────────────┤
-- │ metal_s_leanto_style            │ Possibly missing entirely in DEV          │
-- ├─────────────────────────────────┼───────────────────────────────────────────┤
-- │ metal_s_leanto_side             │ Possibly missing entirely in DEV          │
-- ├─────────────────────────────────┼───────────────────────────────────────────┤
-- │ metal_m_feature_rate            │ May need CHECK constraint update:         │
-- │                                 │ unit IN ('sqft','linear_ft','linearft',   │
-- │                                 │ 'each')                                   │
-- └─────────────────────────────────┴───────────────────────────────────────────┘
--
-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — SAFE MIGRATION SQL
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.1  LOOKUP TABLES (must exist before FK references)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ─── metal_s_pricing_type ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.metal_s_pricing_type (
  pricing_type_id  SERIAL PRIMARY KEY,
  code             VARCHAR(20) NOT NULL UNIQUE,
  label            VARCHAR(50) NOT NULL,
  sort_order       INT DEFAULT 0,
  is_active        BOOLEAN DEFAULT true
);

-- Seed pricing types (idempotent via ON CONFLICT)
INSERT INTO public.metal_s_pricing_type (code, label, sort_order) VALUES
  ('MATRIX',   'Matrix',        1),
  ('PANEL',    'Panel',         2),
  ('RATE',     'Rate',          3),
  ('FIXED',    'Fixed',         4),
  ('PER_WALL', 'Per Wall',      5),
  ('PER_ITEM', 'Per Item',      6),
  ('COLOR',    'Color',         7)
ON CONFLICT (code) DO NOTHING;

-- ─── metal_s_category ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.metal_s_category (
  category_id  SERIAL PRIMARY KEY,
  name         VARCHAR(100) NOT NULL UNIQUE,
  sort_order   INT DEFAULT 0,
  is_active    BOOLEAN DEFAULT true
);

-- Seed common categories (idempotent)
INSERT INTO public.metal_s_category (name, sort_order) VALUES
  ('Size',       1),
  ('Structure',  2),
  ('Doors',      3),
  ('Windows',    4),
  ('Materials',  5),
  ('Colors',     6)
ON CONFLICT (name) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.2  metal_s_style — ADD MISSING COLUMNS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE public.metal_s_style
  ADD COLUMN IF NOT EXISTS render_key VARCHAR(30);

ALTER TABLE public.metal_s_style
  ADD COLUMN IF NOT EXISTS default_width INT DEFAULT 12;

ALTER TABLE public.metal_s_style
  ADD COLUMN IF NOT EXISTS default_length INT DEFAULT 20;

ALTER TABLE public.metal_s_style
  ADD COLUMN IF NOT EXISTS default_height INT DEFAULT 6;

ALTER TABLE public.metal_s_style
  ADD COLUMN IF NOT EXISTS default_roof_overhang TEXT DEFAULT '0';

ALTER TABLE public.metal_s_style
  ADD COLUMN IF NOT EXISTS default_roof_pitch TEXT;

ALTER TABLE public.metal_s_style
  ADD COLUMN IF NOT EXISTS has_walls BOOLEAN DEFAULT false;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.3  metal_s_feature — ADD FK COLUMNS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE public.metal_s_feature
  ADD COLUMN IF NOT EXISTS pricing_type_id INT REFERENCES public.metal_s_pricing_type(pricing_type_id);

ALTER TABLE public.metal_s_feature
  ADD COLUMN IF NOT EXISTS category_id INT REFERENCES public.metal_s_category(category_id);

-- Backfill pricing_type_id from existing pricing_type text column (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'metal_s_feature' AND column_name = 'pricing_type'
  ) THEN
    EXECUTE '
      UPDATE public.metal_s_feature f
      SET pricing_type_id = pt.pricing_type_id
      FROM public.metal_s_pricing_type pt
      WHERE pt.code = f.pricing_type
        AND f.pricing_type_id IS NULL;
    ';
  END IF;
END $$;

-- Backfill category_id from existing category text column (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'metal_s_feature' AND column_name = 'category'
  ) THEN
    EXECUTE '
      UPDATE public.metal_s_feature f
      SET category_id = c.category_id
      FROM public.metal_s_category c
      WHERE c.name = f.category
        AND f.category_id IS NULL;
    ';
  END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.4  metal_m_feature_matrix_price — ADD PRICE COLUMNS
--      THIS IS THE PRIMARY FIX FOR THE $NaN / 500 ERROR
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Add new price columns alongside existing "price" column
ALTER TABLE public.metal_m_feature_matrix_price
  ADD COLUMN IF NOT EXISTS base_price DECIMAL(10,2);

ALTER TABLE public.metal_m_feature_matrix_price
  ADD COLUMN IF NOT EXISTS leg_height_price DECIMAL(10,2) DEFAULT 0;

ALTER TABLE public.metal_m_feature_matrix_price
  ADD COLUMN IF NOT EXISTS enclosed_sides_price DECIMAL(10,2) DEFAULT 0;

ALTER TABLE public.metal_m_feature_matrix_price
  ADD COLUMN IF NOT EXISTS enclosed_ends_price DECIMAL(10,2) DEFAULT 0;

-- Migrate existing "price" data into "base_price" where base_price is still NULL
UPDATE public.metal_m_feature_matrix_price
SET base_price = price
WHERE base_price IS NULL AND price IS NOT NULL;

-- Set defaults for the new addon-price columns where they're NULL
UPDATE public.metal_m_feature_matrix_price
SET leg_height_price = 0
WHERE leg_height_price IS NULL;

UPDATE public.metal_m_feature_matrix_price
SET enclosed_sides_price = 0
WHERE enclosed_sides_price IS NULL;

UPDATE public.metal_m_feature_matrix_price
SET enclosed_ends_price = 0
WHERE enclosed_ends_price IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.5  metal_m_feature_rate — RELAX unit CHECK CONSTRAINT
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- The UI allows 'each' + 'linearft' (no underscore) in addition to existing values
ALTER TABLE public.metal_m_feature_rate
  DROP CONSTRAINT IF EXISTS metal_m_feature_rate_unit_check;

ALTER TABLE public.metal_m_feature_rate
  ADD CONSTRAINT metal_m_feature_rate_unit_check
  CHECK (unit IN ('sqft', 'linear_ft', 'linearft', 'each'));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.6  metal_s_leanto_style — CREATE IF MISSING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.metal_s_leanto_style (
  leanto_style_id  SERIAL PRIMARY KEY,
  name             VARCHAR(100) NOT NULL,
  description      TEXT,
  render_key       VARCHAR(30),
  default_slope    DECIMAL(5,2),
  sort_order       INT DEFAULT 0,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.7  metal_s_leanto_side — CREATE IF MISSING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.metal_s_leanto_side (
  leanto_side_id  SERIAL PRIMARY KEY,
  name            VARCHAR(50) NOT NULL,
  code            VARCHAR(20) NOT NULL,
  sort_order      INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT true
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.8  metal_m_leanto_price — CREATE IF MISSING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.metal_m_leanto_price (
  leanto_price_id  SERIAL PRIMARY KEY,
  leanto_style_id  INT NOT NULL REFERENCES public.metal_s_leanto_style(leanto_style_id),
  style_id         INT REFERENCES public.metal_s_style(style_id),
  width_ft         INT,
  height_ft        INT,
  length_ft        INT,
  price            DECIMAL(10,2) NOT NULL,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.9  metal_m_leanto_style_compat — CREATE IF MISSING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.metal_m_leanto_style_compat (
  compat_id        SERIAL PRIMARY KEY,
  leanto_style_id  INT NOT NULL REFERENCES public.metal_s_leanto_style(leanto_style_id),
  style_id         INT NOT NULL REFERENCES public.metal_s_style(style_id),
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.10 metal_s_style_default — CREATE IF MISSING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.metal_s_style_default (
  style_default_id  SERIAL PRIMARY KEY,
  style_id          INT NOT NULL REFERENCES public.metal_s_style(style_id),
  feature_id        INT NOT NULL REFERENCES public.metal_s_feature(feature_id),
  option_id         INT REFERENCES public.metal_s_feature_option(option_id),
  is_active         BOOLEAN DEFAULT true,
  UNIQUE(style_id, feature_id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.11 metal_s_door_window_item — CREATE IF MISSING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.metal_s_door_window_item (
  item_id       SERIAL PRIMARY KEY,
  feature_id    INT NOT NULL REFERENCES public.metal_s_feature(feature_id),
  name          VARCHAR(150) NOT NULL,
  item_type     VARCHAR(20) NOT NULL CHECK (item_type IN ('door', 'window', 'frameout', 'rollup_door', 'vent')),
  price         DECIMAL(10,2) NOT NULL,
  description   TEXT,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.12 metal_s_color_group — CREATE IF MISSING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.metal_s_color_group (
  color_group_id  SERIAL PRIMARY KEY,
  feature_id      INT NOT NULL REFERENCES public.metal_s_feature(feature_id),
  name            VARCHAR(50) NOT NULL,
  sort_order      INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT true
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.13 metal_s_color_option — CREATE IF MISSING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.metal_s_color_option (
  color_option_id  SERIAL PRIMARY KEY,
  color_group_id   INT NOT NULL REFERENCES public.metal_s_color_group(color_group_id),
  name             VARCHAR(80) NOT NULL,
  hex_code         VARCHAR(7) NOT NULL,
  upcharge         DECIMAL(10,2) DEFAULT 0,
  sort_order       INT DEFAULT 0,
  is_active        BOOLEAN DEFAULT true
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.14 metal_s_region — ENSURE EXISTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.metal_s_region (
  region_id     SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  state_code    VARCHAR(5) NOT NULL,
  multiplier    DECIMAL(5,3) NOT NULL DEFAULT 1.000,
  is_active     BOOLEAN DEFAULT true
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.15 INDEXES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_matrix_price_feature
  ON public.metal_m_feature_matrix_price(feature_id);

CREATE INDEX IF NOT EXISTS idx_matrix_price_style
  ON public.metal_m_feature_matrix_price(style_id);

CREATE INDEX IF NOT EXISTS idx_matrix_price_active
  ON public.metal_m_feature_matrix_price(is_active);

CREATE INDEX IF NOT EXISTS idx_feature_option_feature
  ON public.metal_s_feature_option(feature_id);

CREATE INDEX IF NOT EXISTS idx_panel_option_feature
  ON public.metal_s_panel_option(feature_id);

CREATE INDEX IF NOT EXISTS idx_panel_location_feature
  ON public.metal_s_panel_location(feature_id);

CREATE INDEX IF NOT EXISTS idx_feature_rate_feature
  ON public.metal_m_feature_rate(feature_id);

CREATE INDEX IF NOT EXISTS idx_color_group_feature
  ON public.metal_s_color_group(feature_id);

CREATE INDEX IF NOT EXISTS idx_color_option_group
  ON public.metal_s_color_option(color_group_id);

CREATE INDEX IF NOT EXISTS idx_leanto_price_style
  ON public.metal_m_leanto_price(leanto_style_id);

CREATE INDEX IF NOT EXISTS idx_leanto_compat_style
  ON public.metal_m_leanto_style_compat(leanto_style_id);

CREATE INDEX IF NOT EXISTS idx_style_default_style
  ON public.metal_s_style_default(style_id);

CREATE INDEX IF NOT EXISTS idx_feature_pricing_type
  ON public.metal_s_feature(pricing_type_id);

CREATE INDEX IF NOT EXISTS idx_feature_category
  ON public.metal_s_feature(category_id);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — VALIDATION QUERIES
-- ════════════════════════════════════════════════════════════════════════════════

-- 4.1 Verify all expected tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'metal_%'
ORDER BY table_name;

-- 4.2 Verify metal_m_feature_matrix_price has new columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'metal_m_feature_matrix_price'
ORDER BY ordinal_position;

-- 4.3 Verify base_price is populated (no NULLs remaining)
SELECT COUNT(*) AS total_rows,
       COUNT(base_price) AS has_base_price,
       COUNT(*) - COUNT(base_price) AS missing_base_price
FROM public.metal_m_feature_matrix_price
WHERE is_active = true;

-- 4.4 Verify metal_s_feature has FK columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'metal_s_feature'
  AND column_name IN ('pricing_type_id', 'category_id');

-- 4.5 Verify pricing_type_id backfill worked
SELECT COUNT(*) AS features_without_pricing_type_id
FROM public.metal_s_feature
WHERE pricing_type_id IS NULL AND is_active = true;

-- 4.6 Verify metal_s_pricing_type has expected data
SELECT * FROM public.metal_s_pricing_type ORDER BY sort_order;

-- 4.7 Verify metal_s_style has new columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'metal_s_style'
  AND column_name IN ('render_key', 'default_width', 'default_length', 'default_height', 'has_walls');

-- 4.8 Row counts for all metal_ tables
SELECT
  schemaname || '.' || relname AS table_name,
  n_live_tup AS approx_row_count
FROM pg_stat_user_tables
WHERE relname LIKE 'metal_%'
ORDER BY relname;

-- 4.9 FK integrity check
SELECT tc.table_name, tc.constraint_name, kcu.column_name,
       ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name LIKE 'metal_%'
ORDER BY tc.table_name;

-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — RISK ANALYSIS
-- ════════════════════════════════════════════════════════════════════════════════
--
-- ┌──────────────────────────────────────────────────────────────────────────────┐
-- │ Risk                         │ Severity │ Mitigation                         │
-- ├──────────────────────────────┼──────────┼────────────────────────────────────┤
-- │ base_price NULL after migration │ HIGH  │ Data migration step copies "price" │
-- │ if "price" column was already   │        │ to "base_price". Validate after.  │
-- │ removed in QAS                  │        │                                   │
-- ├──────────────────────────────┼──────────┼────────────────────────────────────┤
-- │ pricing_type_id backfill     │ MEDIUM   │ Depends on metal_s_pricing_type    │
-- │ may fail if category text    │          │ codes matching exactly. Manual     │
-- │ doesn't match lookup name    │          │ verification required.             │
-- ├──────────────────────────────┼──────────┼────────────────────────────────────┤
-- │ FK creation on tables with   │ LOW      │ Using IF NOT EXISTS + nullable FKs │
-- │ existing orphan data         │          │ avoids blocking.                   │
-- ├──────────────────────────────┼──────────┼────────────────────────────────────┤
-- │ CHECK constraint on unit     │ LOW      │ DROP + re-ADD is safe. Existing    │
-- │                              │          │ data won't violate new constraint. │
-- ├──────────────────────────────┼──────────┼────────────────────────────────────┤
-- │ No RLS policies generated    │ INFO     │ QAS appears to not use RLS for     │
-- │                              │          │ metal_ tables (service role access) │
-- └──────────────────────────────┴──────────┴────────────────────────────────────┘
--
-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — EXECUTION ORDER
-- ════════════════════════════════════════════════════════════════════════════════
--
-- 1. CREATE metal_s_pricing_type (lookup)
-- 2. CREATE metal_s_category (lookup)
-- 3. ALTER metal_s_style (add columns)
-- 4. ALTER metal_s_feature (add pricing_type_id, category_id)
-- 5. ALTER metal_m_feature_matrix_price (add base_price + addon columns)
-- 6. UPDATE metal_m_feature_matrix_price (migrate price → base_price)
-- 7. ALTER metal_m_feature_rate (relax unit constraint)
-- 8. CREATE metal_s_leanto_style
-- 9. CREATE metal_s_leanto_side
-- 10. CREATE metal_m_leanto_price
-- 11. CREATE metal_m_leanto_style_compat
-- 12. CREATE metal_s_style_default
-- 13. CREATE metal_s_door_window_item
-- 14. CREATE metal_s_color_group
-- 15. CREATE metal_s_color_option
-- 16. CREATE metal_s_region (if missing)
-- 17. CREATE INDEXES
-- 18. UPDATE metal_s_feature (backfill pricing_type_id, category_id)
-- 19. RUN validation queries
--
-- ════════════════════════════════════════════════════════════════════════════════

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- OPTIONAL CLEANUP (MANUAL REVIEW REQUIRED)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- After verifying base_price is fully populated and the app is stable,
-- the old "price" column can optionally be dropped:
--
-- ALTER TABLE public.metal_m_feature_matrix_price DROP COLUMN IF EXISTS price;
--
-- Similarly, the old text columns on metal_s_feature can be dropped:
--
-- ALTER TABLE public.metal_s_feature DROP COLUMN IF EXISTS pricing_type;
-- ALTER TABLE public.metal_s_feature DROP COLUMN IF EXISTS category;
--
-- DO NOT run these until fully validated in production.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
