// ═══════════════════════════════════════════════════════════
// wallRibProfile — wall siding rib profile (WALL ONLY).
//
// Same R-panel idea as the roof (trapezoid major rib + 2 pairs of small
// stiffeners per module) but smaller and tighter, and kept separate on
// purpose: edit these values to restyle the walls without touching the roof
// (3d/roof/ribPanelGeometry.js). Used by wallRibTexture.js (normal map).
// ═══════════════════════════════════════════════════════════

// ─── RIB PROFILE (inches) ─────────────────────────────────
export const WALL_RIB_MAJOR_SPACING_IN = 5;      // major rib pitch (roof: 12)
export const WALL_RIB_MAJOR_BASE_IN = 2;         // major rib trapezoid base (roof: 3)
export const WALL_RIB_MAJOR_TOP_IN = 0.5;        // major rib trapezoid top (roof: 1)
export const WALL_RIB_MAJOR_HEIGHT_IN = 0.85;    // major rib height (roof: 1.25)
export const WALL_RIB_MINOR_BASE_IN = 0.4;       // stiffener base (roof: 0.6)
export const WALL_RIB_MINOR_TOP_IN = 0.14;       // stiffener top (roof: 0.2)
export const WALL_RIB_MINOR_HEIGHT_IN = 0.12;    // stiffener height (roof: 0.2)
// Stiffener pairs as fractions of the module (roof: 3.8/4.6/7.4/8.2 of 12").
export const WALL_RIB_MINOR_FRACTIONS = [0.317, 0.383, 0.617, 0.683];
// Groove depth multiplier for the wall shading (1 = true scale).
export const WALL_RIB_VISUAL_SCALE = 0.5;

// One module of the cross-section profile: [xInches, heightInches].
function moduleProfile() {
  const S = WALL_RIB_MAJOR_SPACING_IN;
  const pts = [];
  const mb = WALL_RIB_MAJOR_BASE_IN / 2;
  const mt = WALL_RIB_MAJOR_TOP_IN / 2;
  pts.push([-mb, 0], [-mt, WALL_RIB_MAJOR_HEIGHT_IN], [mt, WALL_RIB_MAJOR_HEIGHT_IN], [mb, 0]);
  for (const f of WALL_RIB_MINOR_FRACTIONS) {
    const off = f * S;
    const nb = WALL_RIB_MINOR_BASE_IN / 2;
    const nt = WALL_RIB_MINOR_TOP_IN / 2;
    pts.push([off - nb, 0], [off - nt, WALL_RIB_MINOR_HEIGHT_IN], [off + nt, WALL_RIB_MINOR_HEIGHT_IN], [off + nb, 0]);
  }
  return pts;
}

// Profile folded onto the distance from the nearest major rib center.
const FOLDED = (() => {
  const S = WALL_RIB_MAJOR_SPACING_IN;
  const map = new Map();
  for (const [px, ph] of moduleProfile()) {
    const r = ((px + S / 2) % S + S) % S - S / 2;
    const ar = Math.abs(r);
    map.set(ar, Math.max(map.get(ar) ?? 0, ph));
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
})();

/** Wall rib height (inches, before WALL_RIB_VISUAL_SCALE) at profile x (inches). */
export function wallRibHeightAtInches(xIn) {
  const S = WALL_RIB_MAJOR_SPACING_IN;
  const r = ((xIn + S / 2) % S + S) % S - S / 2;
  const ar = Math.abs(r);
  const pts = FOLDED;
  if (ar <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, h0] = pts[i - 1];
    const [x1, h1] = pts[i];
    if (ar <= x1) return h0 + ((h1 - h0) * (ar - x0)) / (x1 - x0 || 1);
  }
  return 0;
}
