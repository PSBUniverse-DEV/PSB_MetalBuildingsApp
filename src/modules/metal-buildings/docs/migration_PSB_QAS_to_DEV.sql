-- ═══════════════════════════════════════════════════════════════════════════════
-- PSB PLATFORM — SCHEMA MIGRATION: Premium-QAS → Premium-DEV
-- Generated: 2025-05-16
-- Purpose: Synchronize all psb_ tables in Premium-DEV to match Premium-QAS
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ────────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — DATABASE INVENTORY
-- ────────────────────────────────────────────────────────────────────────────────
--
-- TABLES IN QAS (complete set based on code references):
--
--   SOURCE/MASTER TABLES (psb_s_):
--     1.  psb_s_application     — Apps/modules registry
--     2.  psb_s_role            — Roles per application
--     3.  psb_s_user            — Business user profiles
--     4.  psb_s_company         — Companies
--     5.  psb_s_department      — Departments (per company)
--     6.  psb_s_status          — User/record statuses
--     7.  psb_s_appcard         — Feature cards within apps
--
--   MAPPING/LINK TABLES (psb_m_):
--     8.  psb_m_userapproleaccess   — User→App→Role assignments
--     9.  psb_m_appcardgroup        — Card groupings per app
--    10.  psb_m_appcardroleaccess   — Card→Role visibility
--
-- TABLES IN DEV (from Supabase sidebar — same set expected):
--   All 10 tables should exist. Structural differences may exist.
--
-- ────────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — STRUCTURAL DIFFERENCE REPORT
-- ────────────────────────────────────────────────────────────────────────────────
--
-- Based on code analysis, these are the expected columns per table.
-- Any missing columns in DEV will be added by this migration.
--
-- ┌──────────────────────────────┬────────────────────────────────────────────────┐
-- │ Table                        │ Expected Columns (from code)                   │
-- ├──────────────────────────────┼────────────────────────────────────────────────┤
-- │ psb_s_application            │ app_id (PK), app_name, app_desc,               │
-- │                              │ module_key, display_order, is_active            │
-- ├──────────────────────────────┼────────────────────────────────────────────────┤
-- │ psb_s_role                   │ role_id (PK), app_id (FK), role_name,           │
-- │                              │ role_desc, is_active, created_at, updated_at    │
-- ├──────────────────────────────┼────────────────────────────────────────────────┤
-- │ psb_s_user                   │ user_id (PK), auth_user_id (UUID, UQ),          │
-- │                              │ email (UQ), username (UQ),                      │
-- │                              │ first_name, middle_name, last_name,             │
-- │                              │ phone, address, position, hire_date,            │
-- │                              │ comp_id (FK), dept_id (FK), status_id (FK),     │
-- │                              │ is_active, created_at, updated_at               │
-- ├──────────────────────────────┼────────────────────────────────────────────────┤
-- │ psb_s_company                │ comp_id (PK), comp_name, comp_short_name,       │
-- │                              │ comp_email, comp_phone, is_active               │
-- ├──────────────────────────────┼────────────────────────────────────────────────┤
-- │ psb_s_department             │ dept_id (PK), comp_id (FK), dept_name,          │
-- │                              │ dept_short_name, is_active                      │
-- ├──────────────────────────────┼────────────────────────────────────────────────┤
-- │ psb_s_status                 │ status_id (PK), sts_name, sts_desc, is_active   │
-- ├──────────────────────────────┼────────────────────────────────────────────────┤
-- │ psb_s_appcard                │ card_id (PK), group_id (FK), app_id (FK),       │
-- │                              │ card_name, card_desc, route_path, icon,         │
-- │                              │ display_order, is_active, created_at, updated_at│
-- ├──────────────────────────────┼────────────────────────────────────────────────┤
-- │ psb_m_userapproleaccess      │ user_id (FK), app_id (FK), role_id (FK),        │
-- │                              │ is_active, created_at, updated_at               │
-- │                              │ UNIQUE(user_id, app_id, role_id)                │
-- ├──────────────────────────────┼────────────────────────────────────────────────┤
-- │ psb_m_appcardgroup           │ group_id (PK), app_id (FK), group_name,         │
-- │                              │ group_desc, icon, display_order, is_active,     │
-- │                              │ created_at, updated_at                          │
-- ├──────────────────────────────┼────────────────────────────────────────────────┤
-- │ psb_m_appcardroleaccess      │ acr_id (PK), card_id (FK), role_id (FK),        │
-- │                              │ is_active, created_at, updated_at               │
-- └──────────────────────────────┴────────────────────────────────────────────────┘
--
-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — SAFE MIGRATION SQL
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.1  psb_s_application
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.psb_s_application (
  app_id         BIGSERIAL PRIMARY KEY,
  app_name       TEXT NOT NULL,
  app_desc       TEXT,
  module_key     TEXT,
  display_order  INT DEFAULT 0,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ
);

