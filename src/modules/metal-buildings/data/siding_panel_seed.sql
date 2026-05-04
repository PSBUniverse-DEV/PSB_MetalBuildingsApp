-- ═══════════════════════════════════════════════════════════
-- SIDING PANEL FEATURE — Horizontal / Vertical panel direction
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Insert the Siding Panel feature (FIXED pricing type)
--    Uses render_key = 'siding_panel' so the configurator UI can detect it.
--    Adjust category_id if your Materials category has a different id.
INSERT INTO metal_s_feature (name, pricing_type_id, category_id, is_required, sort_order, is_active, render_key, description)
VALUES (
  'Siding Panel',
  (SELECT pricing_type_id FROM metal_s_pricing_type WHERE code = 'FIXED' LIMIT 1),
  (SELECT category_id FROM metal_s_category WHERE name ILIKE '%material%' LIMIT 1),
  false,
  10,
  true,
  'siding_panel',
  'Choose horizontal or vertical panel orientation for wall siding.'
);

-- 2. Insert the two options
INSERT INTO metal_s_feature_option (feature_id, name, price, sort_order, is_active)
VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE render_key = 'siding_panel' LIMIT 1), 'Horizontal', 0, 1, true),
  ((SELECT feature_id FROM metal_s_feature WHERE render_key = 'siding_panel' LIMIT 1), 'Vertical', 0, 2, true);
