"use client";
// ═══════════════════════════════════════════════════════════
// wallRibTexture — Enclosed-wall siding texture (horizontal corrugation).
// Shared by the wall meshes and the wall-matched door slabs so openings and
// walls always show the same rib pitch.
// ═══════════════════════════════════════════════════════════

import * as THREE from "three";
// Wall-only rib profile (independent of the roof's ribPanelGeometry).
import {
  wallRibHeightAtInches,
  WALL_RIB_MAJOR_SPACING_IN,
  WALL_RIB_MAJOR_BASE_IN,
  WALL_RIB_VISUAL_SCALE,
} from "./wallRibProfile";

// Enclosed-wall siding: horizontal R-panel / PBR groove look (reference
// swatch). One major rib every 12 real inches; one 256px texture tile holds
// WALL_RIBS_PER_TILE ribs, and WALL_RIB_TILE is that tile's world-space
// height so callers (repeat.v = wallHeight / WALL_RIB_TILE) keep the same
// real rib pitch on every wall, lean-to, storage wall and door slab.
// Same module as the roof skin (ribPanelGeometry): one 12" module per tile —
// trapezoid major rib + 4 stiffeners. 1 world unit = 24 in → tile = 0.5.
export const WALL_RIB_PITCH_IN = WALL_RIB_MAJOR_SPACING_IN;                 // wall major rib pitch (8")
export const WALL_RIBS_PER_TILE = 1;                                        // one module per tile
export const WALL_RIB_TILE = (WALL_RIBS_PER_TILE * WALL_RIB_PITCH_IN) / 24; // world units → 0.5

// R-panel groove profile per 12" cell (top → bottom), drawn over the flat
// pan in the selected wall color (color itself is never changed):
//   - major rib (~1"): bright lit crown edge, faint lit rib face, then a
//     sharp dark shadow line directly under the rib and a soft falloff onto
//     the pan — the strong highlight/shadow pair in the reference;
//   - two minor stiffener ribs at 1/3 and 2/3 of the pan: faint 1px
//     highlight with a 1px shadow under it.
// Ribs run horizontally across the surface.
// Normal map of ONE 12" roof module (same profile as the roof skin:
// ribHeightAtInches × RIB_VISUAL_SCALE). Ribs run across u; the profile
// varies along v. Tangent-space normal = normalize(0, -dh/dv, 1).
// If the ribs ever look sunken instead of raised, flip NORMAL_SIGN.
const NORMAL_SIGN = 1;
export function createWallRibNormalMap() {
  const W = 4, H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(W, H);
  const x0 = -WALL_RIB_MAJOR_BASE_IN / 2;       // module starts at the major rib base edge
  const step = WALL_RIB_MAJOR_SPACING_IN / H;   // inches per row
  const hAt = (y) => wallRibHeightAtInches(x0 + (y + 0.5) * step) * WALL_RIB_VISUAL_SCALE;
  for (let y = 0; y < H; y++) {
    // Canvas row y grows downward; v grows upward (flipY) → dh/dv = -dh/dy.
    const dhdy = (hAt(y + 1) - hAt(y - 1)) / (2 * step);
    const dhdv = -dhdy;
    let nx = 0, ny = -dhdv * NORMAL_SIGN, nz = 1;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas); // linear data (no colour space)
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// Wall siding = flat wall colour + the roof-profile normal map (lighting
// shapes the grooves exactly like the roof's real ribs). The normal map
// SHARES repeat / offset / center / rotation with this colour texture, so
// callers' repeat.set(...) and vertical rotation apply to both. Use it as
// <meshStandardMaterial map={tex} normalMap={tex.userData.normalMap} … />.
export function createWallRibTexture(baseColor) {
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;

  const normal = createWallRibNormalMap();
  normal.repeat = tex.repeat;
  normal.offset = tex.offset;
  normal.center = tex.center;
  Object.defineProperty(normal, "rotation", { get: () => tex.rotation, set: () => {}, configurable: true });
  tex.userData.normalMap = normal;

  const disposeColor = tex.dispose.bind(tex);
  tex.dispose = () => { normal.dispose(); disposeColor(); };
  return tex;
}

// Enclosed-wall siding texture sized for a surface (world units).
// "vertical" turns the ribs to run up the wall (rib pitch across the width);
// anything else keeps horizontal ribs (pitch up the height). three.js applies
// repeat before rotation, so with a 90° turn repeat.y counts ribs across u.
export function createWallSidingTexture(baseColor, direction, widthWorld, heightWorld) {
  const t = createWallRibTexture(baseColor);
  if (direction === "vertical") {
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
    t.repeat.set(1, Math.max(widthWorld, 0.01) / WALL_RIB_TILE);
  } else {
    t.repeat.set(1, Math.max(heightWorld, 0.01) / WALL_RIB_TILE);
  }
  return t;
}

// ─── ROLL-UP DOOR SLATS ────────────────────────────────────
// Roll-up door curtain: fine horizontal slats (~4in real pitch — a bit
// tighter than the wall siding). Each slat is a crisp flat face ending in
// a thin bright-white rib line, with the solid medium-gray shadow band
// directly BELOW the rib (the only dark mark) — matching the reference
// look where the groove shadow falls under the slat rib.
export const ROLLUP_SLAT_PITCH_IN = 4;                                          // real inches between slats
export const ROLLUP_SLATS_PER_TILE = 4;                                         // slats per 256px texture tile
export const ROLLUP_SLAT_TILE = (ROLLUP_SLATS_PER_TILE * ROLLUP_SLAT_PITCH_IN) / 35; // world units (1 unit = 24 in)

export function createRollupSlatTexture(baseColor) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cell = size / ROLLUP_SLATS_PER_TILE;

  // Flat pan base color (the slat face)
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < ROLLUP_SLATS_PER_TILE; i++) {
    const y0 = i * cell;
    const grooveH = Math.round(cell * 0.15);
    // Crisp slat profile (reference look), top → bottom per cell:
    // 1) flat base-color face (~72%) — no gradient
    // 2) thin bright-white rib line at the slat's bottom edge
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(0, y0 + cell - grooveH - 2, size, 2);
    // 3) solid medium-gray shadow band directly BELOW the rib — the only
    //    dark mark on the slat
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(0, y0 + cell - grooveH, size, grooveH);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}