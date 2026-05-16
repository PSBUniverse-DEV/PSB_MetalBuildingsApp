-- ═══════════════════════════════════════════════════════════════════════════════
-- GTR (GUTTERS) — SCHEMA MIGRATION: Premium-QAS → Premium-DEV
-- Generated: 2025-05-16
-- Purpose: Synchronize all gtr_ tables in Premium-DEV to match Premium-QAS
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ────────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — DATABASE INVENTORY
-- ────────────────────────────────────────────────────────────────────────────────
--
-- TABLES IN QAS (10 total):
--
--   SOURCE/MASTER TABLES (gtr_s_):
--     1.  gtr_s_colors          — Gutter/downspout color catalog
--     2.  gtr_s_discounts       — Discount percentage options
--     3.  gtr_s_leaf_guards     — Leaf guard products & pricing
--     4.  gtr_s_manufacturers   — Manufacturer rates
--     5.  gtr_s_statuses        — Project status labels
--     6.  gtr_s_trip_rates      — Trip rate options
--
--   TRANSACTION TABLE (gtr_t_):
--     7.  gtr_t_projects        — Main gutter projects
--
--   MAPPING/DETAIL TABLES (gtr_m_):
--     8.  gtr_m_project_extras  — Extra line items per project
--     9.  gtr_m_project_sides   — Building sides per project
--    10.  gtr_m_purchorder      — Purchase order details per project
--
-- CROSS-SCHEMA DEPENDENCIES:
--   • gtr_m_purchorder.created_by / updated_by → psb_s_user.user_id
--   • gtr_s_trip_rates.created_by / updated_by → psb_s_user.user_id
--   • gtr_t_projects.created_by / updated_by   → psb_s_user.user_id
--
-- RLS: Enabled on ALL 10 tables (no policies defined — service_role bypass)
--
-- ────────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — STRUCTURAL DIFFERENCE REPORT
-- ────────────────────────────────────────────────────────────────────────────────
--
-- ┌──────────────────────────────┬────────────────────────────────────────────────────────────────┐
-- │ Table                        │ Expected Columns                                               │
-- ├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
-- │ gtr_s_colors                 │ color_id (PK), name (UQ), created_at                           │
-- ├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
-- │ gtr_s_discounts              │ discount_id (PK), percentage, description, created_at          │
-- ├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
-- │ gtr_s_leaf_guards            │ leaf_guard_id (PK), name, price, created_at                    │
-- ├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
-- │ gtr_s_manufacturers          │ manufacturer_id (PK), name, rate, created_at                   │
-- ├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
-- │ gtr_s_statuses               │ status_id (PK), name (UQ), description                        │
-- ├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
-- │ gtr_s_trip_rates             │ trip_id (PK), label, rate, created_at, updated_at,             │
-- │                              │ created_by (FK→psb_s_user), updated_by (FK→psb_s_user)         │
-- ├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
-- │ gtr_t_projects               │ proj_id (PK), project_name, customer, project_address,         │
-- │                              │ status_id (FK), date, trip_id (FK), manufacturer_id (FK),      │
-- │                              │ discount_id (FK), request_link, created_at, updated_at,        │
-- │                              │ leaf_guard_id (FK), cstm_trip_rate, cstm_manufacturer_rate,    │
-- │                              │ cstm_discount_percentage, cstm_leaf_guard_price,               │
-- │                              │ deposit_percent, created_by (FK), updated_by (FK),             │
-- │                              │ total_project_price                                            │
-- ├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
-- │ gtr_m_project_extras         │ extra_id (PK), proj_id (FK), name, quantity, unit_price,       │
-- │                              │ created_at                                                     │
-- ├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
-- │ gtr_m_project_sides          │ side_id (PK), proj_id (FK), side_index, segments, length,      │
-- │                              │ height, downspout_qty, gutter_color_id (FK),                   │
-- │                              │ downspout_color_id (FK), created_at                            │
-- ├──────────────────────────────┼────────────────────────────────────────────────────────────────┤
-- │ gtr_m_purchorder             │ purch_order_id (PK), proj_id (FK, UQ), k_style_gutter_color,   │
-- │                              │ downspout_color, gutter_coil_total_ft, gutter_coil_total_lbs,  │
-- │                              │ right_end_caps_qty, left_end_caps_qty, downpipe_qty,           │
-- │                              │ one_piece_offset_qty, elbow_a_qty, spray_paint_qty,            │
-- │                              │ zip_screws_qty, zip_screws_internal_qty, total_downspouts,     │
-- │                              │ total_endcaps, rectangular_outlets, internal_screws,           │
-- │                              │ hidden_hangers_qty, box_screws_qty, created_at, updated_at,    │
-- │                              │ created_by (FK), updated_by (FK)                               │
-- └──────────────────────────────┴────────────────────────────────────────────────────────────────┘
--
-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — SAFE MIGRATION SQL
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.1  gtr_s_colors
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.gtr_s_colors (
  color_id    BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.2  gtr_s_discounts
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.gtr_s_discounts (
  discount_id  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  percentage   NUMERIC NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.3  gtr_s_leaf_guards
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.gtr_s_leaf_guards (
  leaf_guard_id  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name           TEXT NOT NULL,
  price          NUMERIC NOT NULL,
  created_at     TIMESTAMPTZ
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.4  gtr_s_manufacturers
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.gtr_s_manufacturers (
  manufacturer_id  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name             TEXT NOT NULL,
  rate             NUMERIC NOT NULL,
  created_at       TIMESTAMPTZ
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.5  gtr_s_statuses
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.gtr_s_statuses (
  status_id    BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name         TEXT,
  description  TEXT
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.6  gtr_s_trip_rates
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.gtr_s_trip_rates (
  trip_id     BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  label       TEXT NOT NULL,
  rate        NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  BIGINT,
  updated_by  BIGINT
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.7  gtr_t_projects
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.gtr_t_projects (
  proj_id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_name             TEXT,
  customer                 TEXT,
  project_address          TEXT,
  status_id                BIGINT,
  date                     DATE,
  trip_id                  BIGINT,
  manufacturer_id          BIGINT,
  discount_id              BIGINT,
  request_link             TEXT,
  created_at               TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ,
  leaf_guard_id            BIGINT,
  cstm_trip_rate           NUMERIC,
  cstm_manufacturer_rate   NUMERIC,
  cstm_discount_percentage NUMERIC,
  cstm_leaf_guard_price    NUMERIC,
  deposit_percent          NUMERIC,
  created_by               BIGINT,
  updated_by               BIGINT,
  total_project_price      NUMERIC
);

-- Add columns that may be missing in DEV
ALTER TABLE public.gtr_t_projects
  ADD COLUMN IF NOT EXISTS leaf_guard_id BIGINT;

ALTER TABLE public.gtr_t_projects
  ADD COLUMN IF NOT EXISTS cstm_trip_rate NUMERIC;

ALTER TABLE public.gtr_t_projects
  ADD COLUMN IF NOT EXISTS cstm_manufacturer_rate NUMERIC;

ALTER TABLE public.gtr_t_projects
  ADD COLUMN IF NOT EXISTS cstm_discount_percentage NUMERIC;

ALTER TABLE public.gtr_t_projects
  ADD COLUMN IF NOT EXISTS cstm_leaf_guard_price NUMERIC;

ALTER TABLE public.gtr_t_projects
  ADD COLUMN IF NOT EXISTS deposit_percent NUMERIC;

ALTER TABLE public.gtr_t_projects
  ADD COLUMN IF NOT EXISTS created_by BIGINT;

ALTER TABLE public.gtr_t_projects
  ADD COLUMN IF NOT EXISTS updated_by BIGINT;

ALTER TABLE public.gtr_t_projects
  ADD COLUMN IF NOT EXISTS total_project_price NUMERIC;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.8  gtr_m_project_extras
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.gtr_m_project_extras (
  extra_id    BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  proj_id     BIGINT NOT NULL,
  name        TEXT NOT NULL,
  quantity    INT DEFAULT 1,
  unit_price  NUMERIC DEFAULT 0,
  created_at  TIMESTAMPTZ
);

ALTER TABLE public.gtr_m_project_extras
  ADD COLUMN IF NOT EXISTS quantity INT DEFAULT 1;

ALTER TABLE public.gtr_m_project_extras
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.9  gtr_m_project_sides
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.gtr_m_project_sides (
  side_id             BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  proj_id             BIGINT NOT NULL,
  side_index          INT NOT NULL,
  segments            INT DEFAULT 0,
  length              NUMERIC DEFAULT 0,
  height              NUMERIC DEFAULT 0,
  downspout_qty       INT DEFAULT 0,
  gutter_color_id     BIGINT,
  downspout_color_id  BIGINT,
  created_at          TIMESTAMPTZ
);

ALTER TABLE public.gtr_m_project_sides
  ADD COLUMN IF NOT EXISTS segments INT DEFAULT 0;

ALTER TABLE public.gtr_m_project_sides
  ADD COLUMN IF NOT EXISTS length NUMERIC DEFAULT 0;

ALTER TABLE public.gtr_m_project_sides
  ADD COLUMN IF NOT EXISTS height NUMERIC DEFAULT 0;

ALTER TABLE public.gtr_m_project_sides
  ADD COLUMN IF NOT EXISTS downspout_qty INT DEFAULT 0;

ALTER TABLE public.gtr_m_project_sides
  ADD COLUMN IF NOT EXISTS gutter_color_id BIGINT;

ALTER TABLE public.gtr_m_project_sides
  ADD COLUMN IF NOT EXISTS downspout_color_id BIGINT;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.10 gtr_m_purchorder
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.gtr_m_purchorder (
  purch_order_id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  proj_id                 BIGINT NOT NULL,
  k_style_gutter_color    TEXT,
  downspout_color         TEXT,
  gutter_coil_total_ft    NUMERIC NOT NULL DEFAULT 0,
  gutter_coil_total_lbs   NUMERIC NOT NULL DEFAULT 0,
  right_end_caps_qty      INT NOT NULL DEFAULT 0,
  left_end_caps_qty       INT NOT NULL DEFAULT 0,
  downpipe_qty            INT NOT NULL DEFAULT 0,
  one_piece_offset_qty    INT NOT NULL DEFAULT 0,
  elbow_a_qty             INT NOT NULL DEFAULT 0,
  spray_paint_qty         INT NOT NULL DEFAULT 0,
  zip_screws_qty          INT NOT NULL DEFAULT 0,
  zip_screws_internal_qty INT NOT NULL DEFAULT 0,
  total_downspouts        INT NOT NULL DEFAULT 0,
  total_endcaps           INT NOT NULL DEFAULT 0,
  rectangular_outlets     INT NOT NULL DEFAULT 0,
  internal_screws         INT NOT NULL DEFAULT 0,
  hidden_hangers_qty      INT NOT NULL DEFAULT 0,
  box_screws_qty          INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT NOT NULL,
  updated_by              BIGINT NOT NULL
);

-- Add columns that may be missing in DEV
ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS k_style_gutter_color TEXT;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS downspout_color TEXT;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS gutter_coil_total_ft NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS gutter_coil_total_lbs NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS right_end_caps_qty INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS left_end_caps_qty INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS downpipe_qty INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS one_piece_offset_qty INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS elbow_a_qty INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS spray_paint_qty INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS zip_screws_qty INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS zip_screws_internal_qty INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS total_downspouts INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS total_endcaps INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS rectangular_outlets INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS internal_screws INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS hidden_hangers_qty INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS box_screws_qty INT NOT NULL DEFAULT 0;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS created_by BIGINT;

ALTER TABLE public.gtr_m_purchorder
  ADD COLUMN IF NOT EXISTS updated_by BIGINT;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.11 UNIQUE CONSTRAINTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- gtr_s_colors.name unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gtr_s_colors_name_key'
  ) THEN
    ALTER TABLE public.gtr_s_colors
      ADD CONSTRAINT gtr_s_colors_name_key UNIQUE (name);
  END IF;
END $$;

-- gtr_s_statuses.name unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gtr_s_statuses_name_key'
  ) THEN
    ALTER TABLE public.gtr_s_statuses
      ADD CONSTRAINT gtr_s_statuses_name_key UNIQUE (name);
  END IF;
END $$;

-- gtr_m_purchorder.proj_id unique (one PO per project)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gtr_m_purchorder_proj_id_key'
  ) THEN
    ALTER TABLE public.gtr_m_purchorder
      ADD CONSTRAINT gtr_m_purchorder_proj_id_key UNIQUE (proj_id);
  END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.12 FOREIGN KEYS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- gtr_t_projects → gtr_s_statuses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_status'
  ) THEN
    ALTER TABLE public.gtr_t_projects
      ADD CONSTRAINT fk_projects_status
      FOREIGN KEY (status_id) REFERENCES public.gtr_s_statuses(status_id);
  END IF;
END $$;

-- gtr_t_projects → gtr_s_trip_rates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_trip'
  ) THEN
    ALTER TABLE public.gtr_t_projects
      ADD CONSTRAINT fk_projects_trip
      FOREIGN KEY (trip_id) REFERENCES public.gtr_s_trip_rates(trip_id);
  END IF;
END $$;

-- gtr_t_projects → gtr_s_manufacturers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_manufacturer'
  ) THEN
    ALTER TABLE public.gtr_t_projects
      ADD CONSTRAINT fk_projects_manufacturer
      FOREIGN KEY (manufacturer_id) REFERENCES public.gtr_s_manufacturers(manufacturer_id);
  END IF;
