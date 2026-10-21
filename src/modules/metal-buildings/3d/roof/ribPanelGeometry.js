// ═══════════════════════════════════════════════════════════
// ribPanelGeometry — R-panel / PBR striated rib metal roof panel
//
// Builds ONE indexed BufferGeometry for ONE roof slope:
//   - Major rib (trapezoid) every 12" across the panel width
//   - 4 paired minor stiffening ribs in each 12" flat
//   - Ribs run DOWN the slope (eave -> ridge); the profile repeats
//     along the building length
//   - Two vertices per profile point (eave edge + ridge edge),
//     quad-strip triangles, computeVertexNormals(),
//     UVs (u across, v along the slope)
//
// World units: the preview uses SCALE = 0.5 (1 unit = 2 ft = 24 in),
// so 1 inch = IN_TO_UNIT world units.
// ═══════════════════════════════════════════════════════════

import * as THREE from "three";

// ─── RIB PROFILE (inches) ─────────────────────────────────
export const RIB_MAJOR_SPACING_IN = 12;      // major rib centerline pitch
export const RIB_MAJOR_BASE_IN = 3;          // major rib trapezoid base width
export const RIB_MAJOR_TOP_IN = 1;           // major rib trapezoid top width
export const RIB_MAJOR_HEIGHT_IN = 1.25;     // major rib height
export const RIB_MINOR_BASE_IN = 0.6;        // minor rib trapezoid base width
export const RIB_MINOR_TOP_IN = 0.2;         // minor rib trapezoid top width
export const RIB_MINOR_HEIGHT_IN = 0.2;      // minor rib height
// Paired minor stiffening ribs in each flat, offsets from the major rib centerline
export const RIB_MINOR_OFFSETS_IN = [3.8, 4.6, 7.4, 8.2];

// ─── VISUAL SCALE ─────────────────────────────────────────
// Real 1.25" ribs are nearly invisible on a 24'x30' building at the
// default camera distance. RIB_VISUAL_SCALE multiplies rib heights so
// they read clearly in the viewport. Use 1 for true-to-scale output.
export const RIB_VISUAL_SCALE = 0.5; // 1.0 = true scale, 1.5 = 50% taller, etc.

// ─── UNITS ────────────────────────────────────────────────
export const IN_TO_UNIT = 1 / 24; // 1 inch -> world units (1 unit = 2 ft)

// Tallest rib above the panel base plane, world units
// (e.g. ridge-cap clearance over the rib crowns).
export const RIB_MAX_HEIGHT = RIB_MAJOR_HEIGHT_IN * RIB_VISUAL_SCALE * IN_TO_UNIT;

// One 12" module of the cross-section profile: [xInches, heightInches].
// Major rib centered at x = 0, minor ribs at RIB_MINOR_OFFSETS_IN.
function moduleProfile() {
  const pts = [];
  const mb = RIB_MAJOR_BASE_IN / 2;
  const mt = RIB_MAJOR_TOP_IN / 2;
  pts.push([-mb, 0], [-mt, RIB_MAJOR_HEIGHT_IN], [mt, RIB_MAJOR_HEIGHT_IN], [mb, 0]);
  for (const off of RIB_MINOR_OFFSETS_IN) {
    const nb = RIB_MINOR_BASE_IN / 2;
    const nt = RIB_MINOR_TOP_IN / 2;
    pts.push([off - nb, 0], [off - nt, RIB_MINOR_HEIGHT_IN], [off + nt, RIB_MINOR_HEIGHT_IN], [off + nb, 0]);
  }
  return pts;
}

/**
 * Build one roof slope as an R-panel / PBR rib profile strip.
 *
 * @param {Object} args
 * @param {number} args.zF - Z at the front edge of the slope
 * @param {number} args.zB - Z at the back edge of the slope
 * @param {[number, number]} args.eave - [x, y] of the eave edge
 * @param {[number, number]} args.ridge - [x, y] of the ridge edge
 * @param {number} [args.baseLift=0] - constant lift along the slope normal
 *   above the ribbed surface (e.g. ridge-cap sheet thickness)
 * @returns {THREE.BufferGeometry} ribbed slope (use ONE mesh per slope)
 */