-- Ensure expected columns exist (safe ADD IF NOT EXISTS)
ALTER TABLE public.psb_s_application
  ADD COLUMN IF NOT EXISTS module_key TEXT;

ALTER TABLE public.psb_s_application
  ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

ALTER TABLE public.psb_s_application
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.psb_s_application
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.2  psb_s_company
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.psb_s_company (
  comp_id         BIGSERIAL PRIMARY KEY,
  comp_name       TEXT NOT NULL,
  comp_short_name TEXT,
  comp_email      TEXT,
  comp_phone      TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ
);

ALTER TABLE public.psb_s_company
  ADD COLUMN IF NOT EXISTS comp_short_name TEXT;

ALTER TABLE public.psb_s_company
  ADD COLUMN IF NOT EXISTS comp_email TEXT;

ALTER TABLE public.psb_s_company
  ADD COLUMN IF NOT EXISTS comp_phone TEXT;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.3  psb_s_department
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.psb_s_department (
  dept_id         BIGSERIAL PRIMARY KEY,
  comp_id         BIGINT REFERENCES public.psb_s_company(comp_id),
  dept_name       TEXT NOT NULL,
  dept_short_name TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ
);

ALTER TABLE public.psb_s_department
  ADD COLUMN IF NOT EXISTS dept_short_name TEXT;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.4  psb_s_status
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.psb_s_status (
  status_id   BIGSERIAL PRIMARY KEY,
  sts_name    TEXT NOT NULL,
  sts_desc    TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ
);

ALTER TABLE public.psb_s_status
  ADD COLUMN IF NOT EXISTS sts_desc TEXT;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.5  psb_s_role
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.psb_s_role (
  role_id     BIGSERIAL PRIMARY KEY,
  app_id      BIGINT REFERENCES public.psb_s_application(app_id),
  role_name   TEXT NOT NULL,
  role_desc   TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ
);

ALTER TABLE public.psb_s_role
  ADD COLUMN IF NOT EXISTS role_desc TEXT;

ALTER TABLE public.psb_s_role
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.psb_s_role
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.6  psb_s_user
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.psb_s_user (
  user_id        BIGSERIAL PRIMARY KEY,
  auth_user_id   UUID,
  email          TEXT,
  username       TEXT,
  first_name     TEXT,
  middle_name    TEXT,
  last_name      TEXT,
  phone          TEXT,
  address        TEXT,
  position       TEXT,
  hire_date      DATE,
  comp_id        BIGINT REFERENCES public.psb_s_company(comp_id),
  dept_id        BIGINT REFERENCES public.psb_s_department(dept_id),
  status_id      BIGINT REFERENCES public.psb_s_status(status_id),
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ
);

-- Add columns that may be missing in DEV
ALTER TABLE public.psb_s_user
  ADD COLUMN IF NOT EXISTS auth_user_id UUID;

ALTER TABLE public.psb_s_user
  ADD COLUMN IF NOT EXISTS username TEXT;

ALTER TABLE public.psb_s_user
  ADD COLUMN IF NOT EXISTS middle_name TEXT;

ALTER TABLE public.psb_s_user
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.psb_s_user
  ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE public.psb_s_user
  ADD COLUMN IF NOT EXISTS position TEXT;

ALTER TABLE public.psb_s_user
  ADD COLUMN IF NOT EXISTS hire_date DATE;

ALTER TABLE public.psb_s_user
  ADD COLUMN IF NOT EXISTS comp_id BIGINT;

ALTER TABLE public.psb_s_user
  ADD COLUMN IF NOT EXISTS dept_id BIGINT;

