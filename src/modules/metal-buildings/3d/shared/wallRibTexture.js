"use client";
// ═══════════════════════════════════════════════════════════
// wallRibTexture — Enclosed-wall siding texture (horizontal corrugation).
// Shared by the wall meshes and the wall-matched door slabs so openings and
// walls always show the same rib pitch.
// ═══════════════════════════════════════════════════════════

import * as THREE from "three";

// Enclosed-wall siding: fine uniform horizontal ridges. One texture tile
// holds 8 ridges; WALL_RIB_TILE is its world-space height so callers keep
// the ridge pitch at ~5 real inches on any surface.
export const WALL_RIB_PITCH_IN = 5;                                        // real inches between ridges
export const WALL_RIBS_PER_TILE = 12;                                       // ridges per 256px texture tile
export const WALL_RIB_TILE = (WALL_RIBS_PER_TILE * WALL_RIB_PITCH_IN) / 24; // world units (1 unit = 24 in)

// Fine uniform horizontal ridges (~5in pitch). Each ridge cell: flat pan
// face, then at the seam a subtle bright crown (the lit groove lip) with a
// soft groove shadow directly below it (the only dark mark) — the photo-real
// reference look where the shadow falls under the rib. Ridges run
// horizontally across the surface; callers scale repeat.v with
// WALL_RIB_TILE to keep the pitch on any wall or door slab.
export function createWallRibTexture(baseColor, lineSpacing = 32) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Flat pan base color
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  for (let p = 0; p < size; p += lineSpacing) {
    // Ridge seam, top → bottom: subtle bright crown, then the soft shadow
    // line below it with gradient falloff on both edges (~3px).
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(0, p, size, 1);
    [0.07, 0.17, 0.08].forEach((a, i) => {
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(0, p + 1 + i, size, 1);
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
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