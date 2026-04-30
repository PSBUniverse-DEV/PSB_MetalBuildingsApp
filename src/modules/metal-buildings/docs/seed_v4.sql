-- ═══════════════════════════════════════════════════════════
-- METAL BUILDINGS — SEED v4 (Materials, Doors/Windows, Colors)
-- Run AFTER schema_v4.sql
-- Safe to re-run: cleans up v4 data before inserting.
-- ═══════════════════════════════════════════════════════════

-- ─── CLEANUP (remove v4-specific data) ─────────────────────

-- Colors first (deepest FK chain)
DELETE FROM metal_s_color_option;
DELETE FROM metal_s_color_group;

-- Door/window items
DELETE FROM metal_s_door_window_item;

-- Feature options & rates for v4 features (by name)
DELETE FROM metal_s_feature_option WHERE feature_id IN (
  SELECT feature_id FROM metal_s_feature WHERE name IN (
    'Frame Gauge', 'Colored Screws', 'Extra Bows', 'Concrete Sealant',
    'Drip Stop', 'Clear Panels', 'Insulation Material', 'Doors & Windows', 'Colors'
  )
);
DELETE FROM metal_m_feature_rate WHERE feature_id IN (
  SELECT feature_id FROM metal_s_feature WHERE name IN (
    'Frame Gauge', 'Colored Screws', 'Extra Bows', 'Concrete Sealant',
    'Drip Stop', 'Clear Panels', 'Insulation Material', 'Doors & Windows', 'Colors'
  )
);

-- Now safe to delete the features themselves
DELETE FROM metal_s_feature WHERE name IN (
  'Frame Gauge', 'Colored Screws', 'Extra Bows', 'Concrete Sealant',
  'Drip Stop', 'Clear Panels', 'Insulation Material', 'Doors & Windows', 'Colors'
);

-- ─── MATERIALS FEATURES ────────────────────────────────────

-- Frame Gauge (FIXED — radio)
INSERT INTO metal_s_feature (name, pricing_type, description, category, is_required, sort_order)
VALUES ('Frame Gauge', 'FIXED', 'Choose your frame gauge', 'Materials', false, 10);

-- Colored Screws (FIXED — checkbox-style, one option)
INSERT INTO metal_s_feature (name, pricing_type, description, category, is_required, sort_order)
VALUES ('Colored Screws', 'FIXED', 'Match screw color to your building', 'Materials', false, 11);

-- Extra Bows (RATE — count × rate)
INSERT INTO metal_s_feature (name, pricing_type, description, category, is_required, sort_order)
VALUES ('Extra Bows', 'RATE', 'Additional bracing bows for extra strength', 'Materials', false, 12);

-- Concrete Sealant (FIXED — checkbox)
INSERT INTO metal_s_feature (name, pricing_type, description, category, is_required, sort_order)
VALUES ('Concrete Sealant', 'FIXED', 'Seal the base of your building to the concrete pad', 'Materials', false, 13);

-- Drip Stop (PER_WALL — per-wall checkboxes × rate per foot)
INSERT INTO metal_s_feature (name, pricing_type, description, category, is_required, sort_order)
VALUES ('Drip Stop', 'PER_WALL', 'Condensation control applied to selected surfaces', 'Materials', false, 14);

-- Clear Panels (RATE — count of 3ft sections × rate)
INSERT INTO metal_s_feature (name, pricing_type, description, category, is_required, sort_order)
VALUES ('Clear Panels', 'RATE', 'Add clear panels to sides - 3'' sections', 'Materials', false, 15);

-- Insulation Material (FIXED — radio)
INSERT INTO metal_s_feature (name, pricing_type, description, category, is_required, sort_order)
VALUES ('Insulation Material', 'FIXED', 'Choose insulation type for your building', 'Materials', false, 16);

-- ─── MATERIALS: FIXED OPTIONS ──────────────────────────────

-- Frame Gauge options (feature_id determined by insert order — use subquery)
INSERT INTO metal_s_feature_option (feature_id, name, price, sort_order) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Frame Gauge'), 'Standard Framing', 0, 1),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Frame Gauge'), '12-Gauge Framing', 350.00, 2);

