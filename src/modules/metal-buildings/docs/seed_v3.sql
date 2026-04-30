-- ═══════════════════════════════════════════════════════════
-- METAL BUILDINGS — SEED v3
-- Run AFTER schema_v3.sql
-- ═══════════════════════════════════════════════════════════

-- ─── STYLES ────────────────────────────────────────────────

INSERT INTO metal_s_style (name, description, sort_order) VALUES
('Regular Carport',       'Standard round-roof carport',                   1),
('A-Frame Carport',       'A-frame horizontal roof carport',               2),
('A-Frame Vertical',      'A-frame with vertical roof panels',             3),
('Garage',                'Fully enclosed garage structure',                4),
('Barn',                  'Agricultural barn style building',              5);

-- ─── REGIONS (state pricing multipliers) ───────────────────

INSERT INTO metal_s_region (name, state_code, multiplier) VALUES
('Michigan',      'MI', 1.000),
('Indiana',       'IN', 1.000),
('Ohio',          'OH', 1.050),
('Illinois',      'IL', 1.050),
('Pennsylvania',  'PA', 1.080),
('Texas',         'TX', 0.950),
('Florida',       'FL', 1.030),
('Georgia',       'GA', 0.980),
('Tennessee',     'TN', 0.970),
('North Carolina','NC', 1.020);

-- ─── FEATURES ──────────────────────────────────────────────

INSERT INTO metal_s_feature (name, pricing_type, description, category, is_required, sort_order, is_active) VALUES
('Base Structure',      'MATRIX', 'Base structure pricing by style and size',                   'Size',             true,  1, true),
('Sides & Ends',        'PANEL',  'Wall enclosure options for each side of the structure',      'Sides & Ends',     false, 2, true),
('Concrete Sealant',    'RATE',   'Protective sealant applied to concrete slab',                'Concrete',         false, 3, true),
('Perimeter Footings',  'RATE',   'Perimeter footings per linear foot',                         'Concrete',         false, 4, true),
('Walk-in Door',        'FIXED',  'Pre-hung walk-in door options',                              'Doors & Windows',  false, 5, true),
('Windows',             'FIXED',  'Window options for enclosed walls',                          'Doors & Windows',  false, 6, true),
('Gutter System',       'RATE',   'Seamless aluminum gutters per linear foot',                  'Roofing',          false, 7, true);

-- ─── MATRIX — Base Structure: Regular Carport (style_id=1) ──

INSERT INTO metal_m_feature_matrix_price (feature_id, style_id, width, length, height, price) VALUES
(1, 1, 12, 20, 6, 1295.00),
(1, 1, 12, 20, 7, 1395.00),
(1, 1, 12, 20, 8, 1545.00),
(1, 1, 12, 25, 6, 1545.00),
(1, 1, 12, 25, 7, 1665.00),
(1, 1, 12, 25, 8, 1835.00),
(1, 1, 12, 30, 6, 1795.00),
(1, 1, 12, 30, 7, 1935.00),
(1, 1, 12, 30, 8, 2125.00),
(1, 1, 18, 20, 6, 1795.00),
(1, 1, 18, 20, 7, 1945.00),
(1, 1, 18, 20, 8, 2145.00),
(1, 1, 18, 25, 6, 2145.00),
(1, 1, 18, 25, 7, 2325.00),
(1, 1, 18, 25, 8, 2555.00),
(1, 1, 18, 30, 6, 2495.00),
(1, 1, 18, 30, 7, 2695.00),
(1, 1, 18, 30, 8, 2965.00),
(1, 1, 24, 20, 6, 2295.00),
(1, 1, 24, 20, 7, 2495.00),
(1, 1, 24, 20, 8, 2745.00),
(1, 1, 24, 25, 6, 2745.00),
(1, 1, 24, 25, 7, 2975.00),
(1, 1, 24, 25, 8, 3275.00),
(1, 1, 24, 30, 6, 3195.00),
(1, 1, 24, 30, 7, 3455.00),
(1, 1, 24, 30, 8, 3805.00),
(1, 1, 24, 35, 6, 3645.00),
(1, 1, 24, 35, 7, 3935.00),
(1, 1, 24, 35, 8, 4335.00),
(1, 1, 24, 40, 6, 4095.00),
(1, 1, 24, 40, 7, 4415.00),
(1, 1, 24, 40, 8, 4865.00);

