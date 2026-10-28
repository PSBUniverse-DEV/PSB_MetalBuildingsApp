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
export const WALL_RIBS_PER_TILE = 8;                                       // ridges per 256px texture tile
export const WALL_RIB_TILE = (WALL_RIBS_PER_TILE * WALL_RIB_PITCH_IN) / 24; // world units (1 unit = 24 in)

// Fine uniform horizontal ridges (~5in pitch), each cell a soft shadow groove
// + bright crown — plain horizontal corrugation look. Ridges run horizontally
// across the surface; callers scale repeat.v with WALL_RIB_TILE to keep the
// pitch on any wall or door slab.
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
    // Horizontal ridge: shadow groove, then bright crown
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, p, size, 2);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(0, p + 2, size, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}