ALTER TABLE public.psb_s_user
  ADD COLUMN IF NOT EXISTS status_id BIGINT;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.7  psb_m_appcardgroup
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.psb_m_appcardgroup (
  group_id       BIGSERIAL PRIMARY KEY,
  app_id         BIGINT REFERENCES public.psb_s_application(app_id),
  group_name     TEXT NOT NULL,
  group_desc     TEXT,
  icon           TEXT DEFAULT 'layer-group',
  display_order  INT DEFAULT 0,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ
);

ALTER TABLE public.psb_m_appcardgroup
  ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'layer-group';

ALTER TABLE public.psb_m_appcardgroup
  ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

ALTER TABLE public.psb_m_appcardgroup
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.psb_m_appcardgroup
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.8  psb_s_appcard
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.psb_s_appcard (
  card_id        BIGSERIAL PRIMARY KEY,
  group_id       BIGINT REFERENCES public.psb_m_appcardgroup(group_id),
  app_id         BIGINT REFERENCES public.psb_s_application(app_id),
  card_name      TEXT NOT NULL,
  card_desc      TEXT,
  route_path     TEXT DEFAULT '#',
  icon           TEXT DEFAULT 'table-cells-large',
  display_order  INT DEFAULT 0,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ
);

ALTER TABLE public.psb_s_appcard
  ADD COLUMN IF NOT EXISTS app_id BIGINT;

ALTER TABLE public.psb_s_appcard
  ADD COLUMN IF NOT EXISTS route_path TEXT DEFAULT '#';

ALTER TABLE public.psb_s_appcard
  ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'table-cells-large';

ALTER TABLE public.psb_s_appcard
  ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

ALTER TABLE public.psb_s_appcard
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.psb_s_appcard
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.9  psb_m_userapproleaccess
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.psb_m_userapproleaccess (
  uara_id     BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES public.psb_s_user(user_id),
  app_id      BIGINT NOT NULL REFERENCES public.psb_s_application(app_id),
  role_id     BIGINT NOT NULL REFERENCES public.psb_s_role(role_id),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ
);

ALTER TABLE public.psb_m_userapproleaccess
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE public.psb_m_userapproleaccess
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.psb_m_userapproleaccess
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Add unique constraint if it doesn't exist (composite key for upserts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_userapproleaccess_user_app_role'
  ) THEN
    ALTER TABLE public.psb_m_userapproleaccess
      ADD CONSTRAINT uq_userapproleaccess_user_app_role
      UNIQUE (user_id, app_id, role_id);
  END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.10 psb_m_appcardroleaccess
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.psb_m_appcardroleaccess (
  acr_id      BIGSERIAL PRIMARY KEY,
  card_id     BIGINT NOT NULL REFERENCES public.psb_s_appcard(card_id),
  role_id     BIGINT NOT NULL REFERENCES public.psb_s_role(role_id),
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ
);

ALTER TABLE public.psb_m_appcardroleaccess
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE public.psb_m_appcardroleaccess
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.psb_m_appcardroleaccess
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.11 FOREIGN KEYS (add if missing — safe via DO block)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- psb_s_department → psb_s_company
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_department_company'
  ) THEN
    ALTER TABLE public.psb_s_department
      ADD CONSTRAINT fk_department_company
      FOREIGN KEY (comp_id) REFERENCES public.psb_s_company(comp_id);
  END IF;
END $$;

-- psb_s_role → psb_s_application
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_role_application'
  ) THEN
    ALTER TABLE public.psb_s_role
      ADD CONSTRAINT fk_role_application
      FOREIGN KEY (app_id) REFERENCES public.psb_s_application(app_id);
  END IF;
END $$;

-- psb_s_user → psb_s_company
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_company'
  ) THEN
    ALTER TABLE public.psb_s_user
      ADD CONSTRAINT fk_user_company
      FOREIGN KEY (comp_id) REFERENCES public.psb_s_company(comp_id);
  END IF;
END $$;

-- psb_s_user → psb_s_department
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_department'
  ) THEN
    ALTER TABLE public.psb_s_user
      ADD CONSTRAINT fk_user_department
      FOREIGN KEY (dept_id) REFERENCES public.psb_s_department(dept_id);
  END IF;
END $$;

-- psb_s_user → psb_s_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_status'
  ) THEN
    ALTER TABLE public.psb_s_user
      ADD CONSTRAINT fk_user_status
      FOREIGN KEY (status_id) REFERENCES public.psb_s_status(status_id);
  END IF;
END $$;