END $$;

-- gtr_t_projects → gtr_s_discounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_discount'
  ) THEN
    ALTER TABLE public.gtr_t_projects
      ADD CONSTRAINT fk_projects_discount
      FOREIGN KEY (discount_id) REFERENCES public.gtr_s_discounts(discount_id);
  END IF;
END $$;

-- gtr_t_projects → gtr_s_leaf_guards
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_leaf_guard'
  ) THEN
    ALTER TABLE public.gtr_t_projects
      ADD CONSTRAINT fk_projects_leaf_guard
      FOREIGN KEY (leaf_guard_id) REFERENCES public.gtr_s_leaf_guards(leaf_guard_id);
  END IF;
END $$;

-- gtr_t_projects → psb_s_user (created_by)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_gtr_projects_created_by'
  ) THEN
    ALTER TABLE public.gtr_t_projects
      ADD CONSTRAINT fk_gtr_projects_created_by
      FOREIGN KEY (created_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- gtr_t_projects → psb_s_user (updated_by)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_gtr_projects_updated_by'
  ) THEN
    ALTER TABLE public.gtr_t_projects
      ADD CONSTRAINT fk_gtr_projects_updated_by
      FOREIGN KEY (updated_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- gtr_m_project_extras → gtr_t_projects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_extras_project'
  ) THEN
    ALTER TABLE public.gtr_m_project_extras
      ADD CONSTRAINT fk_extras_project
      FOREIGN KEY (proj_id) REFERENCES public.gtr_t_projects(proj_id);
  END IF;