-- Colored Screws
INSERT INTO metal_s_feature_option (feature_id, name, price, sort_order) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Colored Screws'), 'Colored Screws', 95.00, 1);

-- Concrete Sealant
INSERT INTO metal_s_feature_option (feature_id, name, price, sort_order) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Concrete Sealant'), 'Add Concrete Sealant', 150.00, 1);

-- Insulation Material
INSERT INTO metal_s_feature_option (feature_id, name, price, sort_order) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Insulation Material'), 'No Insulation', 0, 1),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Insulation Material'), '2" Fiberglass', 1.25, 2),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Insulation Material'), 'Reflective Barrier', 0.85, 3);

-- ─── MATERIALS: RATE VALUES ────────────────────────────────

-- Extra Bows: $65 per bow
INSERT INTO metal_m_feature_rate (feature_id, rate, unit) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Extra Bows'), 65.00, 'linear_ft');

-- Clear Panels: $45 per 3ft section
INSERT INTO metal_m_feature_rate (feature_id, rate, unit) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Clear Panels'), 45.00, 'linear_ft');

-- Drip Stop: $1.75 per linear foot
INSERT INTO metal_m_feature_rate (feature_id, rate, unit) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Drip Stop'), 1.75, 'linear_ft');

-- ═══════════════════════════════════════════════════════════
-- DOORS & WINDOWS
-- ═══════════════════════════════════════════════════════════

INSERT INTO metal_s_feature (name, pricing_type, description, category, is_required, sort_order)
VALUES ('Doors & Windows', 'PER_ITEM', 'Add doors, windows, and other openings to your walls', 'Doors & Windows', false, 20);

-- Walk-in Doors
INSERT INTO metal_s_door_window_item (feature_id, name, item_type, price, sort_order) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '36×80 Walk-in Door (Standard)', 'door', 430.00, 1),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '36×80 Walk-in Door (9-Lite Glass)', 'door', 545.00, 2),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '36×80 Walk-in Door (Half Glass)', 'door', 595.00, 3),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '36×80 Steel Security Door', 'door', 680.00, 4);

-- Windows
INSERT INTO metal_s_door_window_item (feature_id, name, item_type, price, sort_order) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '24×36 Single Window', 'window', 185.00, 10),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '30×36 Single Window', 'window', 215.00, 11),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '36×36 Insulated Window', 'window', 425.00, 12),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '48×36 Double Window', 'window', 510.00, 13);

-- Frameouts
INSERT INTO metal_s_door_window_item (feature_id, name, item_type, price, sort_order) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '36×80 Frameout', 'frameout', 125.00, 20),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '48×80 Frameout', 'frameout', 145.00, 21);

-- Rollup Doors
INSERT INTO metal_s_door_window_item (feature_id, name, item_type, price, sort_order) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '8×8 Rollup Door', 'rollup_door', 650.00, 30),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '10×10 Rollup Door', 'rollup_door', 850.00, 31),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), '12×12 Rollup Door', 'rollup_door', 1100.00, 32);

-- Vents
INSERT INTO metal_s_door_window_item (feature_id, name, item_type, price, sort_order) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), 'Gable Vent', 'vent', 75.00, 40),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Doors & Windows'), 'Ridge Vent (per ft)', 'vent', 12.00, 41);

-- ═══════════════════════════════════════════════════════════
-- COLORS
-- ═══════════════════════════════════════════════════════════

INSERT INTO metal_s_feature (name, pricing_type, description, category, is_required, sort_order)
VALUES ('Colors', 'COLOR', 'Choose colors for your roof, trim, and siding', 'Colors', false, 30);

-- Color Groups
INSERT INTO metal_s_color_group (feature_id, name, sort_order) VALUES
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Colors'), 'Roof', 1),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Colors'), 'Trim', 2),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Colors'), 'Siding', 3),
  ((SELECT feature_id FROM metal_s_feature WHERE name = 'Colors'), 'Two Tone Siding', 4);

