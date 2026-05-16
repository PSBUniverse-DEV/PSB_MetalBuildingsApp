-- ═══════════════════════════════════════════════════════════════════════════════
-- PSB PLATFORM — PATCH MIGRATION: Fix missing columns, FKs, and constraint names
-- Generated: 2025-05-16
-- Purpose: Supplement the original psb_ migration with gaps found via DB audit
-- Target: Premium-DEV
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- GAPS IDENTIFIED:
--   • Missing created_by/updated_by columns on psb_s_company, psb_s_role,
--     psb_s_status, psb_m_userapproleaccess
--   • Missing 13 FK constraints (mostly created_by/updated_by + mapping table FKs)
--   • 5 constraint name mismatches (functional duplicates — harmless but untidy)
--
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. ADD MISSING COLUMNS (created_by / updated_by)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE public.psb_s_company
  ADD COLUMN IF NOT EXISTS created_by BIGINT;

ALTER TABLE public.psb_s_company
  ADD COLUMN IF NOT EXISTS updated_by BIGINT;

ALTER TABLE public.psb_s_role
  ADD COLUMN IF NOT EXISTS created_by BIGINT;

ALTER TABLE public.psb_s_role
  ADD COLUMN IF NOT EXISTS updated_by BIGINT;

ALTER TABLE public.psb_s_status
  ADD COLUMN IF NOT EXISTS created_by BIGINT;

ALTER TABLE public.psb_s_status
  ADD COLUMN IF NOT EXISTS updated_by BIGINT;

ALTER TABLE public.psb_m_userapproleaccess
  ADD COLUMN IF NOT EXISTS created_by BIGINT;

ALTER TABLE public.psb_m_userapproleaccess
  ADD COLUMN IF NOT EXISTS updated_by BIGINT;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. ADD MISSING FOREIGN KEYS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- psb_m_appcardroleaccess.card_id → psb_s_appcard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_acr_card'
  ) THEN
    ALTER TABLE public.psb_m_appcardroleaccess
      ADD CONSTRAINT fk_acr_card
      FOREIGN KEY (card_id) REFERENCES public.psb_s_appcard(card_id);
  END IF;
END $$;

-- psb_m_appcardroleaccess.role_id → psb_s_role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_acr_role'
  ) THEN
    ALTER TABLE public.psb_m_appcardroleaccess
      ADD CONSTRAINT fk_acr_role
      FOREIGN KEY (role_id) REFERENCES public.psb_s_role(role_id);
  END IF;
END $$;

-- psb_m_userapproleaccess.user_id → psb_s_user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_uar_user'
  ) THEN
    ALTER TABLE public.psb_m_userapproleaccess
      ADD CONSTRAINT fk_uar_user
      FOREIGN KEY (user_id) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- psb_m_userapproleaccess.app_id → psb_s_application
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_uar_app'
  ) THEN
    ALTER TABLE public.psb_m_userapproleaccess
      ADD CONSTRAINT fk_uar_app
      FOREIGN KEY (app_id) REFERENCES public.psb_s_application(app_id);
  END IF;
END $$;

-- psb_m_userapproleaccess.role_id → psb_s_role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_uar_role'
  ) THEN
    ALTER TABLE public.psb_m_userapproleaccess
      ADD CONSTRAINT fk_uar_role
      FOREIGN KEY (role_id) REFERENCES public.psb_s_role(role_id);
  END IF;
END $$;