-- ─── MATRIX — Base Structure: A-Frame Carport (style_id=2) ──

INSERT INTO metal_m_feature_matrix_price (feature_id, style_id, width, length, height, price) VALUES
(1, 2, 12, 20, 6, 1495.00),
(1, 2, 12, 20, 7, 1610.00),
(1, 2, 12, 20, 8, 1780.00),
(1, 2, 12, 25, 6, 1780.00),
(1, 2, 12, 25, 7, 1920.00),
(1, 2, 12, 25, 8, 2110.00),
(1, 2, 12, 30, 6, 2065.00),
(1, 2, 12, 30, 7, 2225.00),
(1, 2, 12, 30, 8, 2445.00),
(1, 2, 18, 20, 6, 2065.00),
(1, 2, 18, 20, 7, 2240.00),
(1, 2, 18, 20, 8, 2465.00),
(1, 2, 18, 25, 6, 2465.00),
(1, 2, 18, 25, 7, 2675.00),
(1, 2, 18, 25, 8, 2940.00),
(1, 2, 18, 30, 6, 2870.00),
(1, 2, 18, 30, 7, 3100.00),
(1, 2, 18, 30, 8, 3410.00),
(1, 2, 24, 20, 6, 2640.00),
(1, 2, 24, 20, 7, 2870.00),
(1, 2, 24, 20, 8, 3155.00),
(1, 2, 24, 25, 6, 3155.00),
(1, 2, 24, 25, 7, 3420.00),
(1, 2, 24, 25, 8, 3765.00),
(1, 2, 24, 30, 6, 3675.00),
(1, 2, 24, 30, 7, 3975.00),
(1, 2, 24, 30, 8, 4375.00),
(1, 2, 24, 35, 6, 4190.00),
(1, 2, 24, 35, 7, 4525.00),
(1, 2, 24, 35, 8, 4985.00),
(1, 2, 24, 40, 6, 4710.00),
(1, 2, 24, 40, 7, 5080.00),
(1, 2, 24, 40, 8, 5595.00);

-- ─── MATRIX — Base Structure: A-Frame Vertical (style_id=3) ──

INSERT INTO metal_m_feature_matrix_price (feature_id, style_id, width, length, height, price) VALUES
(1, 3, 12, 20, 6, 1645.00),
(1, 3, 12, 20, 7, 1775.00),
(1, 3, 12, 20, 8, 1960.00),
(1, 3, 12, 25, 6, 1960.00),
(1, 3, 12, 25, 7, 2115.00),
(1, 3, 12, 25, 8, 2325.00),
(1, 3, 12, 30, 6, 2275.00),
(1, 3, 12, 30, 7, 2450.00),
(1, 3, 12, 30, 8, 2695.00),
(1, 3, 18, 20, 6, 2275.00),
(1, 3, 18, 20, 7, 2465.00),
(1, 3, 18, 20, 8, 2715.00),
(1, 3, 18, 25, 6, 2715.00),
(1, 3, 18, 25, 7, 2945.00),
(1, 3, 18, 25, 8, 3240.00),
(1, 3, 18, 30, 6, 3160.00),
(1, 3, 18, 30, 7, 3415.00),
(1, 3, 18, 30, 8, 3755.00),
(1, 3, 24, 20, 6, 2905.00),
(1, 3, 24, 20, 7, 3160.00),
(1, 3, 24, 20, 8, 3475.00),
(1, 3, 24, 25, 6, 3475.00),
(1, 3, 24, 25, 7, 3765.00),
(1, 3, 24, 25, 8, 4145.00),
(1, 3, 24, 30, 6, 4045.00),
(1, 3, 24, 30, 7, 4375.00),
(1, 3, 24, 30, 8, 4815.00),
(1, 3, 24, 35, 6, 4615.00),
(1, 3, 24, 35, 7, 4980.00),
(1, 3, 24, 35, 8, 5485.00),
(1, 3, 24, 40, 6, 5185.00),
(1, 3, 24, 40, 7, 5590.00),
(1, 3, 24, 40, 8, 6155.00);

-- ─── MATRIX — Base Structure: Garage (style_id=4) ──────────

