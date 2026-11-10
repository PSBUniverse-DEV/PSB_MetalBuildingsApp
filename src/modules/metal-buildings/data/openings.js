/**
 * openings.js
 *
 * Shared wall-opening parsing used by the 3D preview (BuildingPreviewV2) and
 * the 2D floor-plan drawing (FloorPlanSvg — Top View overlay and the printed
 * Order Form). Kept dependency-light: only the unit-aware dimension parser
 * from metalBuildings.data.
 */

import { parseOpeningDimensions } from "./metalBuildings.data";

// Fallback sizes (ft) so wall openings always render even when the item name
// carries no parseable dimensions (e.g. "Gable Vent"). Dimensionless
// non-openings priced per foot (e.g. "Ridge Vent (per ft)") are explicitly
// skipped in parseOpening.
export const OPENING_DEFAULT_FT = {
  door: { wFt: 3, hFt: 20 / 3 },
  rollup_door: { wFt: 10, hFt: 10 },
  window: { wFt: 3, hFt: 3 },
  frameout: { wFt: 3, hFt: 20 / 3 },
  vent: { wFt: 2, hFt: 2 }, // typical gable vent (24"×24")
};

// Item type: prefer the stored metal_s_door_window_item.item_type; fall back
// to name keywords ("Roll-Up" hyphenated names don't match "rollup").
export function resolveOpeningType(item) {
  const declared = String(item?.item_type ?? "").trim().toLowerCase();
  if (declared) return declared;
  const name = String(item?.name ?? "").toLowerCase();
  if (name.includes("window")) return "window";
  if (name.includes("roll")) return "rollup_door"; // "Roll-Up", "Rollup", "Roll Up"
  if (name.includes("frameout")) return "frameout";
  if (name.includes("vent")) return "vent";
  return "door";
}

export function parseOpening(item) {
  const type = resolveOpeningType(item);
  // Unit-aware shared parser: `36" x 80"` → inches, `10' x 11'` → feet,
  // bare `36×80` / `24×36` → inches (see parseOpeningDimensions).
  const dims = parseOpeningDimensions(item?.name);
  if (dims) return { wFt: dims.widthFt, hFt: dims.heightFt, type };
  // Per-foot priced items ("Ridge Vent (per ft)") are not wall openings.
  if (/per\s*(ft|foot|linear)/i.test(String(item?.name ?? ""))) return null;
  const d = OPENING_DEFAULT_FT[type];
  return d ? { wFt: d.wFt, hFt: d.hFt, type } : null;
}