-- psb_m_userapproleaccess.created_by → psb_s_user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'psb_m_userapproleaccess_created_by_fkey'
  ) THEN
    ALTER TABLE public.psb_m_userapproleaccess
      ADD CONSTRAINT psb_m_userapproleaccess_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- psb_m_userapproleaccess.updated_by → psb_s_user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'psb_m_userapproleaccess_updated_by_fkey'
  ) THEN
    ALTER TABLE public.psb_m_userapproleaccess
      ADD CONSTRAINT psb_m_userapproleaccess_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- psb_s_company.created_by → psb_s_user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'psb_s_company_created_by_fkey'
  ) THEN
    ALTER TABLE public.psb_s_company
      ADD CONSTRAINT psb_s_company_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- psb_s_company.updated_by → psb_s_user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'psb_s_company_updated_by_fkey'
  ) THEN
    ALTER TABLE public.psb_s_company
      ADD CONSTRAINT psb_s_company_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- psb_s_role.created_by → psb_s_user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'psb_s_role_created_by_fkey'
  ) THEN
    ALTER TABLE public.psb_s_role
      ADD CONSTRAINT psb_s_role_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- psb_s_role.updated_by → psb_s_user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'psb_s_role_updated_by_fkey'
  ) THEN
    ALTER TABLE public.psb_s_role
      ADD CONSTRAINT psb_s_role_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- psb_s_status.created_by → psb_s_user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'psb_s_status_created_by_fkey'
  ) THEN
    ALTER TABLE public.psb_s_status
      ADD CONSTRAINT psb_s_status_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- psb_s_status.updated_by → psb_s_user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'psb_s_status_updated_by_fkey'
  ) THEN
    ALTER TABLE public.psb_s_status
      ADD CONSTRAINT psb_s_status_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.psb_s_user(user_id);
  END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. FIX CONSTRAINT NAME MISMATCHES
--    (drop wrong-named constraints from original migration, add correct names)
--    Only runs if the wrong-named constraint exists.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- fk_department_company → fk_dept_company
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_department_company') THEN
    ALTER TABLE public.psb_s_department DROP CONSTRAINT fk_department_company;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dept_company') THEN
    ALTER TABLE public.psb_s_department
      ADD CONSTRAINT fk_dept_company
      FOREIGN KEY (comp_id) REFERENCES public.psb_s_company(comp_id);
  END IF;
END $$;

-- fk_role_application → psb_s_role_app_id_fkey
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_role_application') THEN
    ALTER TABLE public.psb_s_role DROP CONSTRAINT fk_role_application;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'psb_s_role_app_id_fkey') THEN
    ALTER TABLE public.psb_s_role
      ADD CONSTRAINT psb_s_role_app_id_fkey
      FOREIGN KEY (app_id) REFERENCES public.psb_s_application(app_id);
  END IF;
END $$;

-- fk_appcard_application → fk_card_app
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_appcard_application') THEN
    ALTER TABLE public.psb_s_appcard DROP CONSTRAINT fk_appcard_application;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_card_app') THEN
    ALTER TABLE public.psb_s_appcard
      ADD CONSTRAINT fk_card_app
      FOREIGN KEY (app_id) REFERENCES public.psb_s_application(app_id);
  END IF;
END $$;

-- fk_appcardgroup_application → fk_group_app
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_appcardgroup_application') THEN
    ALTER TABLE public.psb_m_appcardgroup DROP CONSTRAINT fk_appcardgroup_application;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_group_app') THEN
    ALTER TABLE public.psb_m_appcardgroup
      ADD CONSTRAINT fk_group_app
      FOREIGN KEY (app_id) REFERENCES public.psb_s_application(app_id);
  END IF;
END $$;

-- fk_appcard_group → fk_card_group
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_appcard_group') THEN
    ALTER TABLE public.psb_s_appcard DROP CONSTRAINT fk_appcard_group;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_card_group') THEN
    ALTER TABLE public.psb_s_appcard
      ADD CONSTRAINT fk_card_group
      FOREIGN KEY (group_id) REFERENCES public.psb_m_appcardgroup(group_id);
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════
-- VALIDATION
-- ════════════════════════════════════════════════════════════════════════════════

-- Verify all 21 FKs now exist with correct names
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
  AND tc.table_schema = ccu.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name LIKE 'psb_%'
ORDER BY tc.table_name, tc.constraint_name;

-- Expected: 21 rows matching QAS exactly