INSERT INTO metal_m_feature_matrix_price (feature_id, style_id, width, length, height, price) VALUES
(1, 4, 12, 20, 8, 2995.00),
(1, 4, 12, 25, 8, 3475.00),
(1, 4, 12, 30, 8, 3955.00),
(1, 4, 18, 20, 8, 3955.00),
(1, 4, 18, 25, 8, 4595.00),
(1, 4, 18, 30, 8, 5235.00),
(1, 4, 24, 20, 8, 4995.00),
(1, 4, 24, 25, 8, 5795.00),
(1, 4, 24, 30, 8, 6595.00),
(1, 4, 24, 35, 8, 7395.00),
(1, 4, 24, 40, 8, 8195.00),
(1, 4, 30, 30, 9, 8495.00),
(1, 4, 30, 35, 9, 9495.00),
(1, 4, 30, 40, 9, 10495.00),
(1, 4, 30, 50, 9, 12495.00);

-- ─── MATRIX — Base Structure: Barn (style_id=5) ────────────

INSERT INTO metal_m_feature_matrix_price (feature_id, style_id, width, length, height, price) VALUES
(1, 5, 24, 30, 9, 7295.00),
(1, 5, 24, 35, 9, 8295.00),
(1, 5, 24, 40, 9, 9295.00),
(1, 5, 30, 30, 9, 9295.00),
(1, 5, 30, 35, 9, 10495.00),
(1, 5, 30, 40, 9, 11695.00),
(1, 5, 30, 50, 9, 14095.00),
(1, 5, 36, 40, 10, 14495.00),
(1, 5, 36, 50, 10, 17495.00),
(1, 5, 40, 40, 10, 16495.00),
(1, 5, 40, 50, 10, 19995.00),
(1, 5, 40, 60, 10, 23495.00);

-- ─── PANEL LOCATIONS — Sides & Ends (feature_id = 2) ───────

INSERT INTO metal_s_panel_location (feature_id, name, location_type, sort_order) VALUES
(2, 'Front Gable End',  'end',  1),
(2, 'Back Gable End',   'end',  2),
(2, 'Left Sidewall',    'side', 3),
(2, 'Right Sidewall',   'side', 4);

-- ─── PANEL OPTIONS — End walls ─────────────────────────────

INSERT INTO metal_s_panel_option (feature_id, location_type, name, price_per_foot, sort_order) VALUES
(2, 'end', 'Open',                            0.00,  1),
(2, 'end', 'Fully Enclosed',                 18.00,  2),
(2, 'end', 'Gable End',                      12.00,  3),
(2, 'end', 'Extended Gable End - 3'' Panel', 14.50,  4);

-- ─── PANEL OPTIONS — Sidewalls ─────────────────────────────

INSERT INTO metal_s_panel_option (feature_id, location_type, name, price_per_foot, sort_order) VALUES
(2, 'side', 'Open',                  0.00,  1),
(2, 'side', 'Fully Enclosed',       15.00,  2),
(2, 'side', 'Top - 1 1/2'' Panel',   8.00,  3),
(2, 'side', 'Top - 3'' Panel',      10.00,  4);

-- ─── RATES ─────────────────────────────────────────────────

INSERT INTO metal_m_feature_rate (feature_id, rate, unit) VALUES
(3, 6.50, 'sqft'),
(4, 12.75, 'linear_ft'),
(7, 8.25, 'linear_ft');

-- ─── FIXED OPTIONS — Walk-in Door (feature_id = 5) ─────────

INSERT INTO metal_s_feature_option (feature_id, name, price, sort_order) VALUES
(5, '36x80 Walk-in Door (Standard)',      430.00, 1),
(5, '36x80 Walk-in Door (9-Lite Glass)',  545.00, 2),
(5, '36x80 Walk-in Door (Half Glass)',    595.00, 3),
(5, '36x80 Steel Security Door',         680.00, 4);

-- ─── FIXED OPTIONS — Windows (feature_id = 6) ──────────────

INSERT INTO metal_s_feature_option (feature_id, name, price, sort_order) VALUES
(6, '24x36 Single Window',        185.00, 1),
(6, '30x36 Single Window',        215.00, 2),
(6, '36x36 Insulated Window',     425.00, 3),
(6, '48x36 Double Window',        510.00, 4);