END $$;

-- gtr_m_project_sides → gtr_t_projects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_sides_project'
  ) THEN
    ALTER TABLE public.gtr_m_project_sides
      ADD CONSTRAINT fk_sides_project
      FOREIGN KEY (proj_id) REFERENCES public.gtr_t_projects(proj_id);
  END IF;
END $$;

-- gtr_m_project_sides → gtr_s_colors (gutter_color_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_sides_gutter_color'
  ) THEN
    ALTER TABLE public.gtr_m_project_sides
      ADD CONSTRAINT fk_sides_gutter_color
      FOREIGN KEY (gutter_color_id) REFERENCES public.gtr_s_colors(color_id);
  END IF;
END $$;

-- gtr_m_project_sides → gtr_s_colors (downspout_color_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_sides_downspout_color'
  ) THEN
    ALTER TABLE public.gtr_m_project_sides
      ADD CONSTRAINT fk_sides_downspout_color
      FOREIGN KEY (downspout_color_id) REFERENCES public.gtr_s_colors(color_id);
  END IF;
END $$;

-- gtr_m_purchorder → gtr_t_projects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gtr_m_purchorder_proj_id_fkey'
  ) THEN
    ALTER TABLE public.gtr_m_purchorder
      ADD CONSTRAINT gtr_m_purchorder_proj_id_fkey
      FOREIGN KEY (proj_id) REFERENCES public.gtr_t_projects(proj_id);
  END IF;
