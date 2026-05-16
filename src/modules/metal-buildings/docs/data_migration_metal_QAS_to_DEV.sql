-- ═══════════════════════════════════════════════════════════════════════════════
-- METAL BUILDINGS — DATA MIGRATION: Premium-QAS → Premium-DEV
-- Generated: 2025-05-17
-- Purpose: Synchronize all metal_ table ROWS from QAS into DEV
-- Strategy: UPSERT (INSERT ... ON CONFLICT DO UPDATE)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ────────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — DATA INVENTORY
-- ────────────────────────────────────────────────────────────────────────────────
--
-- ┌─────────────────────────────────┬──────────┬─────────────────┐
-- │ Table                           │ Rows     │ PK              │
-- ├─────────────────────────────────┼──────────┼─────────────────┤
-- │ metal_s_pricing_type            │ 7        │ pricing_type_id │
-- │ metal_s_category                │ 8        │ category_id     │
-- │ metal_s_style                   │ 6        │ style_id        │
-- │ metal_s_region                  │ 10       │ region_id       │
-- │ metal_s_feature                 │ 26       │ feature_id      │
-- │ metal_s_feature_option          │ 35       │ option_id       │
-- │ metal_s_leanto_style            │ 10       │ leanto_style_id │
-- │ metal_s_leanto_side             │ 4        │ leanto_side_id  │
-- │ metal_s_panel_location          │ 4        │ location_id     │
-- │ metal_s_panel_option            │ 16       │ option_id       │
-- │ metal_s_door_window_item        │ 15       │ item_id         │
-- │ metal_s_color_group             │ 4        │ color_group_id  │
-- │ metal_s_color_option            │ 60       │ color_option_id │
-- │ metal_s_style_default           │ 43       │ style_default_id│
-- │ metal_m_feature_rate            │ 5        │ rate_id         │
-- │ metal_m_leanto_style_compat     │ 50       │ compat_id       │
-- │ metal_m_feature_matrix_price    │ 1,625    │ matrix_price_id │ ← See Section 4
-- │ metal_m_leanto_price            │ 3,600    │ leanto_price_id │ ← See Section 4
-- ├─────────────────────────────────┼──────────┼─────────────────┤
-- │ TOTAL                           │ 5,528    │                 │
-- └─────────────────────────────────┴──────────┴─────────────────┘
--
-- FK DEPENDENCY ORDER:
--   1. metal_s_pricing_type (no deps)
--   2. metal_s_category (no deps)
--   3. metal_s_style (no deps)
--   4. metal_s_region (no deps)
--   5. metal_s_feature (→ pricing_type, category)
--   6. metal_s_feature_option (→ feature)
--   7. metal_s_leanto_style (no deps)
--   8. metal_s_leanto_side (no deps)
--   9. metal_s_panel_location (→ feature)
--  10. metal_s_panel_option (→ feature)
--  11. metal_s_door_window_item (→ feature)
--  12. metal_s_color_group (→ feature)
--  13. metal_s_color_option (→ color_group)
--  14. metal_s_style_default (→ style, feature, feature_option)
--  15. metal_m_feature_rate (→ feature)
--  16. metal_m_leanto_style_compat (→ leanto_style, style)
--  17. metal_m_feature_matrix_price (→ feature, style)
--  18. metal_m_leanto_price (→ leanto_style, style)
--
-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — PREPARATION
-- ════════════════════════════════════════════════════════════════════════════════

-- Temporarily defer FK checks for bulk insert ordering flexibility
BEGIN;
SET CONSTRAINTS ALL DEFERRED;

