"use client";
// ═══════════════════════════════════════════════════════════
// wallRibTexture — Enclosed-wall siding texture (horizontal corrugation).
// Shared by the wall meshes and the wall-matched door slabs so openings and
// walls always show the same rib pitch.
// ═══════════════════════════════════════════════════════════

import * as THREE from "three";

// Enclosed-wall siding: horizontal R-panel / PBR groove look (reference
// swatch). One major rib every 12 real inches; one 256px texture tile holds
// WALL_RIBS_PER_TILE ribs, and WALL_RIB_TILE is that tile's world-space
// height so callers (repeat.v = wallHeight / WALL_RIB_TILE) keep the same
// real rib pitch on every wall, lean-to, storage wall and door slab.
export const WALL_RIB_PITCH_IN = 5;                                       // real inches between major ribs
export const WALL_RIBS_PER_TILE = 2;                                        // major ribs per 256px texture tile
export const WALL_RIB_TILE = (WALL_RIBS_PER_TILE * WALL_RIB_PITCH_IN) / 18; // world units (1 unit = 24 in)

// R-panel groove profile per 12" cell (top → bottom), drawn over the flat
// pan in the selected wall color (color itself is never changed):
//   - major rib (~1"): bright lit crown edge, faint lit rib face, then a
//     sharp dark shadow line directly under the rib and a soft falloff onto
//     the pan — the strong highlight/shadow pair in the reference;
//   - two minor stiffener ribs at 1/3 and 2/3 of the pan: faint 1px
//     highlight with a 1px shadow under it.
// Ribs run horizontally across the surface.
export function createWallRibTexture(baseColor) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Flat pan base color
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  const cell = size / WALL_RIBS_PER_TILE; // px per 12" rib cell
  const band = (y, h, rgba) => {
    ctx.fillStyle = rgba;
    ctx.fillRect(0, Math.round(y), size, h);
  };

  for (let i = 0; i < WALL_RIBS_PER_TILE; i++) {
    const y0 = i * cell;
    // Major rib: lit crown, rib face, shadow under the rib, soft falloff.
    band(y0, 2, "rgba(255,255,255,0.28)");
    band(y0 + 2, 6, "rgba(255,255,255,0.06)");
    band(y0 + 8, 2, "rgba(0,0,0,0.35)");
    band(y0 + 10, 3, "rgba(0,0,0,0.12)");
    // Minor stiffener ribs across the pan.
    for (const f of [1 / 3, 2 / 3]) {
      const y = y0 + cell * f;
      band(y, 1, "rgba(255,255,255,0.14)");
      band(y + 1, 1, "rgba(0,0,0,0.18)");
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Keep the thin rib lines crisp at grazing angles (three.js clamps this to
  // the GPU's maximum).
  tex.anisotropy = 8;
  return tex;
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