END $$;

-- gtr_m_purchorder → psb_s_user (created_by)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gtr_m_purchorder_created_by_fkey'
  ) THEN
    ALTER TABLE public.gtr_m_purchorder
      ADD CONSTRAINT gtr_m_purchorder_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- gtr_m_purchorder → psb_s_user (updated_by)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gtr_m_purchorder_updated_by_fkey'
  ) THEN
    ALTER TABLE public.gtr_m_purchorder
      ADD CONSTRAINT gtr_m_purchorder_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- gtr_s_trip_rates → psb_s_user (created_by)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_trip_rates_created_by'
  ) THEN
    ALTER TABLE public.gtr_s_trip_rates
      ADD CONSTRAINT fk_trip_rates_created_by
      FOREIGN KEY (created_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- gtr_s_trip_rates → psb_s_user (updated_by)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_trip_rates_updated_by'
  ) THEN
    ALTER TABLE public.gtr_s_trip_rates
      ADD CONSTRAINT fk_trip_rates_updated_by
      FOREIGN KEY (updated_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.13 INDEXES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_project_extras_project_id
  ON public.gtr_m_project_extras(proj_id);

CREATE INDEX IF NOT EXISTS idx_project_sides_project_id
  ON public.gtr_m_project_sides(proj_id);

CREATE INDEX IF NOT EXISTS idx_gtr_t_projects_total_project_price
  ON public.gtr_t_projects(total_project_price);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.14 ROW LEVEL SECURITY (enable on all tables, no policies — service_role)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE public.gtr_s_colors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtr_s_discounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtr_s_leaf_guards     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtr_s_manufacturers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtr_s_statuses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtr_s_trip_rates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtr_t_projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtr_m_project_extras  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtr_m_project_sides   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtr_m_purchorder      ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — VALIDATION QUERIES
-- ════════════════════════════════════════════════════════════════════════════════

-- 4.1 Verify all expected gtr_ tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'gtr_%'
ORDER BY table_name;

-- 4.2 Verify gtr_t_projects has all expected columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'gtr_t_projects'
ORDER BY ordinal_position;

-- 4.3 Verify gtr_m_purchorder has all expected columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'gtr_m_purchorder'
ORDER BY ordinal_position;

-- 4.4 Verify FK integrity
SELECT tc.table_name, tc.constraint_name, kcu.column_name,
       ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name LIKE 'gtr_%'
ORDER BY tc.table_name;

-- 4.5 Row counts for all gtr_ tables
SELECT
  schemaname || '.' || relname AS table_name,
  n_live_tup AS approx_row_count
FROM pg_stat_user_tables
WHERE relname LIKE 'gtr_%'
ORDER BY relname;

-- 4.6 Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'gtr_%';

-- 4.7 Verify unique constraints
SELECT conname, contype
FROM pg_constraint
WHERE conrelid IN (
  SELECT oid FROM pg_class WHERE relname LIKE 'gtr_%'
)
AND contype = 'u';

-- 4.8 Index listing
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'gtr_%'
ORDER BY tablename, indexname;

-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — RISK ANALYSIS
-- ════════════════════════════════════════════════════════════════════════════════
--
-- ┌──────────────────────────────────────────────────────────────────────────────┐
-- │ Risk                            │ Severity │ Mitigation                      │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ FK to psb_s_user may fail if    │ MEDIUM   │ Ensure psb_ migration ran first │
-- │ psb_s_user doesn't exist in DEV │          │ (prerequisite)                  │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ ADD COLUMN ... NOT NULL DEFAULT │ LOW      │ Only applies to new rows.       │
-- │ on gtr_m_purchorder             │          │ Existing rows get default fill. │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ UNIQUE on gtr_s_colors.name     │ LOW      │ Only added if constraint is     │
-- │ may fail if duplicates exist    │          │ missing (checked via DO block)  │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ RLS enabled with no policies    │ INFO     │ service_role bypasses RLS.      │
-- │                                 │          │ anon/authenticated will be      │
-- │                                 │          │ blocked (intended behavior).    │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ Identity column type (GENERATED │ LOW      │ CREATE TABLE IF NOT EXISTS      │
-- │ BY DEFAULT) may differ from     │          │ won't override existing PK      │
-- │ existing SERIAL/BIGSERIAL       │          │ generation strategy.            │
-- └─────────────────────────────────┴──────────┴─────────────────────────────────┘
--
-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — EXECUTION ORDER
-- ════════════════════════════════════════════════════════════════════════════════
--
-- PREREQUISITES:
--   ✓ psb_ migration must be complete (psb_s_user must exist for FK refs)
--   ✓ metal_ migration must be complete (if any cross-refs exist)
--
-- EXECUTION:
--   1. CREATE gtr_s_colors         (no dependencies)
--   2. CREATE gtr_s_discounts      (no dependencies)
--   3. CREATE gtr_s_leaf_guards    (no dependencies)
--   4. CREATE gtr_s_manufacturers  (no dependencies)
--   5. CREATE gtr_s_statuses       (no dependencies)
--   6. CREATE gtr_s_trip_rates     (depends on: psb_s_user)
--   7. CREATE gtr_t_projects       (depends on: gtr_s_statuses, gtr_s_trip_rates,
--                                    gtr_s_manufacturers, gtr_s_discounts,
--                                    gtr_s_leaf_guards, psb_s_user)
--   8. CREATE gtr_m_project_extras (depends on: gtr_t_projects)
--   9. CREATE gtr_m_project_sides  (depends on: gtr_t_projects, gtr_s_colors)
--  10. CREATE gtr_m_purchorder     (depends on: gtr_t_projects, psb_s_user)
--  11. ADD UNIQUE CONSTRAINTS
--  12. ADD FOREIGN KEYS
--  13. CREATE INDEXES
--  14. ENABLE ROW LEVEL SECURITY
--  15. RUN VALIDATION QUERIES
--
-- ════════════════════════════════════════════════════════════════════════════════
-- METADATA SUMMARY
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Total tables audited:           10
-- Total potentially missing:      0 (all likely exist in DEV)
-- Total tables with ALTERs:       4 (gtr_t_projects, gtr_m_project_extras,
--                                     gtr_m_project_sides, gtr_m_purchorder)
-- Total indexes added:            3
-- Total FK constraints:           16
-- Total unique constraints:       3
-- RLS enabled on:                 10 tables (no policies)
--
-- ════════════════════════════════════════════════════════════════════════════════
-- SYNC CHECKLIST
-- ════════════════════════════════════════════════════════════════════════════════
--
-- [ ] 1. Verify psb_ migration has already been run on Premium-DEV
-- [ ] 2. Take a database backup of Premium-DEV
-- [ ] 3. Open Supabase SQL Editor on Premium-DEV
-- [ ] 4. Paste the entire BEGIN...COMMIT block (Section 3)
-- [ ] 5. Run and verify no errors
-- [ ] 6. Run validation queries (Section 4) one by one
-- [ ] 7. Verify table count = 10 gtr_ tables
-- [ ] 8. Verify gtr_t_projects has all columns (especially cstm_*, total_project_price)
-- [ ] 9. Verify FK integrity query shows all 16 foreign keys
-- [ ] 10. Verify RLS is enabled on all 10 tables
-- [ ] 11. Test the deployed app: gutter projects load, create, edit
-- [ ] 12. If issues arise, restore from backup taken in step 2
--
-- ════════════════════════════════════════════════════════════════════════════════