export function createRibPanelGeometry({ zF, zB, eave, ridge, baseLift = 0 }) {
  const zSpan = zB - zF;

  // Slope outward normal in the XY plane (always up-facing and
  // normalized), and whether the triangle winding must be reversed
  // to face that way.
  let nx = ridge[1] - eave[1];
  let ny = -(ridge[0] - eave[0]);
  const nLen = Math.hypot(nx, ny) || 1;
  nx /= nLen;
  ny /= nLen;
  let flipped = false;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
    flipped = true;
  }

  // Repeat the profile in whole 12" modules; scale the module width
  // slightly so the last module closes cleanly at zB.
  const widthIn = zSpan / IN_TO_UNIT;
  const nModules = Math.max(1, Math.round(widthIn / RIB_MAJOR_SPACING_IN));
  const cell = moduleProfile();
  const xStart = -RIB_MAJOR_BASE_IN / 2; // profile starts at the major rib base edge
  const totalIn = nModules * RIB_MAJOR_SPACING_IN;

  // Profile points across the panel width: [xInches, heightInches]
  const profile = [];
  for (let m = 0; m < nModules; m++) {
    const ox = m * RIB_MAJOR_SPACING_IN;
    for (const [px, ph] of cell) profile.push([px + ox, ph]);
  }
  profile.push([totalIn + xStart, 0]); // close the final flat cleanly

  // Strip: two vertices per profile point (eave edge + ridge edge),
  // quad-strip triangles between consecutive points.
  const positions = [];
  const uvs = [];
  const indices = [];
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    const [xIn, hIn] = profile[i];
    const z = zF + ((xIn - xStart) / totalIn) * zSpan;
    const h = hIn * RIB_VISUAL_SCALE * IN_TO_UNIT + baseLift;
    const ox = nx * h;
    const oy = ny * h;
    const u = (z - zF) / zSpan;
    positions.push(eave[0] + ox, eave[1] + oy, z);
    uvs.push(u, 0);
    positions.push(ridge[0] + ox, ridge[1] + oy, z);
    uvs.push(u, 1);
    if (i < n - 1) {
      const a = i * 2; // eave i
      const b = a + 1; // ridge i
      const c = a + 2; // eave i+1
      const d = a + 3; // ridge i+1
      if (!flipped) indices.push(a, b, c, c, b, d);
      else indices.push(a, c, b, c, d, b);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * Build one ridge-cap leg as a 3-row strip that hugs the ribbed roof but
 * keeps a clean STRAIGHT outer silhouette (no stair-step rib edges):
 *   Row A - hem bottom:  outer edge at a constant hemLift => straight line
 *                        where the cap meets the roof; seals the gap
 *   Row B - band edge:   outer edge following the rib profile + baseLift
 *   Row C - crest:       ridge edge following the rib profile + baseLift
 * The hem face (A->B) hides the rib cross-sections behind the straight
 * line; the band (B->C) keeps the ribs faintly crossing it. Same rib
 * phase as createRibPanelGeometry when given the same zF/zB.
 *
 * @param {Object} args
 * @param {number} args.zF - Z at the front edge of the leg
 * @param {number} args.zB - Z at the back edge of the leg
 * @param {[number, number]} args.eave - [x, y] of the outer (hem) edge
 * @param {[number, number]} args.ridge - [x, y] of the crest edge
 * @param {number} [args.baseLift=0] - lift above the ribbed surface
 * @param {number} [args.hemLift=0.002] - constant hem-bottom lift
 * @returns {THREE.BufferGeometry} rib-conforming cap leg with straight hem
 */
export function createRidgeCapGeometry({ zF, zB, eave, ridge, baseLift = 0, hemLift = 0.002 }) {
  const zSpan = zB - zF;

  // Same outward normal / winding rule as createRibPanelGeometry
  let nx = ridge[1] - eave[1];
  let ny = -(ridge[0] - eave[0]);
  const nLen = Math.hypot(nx, ny) || 1;
  nx /= nLen;
  ny /= nLen;
  let flipped = false;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
    flipped = true;
  }

  // Same rib phase as the roof slopes: whole 12" modules over the same span
  const widthIn = zSpan / IN_TO_UNIT;
  const nModules = Math.max(1, Math.round(widthIn / RIB_MAJOR_SPACING_IN));
  const cell = moduleProfile();
  const xStart = -RIB_MAJOR_BASE_IN / 2;
  const totalIn = nModules * RIB_MAJOR_SPACING_IN;

  const profile = [];
  for (let m = 0; m < nModules; m++) {
    const ox = m * RIB_MAJOR_SPACING_IN;
    for (const [px, ph] of cell) profile.push([px + ox, ph]);
  }
  profile.push([totalIn + xStart, 0]);

  // 3 rows per profile point: A (hem bottom), B (band edge), C (crest)
  const positions = [];
  const uvs = [];
  const indices = [];
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    const [xIn, hIn] = profile[i];
    const z = zF + ((xIn - xStart) / totalIn) * zSpan;
    const h = hIn * RIB_VISUAL_SCALE * IN_TO_UNIT + baseLift;
    const u = (z - zF) / zSpan;
    // Row A - hem bottom: constant lift => exactly straight silhouette
    positions.push(eave[0] + nx * hemLift, eave[1] + ny * hemLift, z);
    uvs.push(u, 0);
    // Row B - band outer edge: conforming to the ribs
    positions.push(eave[0] + nx * h, eave[1] + ny * h, z);
    uvs.push(u, 0.15);
    // Row C - crest: conforming to the ribs
    positions.push(ridge[0] + nx * h, ridge[1] + ny * h, z);
    uvs.push(u, 1);
    if (i < n - 1) {
      const pA = i * 3, pB = pA + 1, pC = pA + 2;
      const nA = pA + 3, nB = pB + 3, nC = pC + 3;
      if (!flipped) {
        // Hem face (A->B) then band top (B->C)
        indices.push(pA, pB, nA, nA, pB, nB);
        indices.push(pB, pC, nB, nB, pC, nC);
      } else {
        indices.push(pA, nA, pB, nA, nB, pB);
        indices.push(pB, nB, pC, nB, nC, pC);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}