-- Color Options (shared palette — inserted per group)
-- Standard colors (no upcharge)
INSERT INTO metal_s_color_option (color_group_id, name, hex_code, upcharge, sort_order) VALUES
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Barn Red', '#6B1C23', 0, 1),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Evergreen', '#2D5A27', 0, 2),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Ocean Blue', '#5F8CA3', 0, 3),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Pewter Grey', '#8E9196', 0, 4),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Black', '#1C1C1C', 0, 5),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Bright White', '#F5F5F5', 0, 6),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Burgundy', '#800020', 0, 7),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Tan', '#D2B48C', 0, 8),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Clay', '#B8860B', 0, 9),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Brown', '#5C4033', 0, 10),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Sandstone', '#C2B280', 0, 11),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Quaker Grey', '#A9A9A9', 0, 12),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Red', '#CC0000', 0, 13),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Gallery Blue', '#1B3F8B', 0, 14),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Burnished Slate', '#4A4A4A', 0, 15),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Roof'), 'Copper Metallic', '#B87333', 50.00, 16);

-- Trim colors (same palette)
INSERT INTO metal_s_color_option (color_group_id, name, hex_code, upcharge, sort_order) VALUES
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Barn Red', '#6B1C23', 0, 1),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Evergreen', '#2D5A27', 0, 2),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Ocean Blue', '#5F8CA3', 0, 3),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Pewter Grey', '#8E9196', 0, 4),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Black', '#1C1C1C', 0, 5),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Bright White', '#F5F5F5', 0, 6),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Burgundy', '#800020', 0, 7),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Tan', '#D2B48C', 0, 8),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Clay', '#B8860B', 0, 9),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Brown', '#5C4033', 0, 10),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Sandstone', '#C2B280', 0, 11),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Quaker Grey', '#A9A9A9', 0, 12),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Red', '#CC0000', 0, 13),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Gallery Blue', '#1B3F8B', 0, 14),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Burnished Slate', '#4A4A4A', 0, 15),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Trim'), 'Copper Metallic', '#B87333', 50.00, 16);

-- Siding colors
INSERT INTO metal_s_color_option (color_group_id, name, hex_code, upcharge, sort_order) VALUES
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Barn Red', '#6B1C23', 0, 1),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Evergreen', '#2D5A27', 0, 2),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Ocean Blue', '#5F8CA3', 0, 3),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Pewter Grey', '#8E9196', 0, 4),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Black', '#1C1C1C', 0, 5),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Bright White', '#F5F5F5', 0, 6),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Burgundy', '#800020', 0, 7),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Tan', '#D2B48C', 0, 8),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Clay', '#B8860B', 0, 9),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Brown', '#5C4033', 0, 10),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Sandstone', '#C2B280', 0, 11),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Quaker Grey', '#A9A9A9', 0, 12),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Red', '#CC0000', 0, 13),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Gallery Blue', '#1B3F8B', 0, 14),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Burnished Slate', '#4A4A4A', 0, 15),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Siding'), 'Copper Metallic', '#B87333', 50.00, 16);

-- Two Tone Siding (same palette, None option first)
INSERT INTO metal_s_color_option (color_group_id, name, hex_code, upcharge, sort_order) VALUES
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Two Tone Siding'), 'None', '#FFFFFF', 0, 0),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Two Tone Siding'), 'Barn Red', '#6B1C23', 75.00, 1),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Two Tone Siding'), 'Evergreen', '#2D5A27', 75.00, 2),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Two Tone Siding'), 'Ocean Blue', '#5F8CA3', 75.00, 3),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Two Tone Siding'), 'Pewter Grey', '#8E9196', 75.00, 4),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Two Tone Siding'), 'Black', '#1C1C1C', 75.00, 5),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Two Tone Siding'), 'Bright White', '#F5F5F5', 75.00, 6),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Two Tone Siding'), 'Burgundy', '#800020', 75.00, 7),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Two Tone Siding'), 'Tan', '#D2B48C', 75.00, 8),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Two Tone Siding'), 'Brown', '#5C4033', 75.00, 9),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Two Tone Siding'), 'Gallery Blue', '#1B3F8B', 75.00, 10),
  ((SELECT color_group_id FROM metal_s_color_group WHERE name = 'Two Tone Siding'), 'Burnished Slate', '#4A4A4A', 75.00, 11);