-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — DATA UPSERTS (Small Tables — Inline VALUES)
-- ════════════════════════════════════════════════════════════════════════════════

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.1  metal_s_pricing_type (7 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_pricing_type (pricing_type_id, code, label, description, sort_order, is_active, created_at, updated_at)
VALUES
  (1, 'MATRIX', 'Matrix', NULL, 1, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (2, 'PANEL', 'Panel', NULL, 2, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (3, 'RATE', 'Rate', NULL, 3, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (4, 'FIXED', 'Fixed', NULL, 4, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (5, 'PER_WALL', 'Per Wall', NULL, 5, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (6, 'PER_ITEM', 'Per Item', NULL, 6, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (7, 'COLOR', 'Color', NULL, 7, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00')
ON CONFLICT (pricing_type_id) DO UPDATE SET
  code = EXCLUDED.code,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.2  metal_s_category (8 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_category (category_id, name, description, sort_order, is_active, created_at, updated_at)
VALUES
  (1, 'Size', NULL, 1, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (2, 'Sides & Ends', NULL, 2, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (3, 'Concrete', NULL, 3, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (4, 'Doors & Windows', NULL, 4, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (5, 'Roofing', NULL, 5, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (6, 'Materials', NULL, 6, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (7, 'Colors', NULL, 7, true, '2026-05-01T15:34:19.256604+00:00', '2026-05-01T15:34:19.256604+00:00'),
  (8, 'Structure', NULL, 0, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00')
ON CONFLICT (name) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.3  metal_s_style (6 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_style (style_id, name, description, sort_order, is_active, created_at, render_key, default_roof_pitch, default_width, default_length, default_height, default_roof_overhang, has_walls)
VALUES
  (1, 'Regular Carport', 'Standard round-roof carport', 1, true, '2026-04-30T17:06:54.446933+00:00', 'regular', 0.15, 12, 20, 6, '0', false),
  (2, 'A-Frame Carport', 'A-frame horizontal roof carport', 2, true, '2026-04-30T17:06:54.446933+00:00', 'aframe', 0.25, 12, 20, 7, '6', false),
  (3, 'A-Frame Vertical', 'A-frame with vertical roof panels', 3, true, '2026-04-30T17:06:54.446933+00:00', 'vertical', 0.25, 12, 20, 8, '6', false),
  (4, 'Garage', 'Fully enclosed garage structure', 4, true, '2026-04-30T17:06:54.446933+00:00', 'garage', 0.25, 22, 25, 8, '6', true),
  (5, 'Barn', 'Agricultural barn style building', 5, true, '2026-04-30T17:06:54.446933+00:00', 'barn', 0.25, 12, 20, 12, '6', true),
  (6, 'Truss', NULL, 6, true, '2026-05-08T15:59:45.789115+00:00', 'truss', 0.25, 32, 20, 10, '6', false)
ON CONFLICT (style_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  render_key = EXCLUDED.render_key,
  default_roof_pitch = EXCLUDED.default_roof_pitch,
  default_width = EXCLUDED.default_width,
  default_length = EXCLUDED.default_length,
  default_height = EXCLUDED.default_height,
  default_roof_overhang = EXCLUDED.default_roof_overhang,
  has_walls = EXCLUDED.has_walls;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.4  metal_s_region (10 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_region (region_id, name, state_code, multiplier, is_active)
VALUES
  (1, 'Michigan', 'MI', 1, true),
  (2, 'Indiana', 'IN', 1, true),
  (3, 'Ohio', 'OH', 1.05, true),
  (4, 'Illinois', 'IL', 1.05, true),
  (5, 'Pennsylvania', 'PA', 1.08, true),
  (6, 'Texas', 'TX', 0.95, true),
  (7, 'Florida', 'FL', 1.03, true),
  (8, 'Georgia', 'GA', 0.98, true),
  (9, 'Tennessee', 'TN', 0.97, true),
  (10, 'North Carolina', 'NC', 1.02, true)
ON CONFLICT (region_id) DO UPDATE SET
  name = EXCLUDED.name,
  state_code = EXCLUDED.state_code,
  multiplier = EXCLUDED.multiplier,
  is_active = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.5  metal_s_feature (26 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_feature (feature_id, name, description, is_required, sort_order, is_active, created_at, updated_at, pricing_type_id, category_id, render_key)
VALUES
  (1, 'Base Structure', 'Base structure pricing by style and size', true, 0, true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00', 1, 1, NULL),
  (2, 'Sides & Ends', 'Wall enclosure options for each side of the structure', false, 0, true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00', 2, 2, NULL),
  (4, 'Perimeter Footings', 'Perimeter footings per linear foot', false, 16, false, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00', 3, 3, NULL),
  (5, 'Walk-in Door', 'Pre-hung walk-in door options', false, 1, true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00', 4, 4, NULL),
  (6, 'Windows', 'Window options for enclosed walls', false, 1, true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00', 4, 4, NULL),
  (7, 'Gutter System', 'Seamless aluminum gutters per linear foot', false, 7, false, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00', 3, 5, NULL),
  (36, 'Frame Gauge', 'Choose your frame gauge', false, 8, true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00', 4, 6, NULL),
  (37, 'Colored Screws', 'Match screw color to your building', false, 9, true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00', 4, 6, NULL),
  (38, 'Extra Bows', 'Additional bracing bows for extra strength', false, 10, false, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00', 3, 6, NULL),
  (39, 'Concrete Sealant', 'Seal the base of your building to the concrete pad', false, 11, true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00', 4, 6, NULL),
  (40, 'Drip Stop', 'Condensation control applied to selected surfaces', false, 11, false, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00', 5, 6, NULL),
  (41, 'Clear Panels', 'Add clear panels to sides - 3'' sections', false, 12, false, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00', 3, 6, NULL),
  (42, 'Insulation Material', 'Choose insulation type for your building', false, 13, true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00', 4, 6, NULL),
  (43, 'Doors & Windows', 'Add doors, windows, and other openings to your walls', false, 1, false, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00', 6, 4, NULL),
  (44, 'Colors', 'Choose colors for your roof, trim, and siding', false, 15, true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00', 7, 7, NULL),
  (45, 'Roof Pitch', NULL, false, 0, true, '2026-05-02T14:03:04.525813+00:00', '2026-05-02T14:03:04.525813+00:00', 4, 5, 'roof_pitch'),
  (46, 'Roof Overhang', NULL, false, 0, true, '2026-05-02T14:03:27.1907+00:00', '2026-05-02T14:03:27.1907+00:00', 4, 5, 'roof_overhang'),
  (47, 'Siding Panel', 'Choose horizontal or vertical panel orientation for wall siding.', false, 18, true, '2026-05-04T15:28:24.599383+00:00', '2026-05-04T15:28:24.599383+00:00', 4, 6, 'siding_panel'),
  (48, 'Frameout', NULL, false, 1, true, '2026-05-09T19:06:37.512615+00:00', '2026-05-09T19:06:37.512615+00:00', 4, 4, NULL),
  (49, 'Installation Surface', 'Ground surface type for installation', true, 10, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00', 4, 8, NULL),
  (50, 'Trusses', 'Truss type for roof structure', true, 20, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00', 4, 8, NULL),
  (51, 'Brace', 'Frame bracing type', true, 30, false, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00', 4, 8, NULL),
  (52, 'Anchor Package', 'Anchoring method based on surface type', true, 40, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00', 4, 8, NULL),
  (53, 'Rollup Door', NULL, false, 0, true, '2026-05-12T16:40:42.520219+00:00', '2026-05-12T16:40:42.520219+00:00', 4, 4, NULL),
  (54, 'vent', NULL, false, 0, false, '2026-05-12T16:41:34.997303+00:00', '2026-05-12T16:41:34.997303+00:00', 4, 4, NULL),
  (55, 'Vent', NULL, false, 0, true, '2026-05-12T16:41:55.760644+00:00', '2026-05-12T16:41:55.760644+00:00', 4, 4, NULL)
ON CONFLICT (feature_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_required = EXCLUDED.is_required,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  pricing_type_id = EXCLUDED.pricing_type_id,
  category_id = EXCLUDED.category_id,
  render_key = EXCLUDED.render_key;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.6  metal_s_feature_option (35 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_feature_option (option_id, feature_id, name, price, sort_order, is_active, created_at, updated_at)
VALUES
  (1, 5, '36x80 Walk-in Door (Standard)', 430, 1, true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00'),
  (2, 5, '36x80 Walk-in Door (9-Lite Glass)', 545, 2, true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00'),
  (3, 5, '36x80 Walk-in Door (Half Glass)', 595, 3, true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00'),
  (4, 5, '36x80 Steel Security Door', 680, 4, true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00'),
  (5, 6, '24x36 Single Window', 185, 1, true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00'),
  (6, 6, '30x36 Single Window', 215, 2, true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00'),
  (7, 6, '36x36 Insulated Window', 425, 3, true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00'),
  (8, 6, '48x36 Double Window', 510, 4, true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00'),
  (25, 36, 'Standard Framing', 0, 1, true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00'),
  (26, 36, '12-Gauge Framing', 350, 2, true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00'),
  (27, 37, 'Colored Screws', 95, 1, true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00'),
  (28, 39, 'Add Concrete Sealant', 150, 1, true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00'),
  (29, 42, 'No Insulation', 0, 1, true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00'),
  (30, 42, '2" Fiberglass', 1.25, 2, true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00'),
  (31, 42, 'Reflective Barrier', 0.85, 3, true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00'),
  (32, 45, '3/12', 0, 0, true, '2026-05-02T14:04:03.594095+00:00', '2026-05-02T14:04:03.594095+00:00'),
  (33, 45, '4/12', 0, 0, true, '2026-05-02T14:04:12.986985+00:00', '2026-05-02T14:04:12.986985+00:00'),
  (34, 45, '5/12', 0, 0, true, '2026-05-02T14:04:21.339822+00:00', '2026-05-02T14:04:21.339822+00:00'),
  (35, 46, '6"', 0, 0, true, '2026-05-02T14:04:33.073548+00:00', '2026-05-02T14:04:33.073548+00:00'),
  (36, 46, '1''', 0, 0, true, '2026-05-02T14:04:41.010326+00:00', '2026-05-02T14:04:41.010326+00:00'),
  (37, 46, '1.5''', 0, 0, true, '2026-05-02T14:17:22.475386+00:00', '2026-05-02T14:17:22.475386+00:00'),
  (38, 47, 'Horizontal', 0, 1, true, '2026-05-04T15:28:28.411303+00:00', '2026-05-04T15:28:28.411303+00:00'),
  (39, 47, 'Vertical', 0, 2, true, '2026-05-04T15:28:28.411303+00:00', '2026-05-04T15:28:28.411303+00:00'),
  (40, 49, 'Gravel', 0, 4, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00'),
  (41, 49, 'Dirt', 0, 2, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00'),
  (42, 49, 'Asphalt', 0, 3, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00'),
  (43, 49, 'Concrete', 0, 1, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00'),
  (44, 50, 'Heavy Duty', 0, 2, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00'),
  (45, 50, 'Standard', 0, 1, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00'),
  (46, 51, 'X-Brace', 0, 2, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00'),
  (47, 51, 'Standard Brace', 0, 1, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00'),
  (48, 52, 'Mobile Home', 0, 4, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00'),
  (49, 52, 'Concrete', 0, 1, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00'),
  (50, 52, 'Ground', 0, 3, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00'),
  (51, 52, 'Asphalt', 0, 2, true, '2026-05-09T19:28:02.068331+00:00', '2026-05-09T19:28:02.068331+00:00')
ON CONFLICT (option_id) DO UPDATE SET
  feature_id = EXCLUDED.feature_id,
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.7  metal_s_leanto_style (10 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_leanto_style (leanto_style_id, name, description, render_key, default_slope, sort_order, is_active, created_at)
VALUES
  (1, 'Single Slope', 'Standard lean-to with single sloped roof away from main building', 'single_slope', 0.25, 1, true, '2026-05-02T16:23:28.048783+00:00'),
  (5, 'Enclosed Lean', 'Fully enclosed lean-to with walls', 'enclosed', 0.25, 1, true, '2026-05-02T16:36:44.239398+00:00'),
  (6, 'Open Lean', 'Open lean-to with posts only', 'open', 0.25, 2, true, '2026-05-02T16:36:44.239398+00:00'),
  (7, 'Enclosed Lean with Storage', 'Enclosed lean-to with interior storage partition', 'enclosed_with_storage', 0.25, 3, true, '2026-05-02T16:36:44.239398+00:00'),
  (8, 'Enclosed Lean', 'Fully enclosed lean-to with walls', 'enclosed', 0.25, 1, true, '2026-05-02T16:44:53.755219+00:00'),
  (9, 'Open Lean', 'Open lean-to with posts only', 'open', 0.25, 2, true, '2026-05-02T16:44:53.755219+00:00'),
  (10, 'Enclosed Lean with Storage', 'Enclosed lean-to with interior storage partition', 'enclosed_with_storage', 0.25, 3, true, '2026-05-02T16:44:53.755219+00:00'),
  (11, 'Enclosed Lean', 'Fully enclosed lean-to with walls', 'enclosed', 0.25, 1, true, '2026-05-02T16:51:17.84938+00:00'),
  (12, 'Open Lean', 'Open lean-to with posts only', 'open', 0.25, 2, true, '2026-05-02T16:51:17.84938+00:00'),
  (13, 'Enclosed Lean with Storage', 'Enclosed lean-to with interior storage partition', 'enclosed_with_storage', 0.25, 3, true, '2026-05-02T16:51:17.84938+00:00')
ON CONFLICT (leanto_style_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  render_key = EXCLUDED.render_key,
  default_slope = EXCLUDED.default_slope,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.8  metal_s_leanto_side (4 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_leanto_side (leanto_side_id, name, side_key, sort_order, is_active)
VALUES
  (1, 'Left', 'left', 1, true),
  (2, 'Right', 'right', 2, true),
  (3, 'Back', 'back', 3, true),
  (8, 'Front', 'front', 3, true)
ON CONFLICT (leanto_side_id) DO UPDATE SET
  name = EXCLUDED.name,
  side_key = EXCLUDED.side_key,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.9  metal_s_panel_location (4 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_panel_location (location_id, feature_id, name, location_type, sort_order, is_active)
VALUES
  (1, 2, 'Front Gable End', 'end', 1, true),
  (2, 2, 'Back Gable End', 'end', 2, true),
  (3, 2, 'Left Sidewall', 'side', 3, true),
  (4, 2, 'Right Sidewall', 'side', 4, true)
ON CONFLICT (location_id) DO UPDATE SET
  feature_id = EXCLUDED.feature_id,
  name = EXCLUDED.name,
  location_type = EXCLUDED.location_type,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.10 metal_s_panel_option (16 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_panel_option (option_id, feature_id, location_type, name, price_per_foot, sort_order, is_active, render_type)
VALUES
  (14, 2, 'end', 'Open', 0, 1, true, 'open'),
  (15, 2, 'end', 'Fully Enclosed', 3.5, 2, true, 'enclosed'),
  (16, 2, 'end', 'Gable End', 2.5, 3, true, 'gable'),
  (17, 2, 'end', 'Extended Gable End - 3'' Panel', 3, 4, true, 'ext_gable_3'),
  (18, 2, 'end', 'Extended Gable End - 6'' Panel', 3.5, 5, true, 'ext_gable_6'),
  (19, 2, 'end', 'Extended Gable End - 9'' Panel', 4, 6, true, 'ext_gable_9'),
  (20, 2, 'end', 'Extended Gable End - 12'' Panel', 4.5, 7, true, 'ext_gable_12'),
  (21, 2, 'end', 'Extended Gable End - 15'' Panel', 5, 8, true, 'ext_gable_15'),
  (22, 2, 'side', 'Open', 0, 1, true, 'open'),
  (23, 2, 'side', 'Fully Enclosed', 3.5, 2, true, 'enclosed'),
  (24, 2, 'side', 'Top - 1 1/2'' Panel', 1.5, 3, true, 'top_1.5'),
  (25, 2, 'side', 'Top - 3'' Panel', 2, 4, true, 'top_3'),
  (26, 2, 'side', 'Top - 6'' Panel', 2.5, 5, true, 'top_6'),
  (27, 2, 'side', 'Top - 9'' Panel', 3, 6, true, 'top_9'),
  (28, 2, 'side', 'Top - 12'' Panel', 3.5, 7, true, 'top_12'),
  (29, 2, 'side', 'Top - 15'' Panel', 4.5, 7, true, 'top_15')
ON CONFLICT (option_id) DO UPDATE SET
  feature_id = EXCLUDED.feature_id,
  location_type = EXCLUDED.location_type,
  name = EXCLUDED.name,
  price_per_foot = EXCLUDED.price_per_foot,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  render_type = EXCLUDED.render_type;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.11 metal_s_door_window_item (15 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_door_window_item (item_id, feature_id, name, item_type, price, description, sort_order, is_active, created_at)
VALUES
  (1, 43, '36×80 Walk-in Door (Standard)', 'door', 430, NULL, 1, true, '2026-04-30T17:55:23.691126+00:00'),
  (2, 43, '36×80 Walk-in Door (9-Lite Glass)', 'door', 545, NULL, 2, true, '2026-04-30T17:55:23.691126+00:00'),
  (3, 43, '36×80 Walk-in Door (Half Glass)', 'door', 595, NULL, 3, true, '2026-04-30T17:55:23.691126+00:00'),
  (4, 43, '36×80 Steel Security Door', 'door', 680, NULL, 4, true, '2026-04-30T17:55:23.691126+00:00'),
  (5, 43, '24×36 Single Window', 'window', 185, NULL, 10, true, '2026-04-30T17:55:23.691126+00:00'),
  (6, 43, '30×36 Single Window', 'window', 215, NULL, 11, true, '2026-04-30T17:55:23.691126+00:00'),
  (7, 43, '36×36 Insulated Window', 'window', 425, NULL, 12, true, '2026-04-30T17:55:23.691126+00:00'),
  (8, 43, '48×36 Double Window', 'window', 510, NULL, 13, true, '2026-04-30T17:55:23.691126+00:00'),
  (9, 43, '36×80 Frameout', 'frameout', 125, NULL, 20, true, '2026-04-30T17:55:23.691126+00:00'),
  (10, 43, '48×80 Frameout', 'frameout', 145, NULL, 21, true, '2026-04-30T17:55:23.691126+00:00'),
  (11, 43, '8×8 Rollup Door', 'rollup_door', 650, NULL, 30, true, '2026-04-30T17:55:23.691126+00:00'),
  (12, 43, '10×10 Rollup Door', 'rollup_door', 850, NULL, 31, true, '2026-04-30T17:55:23.691126+00:00'),
  (13, 43, '12×12 Rollup Door', 'rollup_door', 1100, NULL, 32, true, '2026-04-30T17:55:23.691126+00:00'),
  (14, 43, 'Gable Vent', 'vent', 75, NULL, 40, true, '2026-04-30T17:55:23.691126+00:00'),
  (15, 43, 'Ridge Vent (per ft)', 'vent', 12, NULL, 41, true, '2026-04-30T17:55:23.691126+00:00')
ON CONFLICT (item_id) DO UPDATE SET
  feature_id = EXCLUDED.feature_id,
  name = EXCLUDED.name,
  item_type = EXCLUDED.item_type,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.12 metal_s_color_group (4 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_color_group (color_group_id, feature_id, name, sort_order, is_active, render_target)
VALUES
  (1, 44, 'Roof', 1, true, 'roof'),
  (2, 44, 'Trim', 2, true, 'trim'),
  (3, 44, 'Siding', 3, true, 'wall'),
  (4, 44, 'Two Tone Siding', 4, true, 'two_tone')
ON CONFLICT (color_group_id) DO UPDATE SET
  feature_id = EXCLUDED.feature_id,
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  render_target = EXCLUDED.render_target;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.13 metal_s_color_option (60 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_color_option (color_option_id, color_group_id, name, hex_code, upcharge, sort_order, is_active)
VALUES
  (1, 1, 'Barn Red', '#6B1C23', 0, 1, true),
  (2, 1, 'Evergreen', '#2D5A27', 0, 2, true),
  (3, 1, 'Ocean Blue', '#5F8CA3', 0, 3, true),
  (4, 1, 'Pewter Grey', '#8E9196', 0, 4, true),
  (5, 1, 'Black', '#1C1C1C', 0, 5, true),
  (6, 1, 'Bright White', '#F5F5F5', 0, 6, true),
  (7, 1, 'Burgundy', '#800020', 0, 7, true),
  (8, 1, 'Tan', '#D2B48C', 0, 8, true),
  (9, 1, 'Clay', '#B8860B', 0, 9, true),
  (10, 1, 'Brown', '#5C4033', 0, 10, true),
  (11, 1, 'Sandstone', '#C2B280', 0, 11, true),
  (12, 1, 'Quaker Grey', '#A9A9A9', 0, 12, true),
  (13, 1, 'Red', '#CC0000', 0, 13, true),
  (14, 1, 'Gallery Blue', '#1B3F8B', 0, 14, true),
  (15, 1, 'Burnished Slate', '#4A4A4A', 0, 15, true),
  (16, 1, 'Copper Metallic', '#B87333', 50, 16, true),
  (17, 2, 'Barn Red', '#6B1C23', 0, 1, true),
  (18, 2, 'Evergreen', '#2D5A27', 0, 2, true),
  (19, 2, 'Ocean Blue', '#5F8CA3', 0, 3, true),
  (20, 2, 'Pewter Grey', '#8E9196', 0, 4, true),
  (21, 2, 'Black', '#1C1C1C', 0, 5, true),
  (22, 2, 'Bright White', '#F5F5F5', 0, 6, true),
  (23, 2, 'Burgundy', '#800020', 0, 7, true),
  (24, 2, 'Tan', '#D2B48C', 0, 8, true),
  (25, 2, 'Clay', '#B8860B', 0, 9, true),
  (26, 2, 'Brown', '#5C4033', 0, 10, true),
  (27, 2, 'Sandstone', '#C2B280', 0, 11, true),
  (28, 2, 'Quaker Grey', '#A9A9A9', 0, 12, true),
  (29, 2, 'Red', '#CC0000', 0, 13, true),
  (30, 2, 'Gallery Blue', '#1B3F8B', 0, 14, true),
  (31, 2, 'Burnished Slate', '#4A4A4A', 0, 15, true),
  (32, 2, 'Copper Metallic', '#B87333', 50, 16, true),
  (33, 3, 'Barn Red', '#6B1C23', 0, 1, true),
  (34, 3, 'Evergreen', '#2D5A27', 0, 2, true),
  (35, 3, 'Ocean Blue', '#5F8CA3', 0, 3, true),
  (36, 3, 'Pewter Grey', '#8E9196', 0, 4, true),
  (37, 3, 'Black', '#1C1C1C', 0, 5, true),
  (38, 3, 'Bright White', '#F5F5F5', 0, 6, true),
  (39, 3, 'Burgundy', '#800020', 0, 7, true),
  (40, 3, 'Tan', '#D2B48C', 0, 8, true),
  (41, 3, 'Clay', '#B8860B', 0, 9, true),
  (42, 3, 'Brown', '#5C4033', 0, 10, true),
  (43, 3, 'Sandstone', '#C2B280', 0, 11, true),
  (44, 3, 'Quaker Grey', '#A9A9A9', 0, 12, true),
  (45, 3, 'Red', '#CC0000', 0, 13, true),
  (46, 3, 'Gallery Blue', '#1B3F8B', 0, 14, true),
  (47, 3, 'Burnished Slate', '#4A4A4A', 0, 15, true),
  (48, 3, 'Copper Metallic', '#B87333', 50, 16, true),
  (49, 4, 'None', '#FFFFFF', 0, 0, true),
  (50, 4, 'Barn Red', '#6B1C23', 75, 1, true),
  (51, 4, 'Evergreen', '#2D5A27', 75, 2, true),
  (52, 4, 'Ocean Blue', '#5F8CA3', 75, 3, true),
  (53, 4, 'Pewter Grey', '#8E9196', 75, 4, true),
  (54, 4, 'Black', '#1C1C1C', 75, 5, true),
  (55, 4, 'Bright White', '#F5F5F5', 75, 6, true),
  (56, 4, 'Burgundy', '#800020', 75, 7, true),
  (57, 4, 'Tan', '#D2B48C', 75, 8, true),
  (58, 4, 'Brown', '#5C4033', 75, 9, true),
  (59, 4, 'Gallery Blue', '#1B3F8B', 75, 10, true),
  (60, 4, 'Burnished Slate', '#4A4A4A', 75, 11, true)
ON CONFLICT (color_option_id) DO UPDATE SET
  color_group_id = EXCLUDED.color_group_id,
  name = EXCLUDED.name,
  hex_code = EXCLUDED.hex_code,
  upcharge = EXCLUDED.upcharge,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.14 metal_s_style_default (43 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_s_style_default (style_default_id, style_id, feature_id, option_id, is_active)
VALUES
  (1, 1, 49, 43, true),
  (2, 1, 45, 32, true),
  (3, 1, 50, 45, true),
  (4, 1, 36, 25, true),
  (5, 1, 51, 47, true),
  (6, 1, 52, 49, true),
  (7, 2, 49, 43, true),
  (8, 2, 45, 32, true),
  (9, 2, 46, 35, true),
  (10, 2, 50, 45, true),
  (11, 2, 36, 25, true),
  (12, 2, 51, 47, true),
  (13, 2, 52, 49, true),
  (14, 3, 49, 43, true),
  (15, 3, 45, 32, true),
  (16, 3, 46, 35, true),
  (17, 3, 50, 45, true),
  (18, 3, 36, 25, true),
  (19, 3, 51, 47, true),
  (20, 3, 52, 49, true),
  (21, 4, 49, 43, true),
  (22, 4, 45, 32, true),
  (23, 4, 46, 35, true),
  (24, 4, 50, 45, true),
  (25, 4, 36, 25, true),
  (26, 4, 51, 47, true),
  (27, 4, 52, 49, true),
  (28, 4, 47, 38, true),
  (29, 5, 49, 43, true),
  (30, 5, 45, 32, true),
  (31, 5, 46, 35, true),
  (32, 5, 50, 45, true),
  (33, 5, 36, 25, true),
  (34, 5, 51, 47, true),
  (35, 5, 52, 49, true),
  (36, 5, 47, 38, true),
  (37, 6, 49, 43, true),
  (38, 6, 45, 32, true),
  (39, 6, 46, 35, true),
  (40, 6, 50, 44, true),
  (41, 6, 36, 25, true),
  (42, 6, 51, 47, true),
  (43, 6, 52, 49, true)
ON CONFLICT (style_default_id) DO UPDATE SET
  style_id = EXCLUDED.style_id,
  feature_id = EXCLUDED.feature_id,
  option_id = EXCLUDED.option_id,
  is_active = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.15 metal_m_feature_rate (5 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_m_feature_rate (rate_id, feature_id, rate, unit, is_active, created_at, updated_at)
VALUES
  (2, 4, 12.75, 'linear_ft', true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00'),
  (3, 7, 8.25, 'linear_ft', true, '2026-04-30T17:06:54.446933+00:00', '2026-04-30T17:06:54.446933+00:00'),
  (4, 38, 65, 'linear_ft', true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00'),
  (5, 41, 45, 'linear_ft', true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00'),
  (6, 40, 1.75, 'linear_ft', true, '2026-04-30T17:55:23.691126+00:00', '2026-04-30T17:55:23.691126+00:00')
ON CONFLICT (rate_id) DO UPDATE SET
  feature_id = EXCLUDED.feature_id,
  rate = EXCLUDED.rate,
  unit = EXCLUDED.unit,
  is_active = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.16 metal_m_leanto_style_compat (50 rows)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO public.metal_m_leanto_style_compat (compat_id, leanto_style_id, style_id, is_active)
VALUES
  (1, 1, 1, true),
  (2, 1, 2, true),
  (3, 1, 3, true),
  (4, 1, 4, true),
  (5, 1, 5, true),
  (12, 5, 1, true),
  (13, 5, 2, true),
  (14, 5, 3, true),
  (15, 5, 4, true),
  (16, 5, 5, true),
  (17, 6, 1, true),
  (18, 6, 2, true),
  (19, 6, 3, true),
  (20, 6, 4, true),
  (21, 6, 5, true),
  (22, 7, 1, true),
  (23, 7, 2, true),
  (24, 7, 3, true),
  (25, 7, 4, true),
  (26, 7, 5, true),
  (27, 8, 1, true),
  (28, 8, 2, true),
  (29, 8, 3, true),
  (30, 8, 4, true),
  (31, 8, 5, true),
  (32, 9, 1, true),
  (33, 9, 2, true),
  (34, 9, 3, true),
  (35, 9, 4, true),
  (36, 9, 5, true),
  (37, 10, 1, true),
  (38, 10, 2, true),
  (39, 10, 3, true),
  (40, 10, 4, true),
  (41, 10, 5, true),
  (77, 11, 1, true),
  (78, 11, 2, true),
  (79, 11, 3, true),
  (80, 11, 4, true),
  (81, 11, 5, true),
  (82, 12, 1, true),
  (83, 12, 2, true),
  (84, 12, 3, true),
  (85, 12, 4, true),
  (86, 12, 5, true),
  (87, 13, 1, true),
  (88, 13, 2, true),
  (89, 13, 3, true),
  (90, 13, 4, true),
  (91, 13, 5, true)
ON CONFLICT (compat_id) DO UPDATE SET
  leanto_style_id = EXCLUDED.leanto_style_id,
  style_id = EXCLUDED.style_id,
  is_active = EXCLUDED.is_active;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3.17 RESET SEQUENCES to max(id) + 1
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT setval(pg_get_serial_sequence('public.metal_s_pricing_type', 'pricing_type_id'), COALESCE((SELECT MAX(pricing_type_id) FROM public.metal_s_pricing_type), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_category', 'category_id'), COALESCE((SELECT MAX(category_id) FROM public.metal_s_category), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_style', 'style_id'), COALESCE((SELECT MAX(style_id) FROM public.metal_s_style), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_region', 'region_id'), COALESCE((SELECT MAX(region_id) FROM public.metal_s_region), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_feature', 'feature_id'), COALESCE((SELECT MAX(feature_id) FROM public.metal_s_feature), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_feature_option', 'option_id'), COALESCE((SELECT MAX(option_id) FROM public.metal_s_feature_option), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_leanto_style', 'leanto_style_id'), COALESCE((SELECT MAX(leanto_style_id) FROM public.metal_s_leanto_style), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_leanto_side', 'leanto_side_id'), COALESCE((SELECT MAX(leanto_side_id) FROM public.metal_s_leanto_side), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_panel_location', 'location_id'), COALESCE((SELECT MAX(location_id) FROM public.metal_s_panel_location), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_panel_option', 'option_id'), COALESCE((SELECT MAX(option_id) FROM public.metal_s_panel_option), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_door_window_item', 'item_id'), COALESCE((SELECT MAX(item_id) FROM public.metal_s_door_window_item), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_color_group', 'color_group_id'), COALESCE((SELECT MAX(color_group_id) FROM public.metal_s_color_group), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_color_option', 'color_option_id'), COALESCE((SELECT MAX(color_option_id) FROM public.metal_s_color_option), 1));
SELECT setval(pg_get_serial_sequence('public.metal_s_style_default', 'style_default_id'), COALESCE((SELECT MAX(style_default_id) FROM public.metal_s_style_default), 1));
SELECT setval(pg_get_serial_sequence('public.metal_m_feature_rate', 'rate_id'), COALESCE((SELECT MAX(rate_id) FROM public.metal_m_feature_rate), 1));
SELECT setval(pg_get_serial_sequence('public.metal_m_leanto_style_compat', 'compat_id'), COALESCE((SELECT MAX(compat_id) FROM public.metal_m_leanto_style_compat), 1));

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — LARGE TABLE MIGRATION (metal_m_feature_matrix_price + metal_m_leanto_price)
-- ════════════════════════════════════════════════════════════════════════════════
--
-- These tables have 1,625 and 3,600 rows respectively.
-- Strategy: Run the EXPORT query on QAS, copy the output, paste into DEV.
--
-- ──────────────────────────────────────────────────────────────────────────────
-- 4A. metal_m_feature_matrix_price (1,625 rows)
--     Run this on QAS → copy the single-cell result → paste into DEV SQL editor
-- ──────────────────────────────────────────────────────────────────────────────
--
-- STEP 1: Run on Premium-QAS to generate INSERT statements:
--
--   SELECT
--     'INSERT INTO public.metal_m_feature_matrix_price '
--     || '(matrix_price_id, feature_id, style_id, width, length, base_price, '
--     || 'leg_height_price, enclosed_sides_price, enclosed_ends_price, is_active, created_at) VALUES ('
--     || matrix_price_id || ', '
--     || feature_id || ', '
--     || COALESCE(style_id::text, 'NULL') || ', '
--     || width || ', '
--     || length || ', '
--     || COALESCE(base_price::text, 'NULL') || ', '
--     || COALESCE(leg_height_price::text, '0') || ', '
--     || COALESCE(enclosed_sides_price::text, '0') || ', '
--     || COALESCE(enclosed_ends_price::text, '0') || ', '
--     || is_active || ', '
--     || '''' || created_at::text || ''') '
--     || 'ON CONFLICT (matrix_price_id) DO UPDATE SET '
--     || 'feature_id=EXCLUDED.feature_id, style_id=EXCLUDED.style_id, '
--     || 'width=EXCLUDED.width, length=EXCLUDED.length, '
--     || 'base_price=EXCLUDED.base_price, leg_height_price=EXCLUDED.leg_height_price, '
--     || 'enclosed_sides_price=EXCLUDED.enclosed_sides_price, '
--     || 'enclosed_ends_price=EXCLUDED.enclosed_ends_price, '
--     || 'is_active=EXCLUDED.is_active;'
--   FROM public.metal_m_feature_matrix_price
--   ORDER BY matrix_price_id;
--
-- STEP 2: Copy all rows from the result
-- STEP 3: Wrap in BEGIN; ... COMMIT; and paste into DEV SQL editor
-- STEP 4: Run on DEV
--
-- ──────────────────────────────────────────────────────────────────────────────
-- 4B. metal_m_leanto_price (3,600 rows)
--     Same approach as above.
-- ──────────────────────────────────────────────────────────────────────────────
--
-- STEP 1: Run on Premium-QAS to generate INSERT statements:
--
--   SELECT
--     'INSERT INTO public.metal_m_leanto_price '
--     || '(leanto_price_id, leanto_style_id, style_id, width_ft, height_ft, length_ft, '
--     || 'price, is_active, created_at) VALUES ('
--     || leanto_price_id || ', '
--     || leanto_style_id || ', '
--     || COALESCE(style_id::text, 'NULL') || ', '
--     || COALESCE(width_ft::text, 'NULL') || ', '
--     || COALESCE(height_ft::text, 'NULL') || ', '
--     || COALESCE(length_ft::text, 'NULL') || ', '
--     || price || ', '
--     || is_active || ', '
--     || '''' || created_at::text || ''') '
--     || 'ON CONFLICT (leanto_price_id) DO UPDATE SET '
--     || 'leanto_style_id=EXCLUDED.leanto_style_id, style_id=EXCLUDED.style_id, '
--     || 'width_ft=EXCLUDED.width_ft, height_ft=EXCLUDED.height_ft, '
--     || 'length_ft=EXCLUDED.length_ft, price=EXCLUDED.price, '
--     || 'is_active=EXCLUDED.is_active;'
--   FROM public.metal_m_leanto_price
--   ORDER BY leanto_price_id;
--
-- STEP 2: Copy all rows from the result
-- STEP 3: Wrap in BEGIN; ... COMMIT; and paste into DEV SQL editor
-- STEP 4: After running, reset sequences:
--
--   SELECT setval(pg_get_serial_sequence('public.metal_m_feature_matrix_price', 'matrix_price_id'),
--     COALESCE((SELECT MAX(matrix_price_id) FROM public.metal_m_feature_matrix_price), 1));
--   SELECT setval(pg_get_serial_sequence('public.metal_m_leanto_price', 'leanto_price_id'),
--     COALESCE((SELECT MAX(leanto_price_id) FROM public.metal_m_leanto_price), 1));
--
-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — POST-MIGRATION VALIDATION
-- ════════════════════════════════════════════════════════════════════════════════

-- 5.1 Row counts (run on DEV after migration)
SELECT 'metal_s_pricing_type' AS t, count(*) FROM public.metal_s_pricing_type
UNION ALL SELECT 'metal_s_category', count(*) FROM public.metal_s_category
UNION ALL SELECT 'metal_s_style', count(*) FROM public.metal_s_style
UNION ALL SELECT 'metal_s_region', count(*) FROM public.metal_s_region
UNION ALL SELECT 'metal_s_feature', count(*) FROM public.metal_s_feature
UNION ALL SELECT 'metal_s_feature_option', count(*) FROM public.metal_s_feature_option
UNION ALL SELECT 'metal_s_leanto_style', count(*) FROM public.metal_s_leanto_style
UNION ALL SELECT 'metal_s_leanto_side', count(*) FROM public.metal_s_leanto_side
UNION ALL SELECT 'metal_s_panel_location', count(*) FROM public.metal_s_panel_location
UNION ALL SELECT 'metal_s_panel_option', count(*) FROM public.metal_s_panel_option
UNION ALL SELECT 'metal_s_door_window_item', count(*) FROM public.metal_s_door_window_item
UNION ALL SELECT 'metal_s_color_group', count(*) FROM public.metal_s_color_group
UNION ALL SELECT 'metal_s_color_option', count(*) FROM public.metal_s_color_option
UNION ALL SELECT 'metal_s_style_default', count(*) FROM public.metal_s_style_default
UNION ALL SELECT 'metal_m_feature_rate', count(*) FROM public.metal_m_feature_rate
UNION ALL SELECT 'metal_m_leanto_style_compat', count(*) FROM public.metal_m_leanto_style_compat
UNION ALL SELECT 'metal_m_feature_matrix_price', count(*) FROM public.metal_m_feature_matrix_price
UNION ALL SELECT 'metal_m_leanto_price', count(*) FROM public.metal_m_leanto_price
ORDER BY t;

-- 5.2 FK integrity check (orphaned records)
SELECT 'feature→pricing_type' AS check_name, count(*) AS orphans
FROM public.metal_s_feature f
LEFT JOIN public.metal_s_pricing_type pt ON f.pricing_type_id = pt.pricing_type_id
WHERE f.pricing_type_id IS NOT NULL AND pt.pricing_type_id IS NULL

UNION ALL
SELECT 'feature→category', count(*)
FROM public.metal_s_feature f
LEFT JOIN public.metal_s_category c ON f.category_id = c.category_id
WHERE f.category_id IS NOT NULL AND c.category_id IS NULL

UNION ALL
SELECT 'feature_option→feature', count(*)
FROM public.metal_s_feature_option fo
LEFT JOIN public.metal_s_feature f ON fo.feature_id = f.feature_id
WHERE f.feature_id IS NULL

UNION ALL
SELECT 'style_default→feature', count(*)
FROM public.metal_s_style_default sd
LEFT JOIN public.metal_s_feature f ON sd.feature_id = f.feature_id
WHERE f.feature_id IS NULL

UNION ALL
SELECT 'style_default→style', count(*)
FROM public.metal_s_style_default sd
LEFT JOIN public.metal_s_style s ON sd.style_id = s.style_id
WHERE s.style_id IS NULL

UNION ALL
SELECT 'matrix_price→feature', count(*)
FROM public.metal_m_feature_matrix_price mp
LEFT JOIN public.metal_s_feature f ON mp.feature_id = f.feature_id
WHERE f.feature_id IS NULL

UNION ALL
SELECT 'matrix_price→style', count(*)
FROM public.metal_m_feature_matrix_price mp
LEFT JOIN public.metal_s_style s ON mp.style_id = s.style_id
WHERE s.style_id IS NULL;

-- Expected: ALL orphan counts = 0

-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — RISK ANALYSIS
-- ════════════════════════════════════════════════════════════════════════════════
--
-- ┌──────────────────────────────────────────────────────────────────────────────┐
-- │ Risk                            │ Severity │ Mitigation                      │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ DEV has rows not in QAS         │ LOW      │ UPSERT only updates matching    │
-- │ (dev-only test data)            │          │ PKs; extra rows preserved       │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ Sequence out of sync after      │ MEDIUM   │ setval() calls in §3.17 reset  │
-- │ explicit PK inserts             │          │ all sequences to max(id)+1      │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ Large table (3,600 rows) may    │ LOW      │ Supabase SQL editor handles     │
-- │ timeout in SQL editor           │          │ <10K rows fine. Batch if needed │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ Duplicate leanto_styles in QAS  │ INFO     │ Preserved as-is (IDs 5-13 have │
-- │ (repeated inserts)              │          │ duplicates — QAS is source of   │
-- │                                 │          │ truth for this migration)       │
-- ├─────────────────────────────────┼──────────┼─────────────────────────────────┤
-- │ metal_s_door_window_item uses   │ LOW      │ Unicode preserved in SQL        │
-- │ × (multiplication sign) in names│          │ literal strings                 │
-- └─────────────────────────────────┴──────────┴─────────────────────────────────┘
--
-- ════════════════════════════════════════════════════════════════════════════════
-- SECTION 7 — EXECUTION ORDER
-- ════════════════════════════════════════════════════════════════════════════════
--
-- PHASE 1: Run Section 3 (BEGIN...COMMIT) on DEV
--   → All 16 small tables upserted + sequences reset
--
-- PHASE 2: Run Section 4A query on QAS → paste output into DEV
--   → 1,625 matrix price rows upserted
--
-- PHASE 3: Run Section 4B query on QAS → paste output into DEV
--   → 3,600 leanto price rows upserted
--
-- PHASE 4: Run Section 5 validation on DEV
--   → Confirm row counts match QAS
--   → Confirm zero orphaned FK records
--
-- ════════════════════════════════════════════════════════════════════════════════
-- METADATA SUMMARY
-- ════════════════════════════════════════════════════════════════════════════════
--
-- Total tables migrated:       18
-- Total inline rows:           303
-- Total large-table rows:      5,225 (via generated INSERT method)
-- Total UPSERT operations:     16 (inline) + 2 (generated)
-- Total sequence resets:       16
-- Total validation queries:    2
-- FK dependencies resolved:    18 constraints (ordered correctly)
--
-- ════════════════════════════════════════════════════════════════════════════════
-- DEPLOYMENT CHECKLIST
-- ════════════════════════════════════════════════════════════════════════════════
--
-- [ ] 1. Verify schema migration (migration_QAS_to_DEV.sql) has been run on DEV
-- [ ] 2. Take database backup of Premium-DEV
-- [ ] 3. Run Section 3 (BEGIN...COMMIT) on DEV — small tables
-- [ ] 4. Verify no errors
-- [ ] 5. Run Section 4A export query on QAS
-- [ ] 6. Copy result, wrap in BEGIN;...COMMIT;, paste into DEV, run
-- [ ] 7. Run Section 4B export query on QAS
-- [ ] 8. Copy result, wrap in BEGIN;...COMMIT;, paste into DEV, run
-- [ ] 9. Run Section 5.1 row count validation on DEV
-- [ ] 10. Compare counts: QAS should match DEV for all tables
-- [ ] 11. Run Section 5.2 FK integrity check — all should be 0
-- [ ] 12. Test the app: /metal-buildings/pricing page loads without errors
-- [ ] 13. If issues: restore from backup (step 2)
--
-- ════════════════════════════════════════════════════════════════════════════════
