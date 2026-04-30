-- ═══════════════════════════════════════════════════════════
-- METAL BUILDINGS — SEED v2
-- Run AFTER schema_v2.sql
-- ═══════════════════════════════════════════════════════════

-- ─── FEATURES ──────────────────────────────────────────────
-- Feature #1 is the base structure (is_required = true).
-- Its matrix defines valid Width × Length × Leg Height combos.

INSERT INTO metal_s_feature (name, pricing_type, description, category, label, input_type, is_required, sort_order, is_active) VALUES
('Base Structure', 'MATRIX', 'Base carport/building structure pricing by size', 'Structure', 'Select Size', 'dropdown', true, 1, true),
('Enclose Both Sides', 'MATRIX', 'Full enclosure on both long sides', 'Enclosure', 'Select Dimensions', 'dropdown', false, 2, true),
('Concrete Sealant', 'RATE', 'Protective sealant applied to concrete slab', 'Concrete', 'Enter Area (sq ft)', 'input', false, 3, true),
('Perimeter Footings', 'RATE', 'Perimeter footings per linear foot', 'Concrete', 'Enter Perimeter (linear ft)', 'input', false, 4, true),
('Walk-in Door', 'FIXED', 'Pre-hung walk-in door options', 'Doors & Windows', 'Choose Door Type', 'radio', false, 5, true),
('Windows', 'FIXED', 'Window options for enclosed walls', 'Doors & Windows', 'Choose Window Type', 'radio', false, 6, true),
('Gutter System', 'RATE', 'Seamless aluminum gutters per linear foot', 'Roofing', 'Enter Length (linear ft)', 'input', false, 7, true);

-- ─── MATRIX — Base Structure (feature_id = 1) ──────────────
-- Width × Length × Leg Height → base price

INSERT INTO metal_m_feature_matrix_price (feature_id, width, length, height, price) VALUES
(1, 12, 20, 6, 1295.00),
(1, 12, 20, 7, 1395.00),
(1, 12, 20, 8, 1545.00),
(1, 12, 25, 6, 1545.00),
(1, 12, 25, 7, 1665.00),
(1, 12, 25, 8, 1835.00),
(1, 12, 30, 6, 1795.00),
(1, 12, 30, 7, 1935.00),
(1, 12, 30, 8, 2125.00),
(1, 18, 20, 6, 1795.00),
(1, 18, 20, 7, 1945.00),
(1, 18, 20, 8, 2145.00),
(1, 18, 25, 6, 2145.00),
(1, 18, 25, 7, 2325.00),
(1, 18, 25, 8, 2555.00),
(1, 18, 30, 6, 2495.00),
(1, 18, 30, 7, 2695.00),
(1, 18, 30, 8, 2965.00),
(1, 24, 20, 6, 2295.00),
(1, 24, 20, 7, 2495.00),
(1, 24, 20, 8, 2745.00),
(1, 24, 25, 6, 2745.00),
(1, 24, 25, 7, 2975.00),
(1, 24, 25, 8, 3275.00),
(1, 24, 30, 6, 3195.00),
(1, 24, 30, 7, 3455.00),
(1, 24, 30, 8, 3805.00),
(1, 24, 35, 6, 3645.00),
(1, 24, 35, 7, 3935.00),
(1, 24, 35, 8, 4335.00),
(1, 24, 40, 6, 4095.00),
(1, 24, 40, 7, 4415.00),
(1, 24, 40, 8, 4865.00);

-- ─── MATRIX — Enclose Both Sides (feature_id = 2) ──────────
-- Uses structure width × length (height not applicable)

INSERT INTO metal_m_feature_matrix_price (feature_id, width, length, height, price) VALUES
(2, 12, 20, NULL, 480.00),
(2, 12, 25, NULL, 590.00),
(2, 12, 30, NULL, 700.00),
(2, 18, 20, NULL, 620.00),
(2, 18, 25, NULL, 760.00),
(2, 18, 30, NULL, 905.00),
(2, 24, 20, NULL, 780.00),
(2, 24, 25, NULL, 960.00),
(2, 24, 30, NULL, 1140.00),
(2, 24, 35, NULL, 1320.00),
(2, 24, 40, NULL, 1500.00);

-- ─── RATES ─────────────────────────────────────────────────

INSERT INTO metal_m_feature_rate (feature_id, rate, unit) VALUES
(3, 6.50, 'sqft'),
(4, 12.75, 'linear_ft'),
(7, 8.25, 'linear_ft');

-- ─── FIXED OPTIONS — Walk-in Door (feature_id = 5) ─────────

INSERT INTO metal_s_feature_option (feature_id, name, price, sort_order) VALUES
(5, '36x80 Walk-in Door (Standard)', 430.00, 1),
(5, '36x80 Walk-in Door (9-Lite Glass)', 545.00, 2),
(5, '36x80 Walk-in Door (Half Glass)', 595.00, 3),
(5, '36x80 Steel Security Door', 680.00, 4);

-- ─── FIXED OPTIONS — Windows (feature_id = 6) ──────────────

INSERT INTO metal_s_feature_option (feature_id, name, price, sort_order) VALUES
(6, '24x36 Single Window', 185.00, 1),
(6, '30x36 Single Window', 215.00, 2),
(6, '36x36 Insulated Window', 425.00, 3),
(6, '48x36 Double Window', 510.00, 4);
