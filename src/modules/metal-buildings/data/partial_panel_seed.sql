-- ═══════════════════════════════════════════════════════════
-- PARTIAL TOP PANEL OPTIONS — "Top - 1 1/2' Panel" & "Top - 3' Panel"
-- Adds partial wall panel options for sidewalls and end walls.
-- Run this in Supabase SQL Editor AFTER the base panel feature exists.
-- ═══════════════════════════════════════════════════════════

-- These use render_type values "top_1.5" and "top_3" which the 3D preview
-- interprets as partial panels covering only the top X feet of the wall.

-- Add to SIDE wall options
INSERT INTO metal_s_panel_option (feature_id, location_type, name, render_type, price_per_foot, sort_order, is_active)
VALUES
  (
    (SELECT feature_id FROM metal_s_feature WHERE pricing_type_id = (SELECT pricing_type_id FROM metal_s_pricing_type WHERE code = 'PANEL' LIMIT 1) LIMIT 1),
    'side',
    'Top - 1 1/2'' Panel',
    'top_1.5',
    0,
    3,
    true
  ),
  (
    (SELECT feature_id FROM metal_s_feature WHERE pricing_type_id = (SELECT pricing_type_id FROM metal_s_pricing_type WHERE code = 'PANEL' LIMIT 1) LIMIT 1),
    'side',
    'Top - 3'' Panel',
    'top_3',
    0,
    4,
    true
  );

-- Add to END wall options
INSERT INTO metal_s_panel_option (feature_id, location_type, name, render_type, price_per_foot, sort_order, is_active)
VALUES
  (
    (SELECT feature_id FROM metal_s_feature WHERE pricing_type_id = (SELECT pricing_type_id FROM metal_s_pricing_type WHERE code = 'PANEL' LIMIT 1) LIMIT 1),
    'end',
    'Top - 1 1/2'' Panel',
    'top_1.5',
    0,
    3,
    true
  ),
  (
    (SELECT feature_id FROM metal_s_feature WHERE pricing_type_id = (SELECT pricing_type_id FROM metal_s_pricing_type WHERE code = 'PANEL' LIMIT 1) LIMIT 1),
    'end',
    'Top - 3'' Panel',
    'top_3',
    0,
    4,
    true
  ),
  (
    (SELECT feature_id FROM metal_s_feature WHERE pricing_type_id = (SELECT pricing_type_id FROM metal_s_pricing_type WHERE code = 'PANEL' LIMIT 1) LIMIT 1),
    'end',
    'Extended Gable End - 3'' Panel',
    'ext_gable_3',
    0,
    5,
    true
  );