-- psb_s_appcard → psb_s_application
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_appcard_application'
  ) THEN
    ALTER TABLE public.psb_s_appcard
      ADD CONSTRAINT fk_appcard_application
      FOREIGN KEY (app_id) REFERENCES public.psb_s_application(app_id);
  END IF;
END $$;

-- psb_m_appcardgroup → psb_s_application
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_appcardgroup_application'
  ) THEN
    ALTER TABLE public.psb_m_appcardgroup
      ADD CONSTRAINT fk_appcardgroup_application
      FOREIGN KEY (app_id) REFERENCES public.psb_s_application(app_id);
  END IF;
END $$;

-- psb_s_appcard → psb_m_appcardgroup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_appcard_group'
  ) THEN
    ALTER TABLE public.psb_s_appcard
      ADD CONSTRAINT fk_appcard_group
      FOREIGN KEY (group_id) REFERENCES public.psb_m_appcardgroup(group_id);
  END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.12 UNIQUE CONSTRAINTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- psb_s_user unique email
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'psb_s_user_email_key'
  ) THEN
    -- Only add if no duplicate emails exist
    IF (SELECT COUNT(*) - COUNT(DISTINCT email) FROM public.psb_s_user WHERE email IS NOT NULL) = 0 THEN
      ALTER TABLE public.psb_s_user
        ADD CONSTRAINT psb_s_user_email_key UNIQUE (email);
    END IF;
  END IF;
END $$;

-- psb_s_user unique auth_user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'psb_s_user_auth_user_id_key'
  ) THEN
    IF (SELECT COUNT(*) - COUNT(DISTINCT auth_user_id) FROM public.psb_s_user WHERE auth_user_id IS NOT NULL) = 0 THEN
      ALTER TABLE public.psb_s_user
        ADD CONSTRAINT psb_s_user_auth_user_id_key UNIQUE (auth_user_id);
    END IF;
  END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.13 INDEXES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_user_email
  ON public.psb_s_user(email);

