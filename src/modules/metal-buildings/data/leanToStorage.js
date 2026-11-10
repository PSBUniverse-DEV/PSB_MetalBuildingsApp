// Shared "Enclosed Lean with Storage" rules used by the 3D preview and the
// SVG floor plan (Top View and printed Order Form).

const MIN_OPEN_AREA_FT = 2;
// Matches LeanToSystem's previous 0.2 scene-unit minimum at SCALE = 0.5.
const MIN_PARTITION_DEPTH_FT = 0.4;

export function isLeanToWithStorage(leanto = {}) {
  return String(leanto?.render_key ?? "").toLowerCase().includes("storage")
    || Number(leanto?.storage?.depthFt) > 0;
}

/**
 * Return the partition distance from the lean-to's front/left end, in feet.
 * Supports both the configurator/order-form shape (`storageDepth`) and the
 * preview shape (`storage.depthFt`). A two-foot open area is retained after
 * the partition, matching the existing 3D behavior.
 */
export function getLeanToStorageDepthFt(leanto = {}, lengthFt = 0) {
  const span = Number(lengthFt);
  if (!isLeanToWithStorage(leanto) || !(span > 0)) return 0;
  const requested = Number(leanto?.storage?.depthFt ?? leanto?.storageDepth ?? 5);
  if (!(requested > 0)) return 0;
  return Math.min(requested, Math.max(span - MIN_OPEN_AREA_FT, MIN_PARTITION_DEPTH_FT));
}