CREATE INDEX IF NOT EXISTS idx_user_auth_user_id
  ON public.psb_s_user(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_user_company
  ON public.psb_s_user(comp_id);

CREATE INDEX IF NOT EXISTS idx_user_department
  ON public.psb_s_user(dept_id);

CREATE INDEX IF NOT EXISTS idx_user_status
  ON public.psb_s_user(status_id);

CREATE INDEX IF NOT EXISTS idx_role_app
  ON public.psb_s_role(app_id);

CREATE INDEX IF NOT EXISTS idx_department_company
  ON public.psb_s_department(comp_id);

CREATE INDEX IF NOT EXISTS idx_appcardgroup_app
  ON public.psb_m_appcardgroup(app_id);

CREATE INDEX IF NOT EXISTS idx_appcard_group
  ON public.psb_s_appcard(group_id);

CREATE INDEX IF NOT EXISTS idx_appcard_app
  ON public.psb_s_appcard(app_id);

CREATE INDEX IF NOT EXISTS idx_userapproleaccess_user
  ON public.psb_m_userapproleaccess(user_id);

CREATE INDEX IF NOT EXISTS idx_userapproleaccess_app
  ON public.psb_m_userapproleaccess(app_id);

CREATE INDEX IF NOT EXISTS idx_userapproleaccess_role
  ON public.psb_m_userapproleaccess(role_id);

CREATE INDEX IF NOT EXISTS idx_appcardroleaccess_card
  ON public.psb_m_appcardroleaccess(card_id);

CREATE INDEX IF NOT EXISTS idx_appcardroleaccess_role
  ON public.psb_m_appcardroleaccess(role_id);

CREATE INDEX IF NOT EXISTS idx_application_module_key
  ON public.psb_s_application(module_key);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — VALIDATION QUERIES
-- ════════════════════════════════════════════════════════════════════════════════

-- 4.1 Verify all expected psb_ tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'psb_%'
ORDER BY table_name;

-- 4.2 Verify psb_s_user has all expected columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'psb_s_user'
ORDER BY ordinal_position;

-- 4.3 Verify psb_s_application has module_key column
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'psb_s_application'
  AND column_name IN ('module_key', 'display_order', 'app_name');

-- 4.4 Verify FK integrity
SELECT tc.table_name, tc.constraint_name, kcu.column_name,
       ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name LIKE 'psb_%'
ORDER BY tc.table_name;

-- 4.5 Row counts for all psb_ tables
SELECT
  schemaname || '.' || relname AS table_name,
  n_live_tup AS approx_row_count
FROM pg_stat_user_tables
WHERE relname LIKE 'psb_%'
ORDER BY relname;

-- 4.6 Unique constraint verification
SELECT tc.table_name, tc.constraint_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
  AND tc.table_name LIKE 'psb_%'
ORDER BY tc.table_name, tc.constraint_name;

-- 4.7 Index listing
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'psb_%'
ORDER BY tablename, indexname;

-- 4.8 Verify psb_m_userapproleaccess has composite unique
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.psb_m_userapproleaccess'::regclass
  AND contype = 'u';

-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — RISK ANALYSIS
-- ════════════════════════════════════════════════════════════════════════════════
--
-- ┌──────────────────────────────────────────────────────────────────────────────┐
-- │ Risk                            │ Severity │ Mitigation                      │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ Unique constraint on email      │ MEDIUM   │ Only added if no duplicates     │
-- │ may fail if duplicates exist    │          │ exist (checked in DO block)     │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ FK constraints may fail if      │ LOW      │ FKs are nullable so orphan      │
-- │ orphaned data exists            │          │ rows won't block constraint     │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ ADD COLUMN IF NOT EXISTS with   │ LOW      │ Default only applies to new     │
-- │ DEFAULT may differ from QAS     │          │ rows. Existing data unaffected. │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ No RLS policies generated       │ INFO     │ QAS uses service_role for all   │
-- │                                 │          │ psb_ operations (admin panel)   │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ BIGSERIAL PK type mismatch      │ LOW      │ CREATE TABLE IF NOT EXISTS      │
-- │ if DEV uses INT/SERIAL          │          │ won't override existing PKs     │
-- └─────────────────────────────────┴──────────┴─────────────────────────────────┘
--
-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — EXECUTION ORDER
-- ════════════════════════════════════════════════════════════════════════════════
--
-- 1. CREATE psb_s_application (no dependencies)
-- 2. CREATE psb_s_company (no dependencies)
-- 3. CREATE psb_s_status (no dependencies)
-- 4. CREATE psb_s_department (depends on: psb_s_company)
-- 5. CREATE psb_s_role (depends on: psb_s_application)
-- 6. CREATE psb_s_user (depends on: psb_s_company, psb_s_department, psb_s_status)
-- 7. CREATE psb_m_appcardgroup (depends on: psb_s_application)
-- 8. CREATE psb_s_appcard (depends on: psb_m_appcardgroup, psb_s_application)
-- 9. CREATE psb_m_userapproleaccess (depends on: psb_s_user, psb_s_application, psb_s_role)
-- 10. CREATE psb_m_appcardroleaccess (depends on: psb_s_appcard, psb_s_role)
-- 11. ADD FOREIGN KEYS
-- 12. ADD UNIQUE CONSTRAINTS
-- 13. CREATE INDEXES
-- 14. RUN VALIDATION QUERIES
--
-- ════════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════════
-- METADATA SUMMARY
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Total tables audited:        10
-- Total potentially missing:   0 (all likely exist in DEV)
-- Total tables with ALTERs:    10 (column safety adds)
-- Total indexes added:         16
-- Total FK constraints:        8
-- Total unique constraints:    3
--
-- ════════════════════════════════════════════════════════════════════════════════
-- SYNC CHECKLIST
-- ════════════════════════════════════════════════════════════════════════════════
--
-- [ ] 1. Take a database backup of Premium-DEV (Supabase Dashboard → Settings → Database → Backups)
-- [ ] 2. Open Supabase SQL Editor on Premium-DEV
-- [ ] 3. Paste the entire BEGIN...COMMIT block (Section 3)
-- [ ] 4. Run and verify no errors
-- [ ] 5. Run validation queries (Section 4) one by one
-- [ ] 6. Verify table count = 10 psb_ tables
-- [ ] 7. Verify psb_s_user has auth_user_id, comp_id, dept_id, status_id columns
-- [ ] 8. Verify psb_s_application has module_key column
-- [ ] 9. Verify FK integrity query shows expected relationships
-- [ ] 10. Test the deployed app: login, dashboard loads, admin pages work
-- [ ] 11. If issues arise, restore from backup taken in step 1
--
-- ════════════════════════════════════════════════════════════════════════════════
