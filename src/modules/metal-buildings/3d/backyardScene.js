"use client";
// ═══════════════════════════════════════════════════════════
// backyardScene.js — procedural suburban backyard (three.js only).
//
//   SUN_DIR                        sun direction (matches the key light)
//   createSky(scale)               Preetham Sky mesh (three/addons Sky)
//   createSkyEnvironment(renderer) PMREM env map rendered from the sky
//   buildBackyardProps({ radius, groundY }) → { group, dispose }
//
// Yard axes (preview): front = −z, back = +z, right = +x, left = −x.
//   back + right : board-on-board privacy fence, neighbour houses behind
//   left         : tall hedge, conifers, farther houses
//   front        : open lawn, shrubs, distant trees
// All geometry/textures are generated in code and seeded (same every load).
// Canvas textures tile once per scene unit (2 ft) with world-scaled UVs.
// ═══════════════════════════════════════════════════════════

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

// Matches the shadow-casting directional light in BuildingPreviewV2.
export const SUN_DIR = new THREE.Vector3(0.8, 1.2, 0.6).normalize();

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── SKY ───────────────────────────────────────────────────
export function createSky(scale = 900) {
  const sky = new Sky();
  sky.scale.setScalar(scale);
  const u = sky.material.uniforms;
  u.turbidity.value = 2.5;
  u.rayleigh.value = 1.2;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(SUN_DIR);
  if (u.cloudCoverage) u.cloudCoverage.value = 0.35;
  if (u.cloudDensity) u.cloudDensity.value = 0.35;
  return sky;
}

/** PMREM render target lit by the sky (no sun disc). Caller disposes it. */
export function createSkyEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky = createSky(10);
  if (sky.material.uniforms.showSunDisc) sky.material.uniforms.showSunDisc.value = 0;
  envScene.add(sky);
  const rt = pmrem.fromScene(envScene);
  sky.geometry.dispose();
  sky.material.dispose();
  pmrem.dispose();
  return rt;
}

// ─── CANVAS TEXTURES ───────────────────────────────────────
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Lap siding — 4 courses (6") per tile; near-white so material.color tints it.
function makeSidingTexture(rand) {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#f6f6f4";
    ctx.fillRect(0, 0, w, h);
    const courses = 4;
    const ch = h / courses;
    for (let i = 0; i < courses; i++) {
      const y = i * ch;
      const g = ctx.createLinearGradient(0, y, 0, y + ch);
      g.addColorStop(0, "rgba(0,0,0,0.18)");
      g.addColorStop(0.2, "rgba(0,0,0,0.03)");
      g.addColorStop(1, "rgba(255,255,255,0.06)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y, w, ch);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, y, w, 1.5);
    }
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rand() * 0.03})`;
      ctx.fillRect(rand() * w, rand() * h, 2, 1);
    }
  });
}

// Asphalt shingles — 3 staggered rows of tabs per tile; mid-grey, tinted.
function makeShingleTexture(rand) {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#8c8c8c";
    ctx.fillRect(0, 0, w, h);
    const rows = 3, tabs = 4;
    const rh = h / rows, tw = w / tabs;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (tw / 2);
      for (let t = -1; t <= tabs; t++) {
        const l = Math.round(140 * (0.82 + rand() * 0.3));
        ctx.fillStyle = `rgb(${l},${l},${l})`;
        ctx.fillRect(t * tw + off + 1, r * rh + 1, tw - 2, rh - 2);
      }
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.fillRect(0, r * rh + rh - 3, w, 3);
    }
    for (let i = 0; i < 2600; i++) {
      const v = rand() < 0.5 ? 0 : 255;
      ctx.fillStyle = `rgba(${v},${v},${v},${0.05 + rand() * 0.08})`;
      ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
    }
  });
}

// One cedar fence board — grain along the length, a couple of knots.
function makeBoardTexture(rand) {
  return canvasTex(32, 256, (ctx, w, h) => {
    ctx.fillStyle = "#c39a6c";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      ctx.strokeStyle = `rgba(90,55,25,${0.1 + rand() * 0.15})`;
      ctx.lineWidth = 0.6 + rand();
      const x = rand() * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rand() - 0.5) * 6, h * 0.33, x + (rand() - 0.5) * 6, h * 0.66, x + (rand() - 0.5) * 3, h);
      ctx.stroke();
    }
    for (let k = 0; k < 2; k++) {
      ctx.fillStyle = "rgba(80,45,20,0.45)";
      ctx.beginPath();
      ctx.ellipse(4 + rand() * (w - 8), rand() * h, 2.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(40,22,10,0.35)";
    ctx.fillRect(0, 0, 1, h);
    ctx.fillRect(w - 1, 0, 1, h);
  });
}

// Box with UVs scaled to its size (1 texture tile per scene unit).
// BoxGeometry face order: +x, −x, +y, −y, +z, −z (4 vertices each).
function boxUV(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * spans[f][0], uv.getY(i) * spans[f][1]);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

// Collect matrices/colors, then build one InstancedMesh.
function instanced(geo, mat, items) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    if (it.c) mesh.setColorAt(i, it.c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

const SIDING_COLORS = ["#f3f3f0", "#e9dfcb", "#cfdbe4", "#dcd5c6", "#c5cfbe", "#f1ece2"];
const ROOF_TINTS = ["#80868f", "#b86d4c", "#8d9198", "#73604f", "#6a7380"];
const DOOR_COLORS = ["#2f3b4a", "#6b2f2a", "#33463a", "#3b3b3b"];

// ─── PROPS ─────────────────────────────────────────────────
// radius = fence half-size (scene units).
export function buildBackyardProps({ radius, groundY = 0 }) {
  const group = new THREE.Group();
  group.name = "backyard-props";
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const rand = rng(424242);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const half = radius;

  const M = () => new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const tmpP = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const mat4 = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) =>
    M().compose(tmpP.set(x, y, z), q.setFromAxisAngle(UP, ry), tmpS.set(sx, sy, sz));
  const green = (h0 = 0.25, l0 = 0.22) =>
    new THREE.Color().setHSL(h0 + rand() * 0.07, 0.42 + rand() * 0.18, l0 + rand() * 0.12);

  // Shared textures
  const sidingTex = keep(makeSidingTexture(rand));
  const shingleTex = keep(makeShingleTexture(rand));
  const boardTex = keep(makeBoardTexture(rand));

  // ── PRIVACY FENCE (back +z, right +x): boards + rails + posts ──
  const FENCE_H = 3;      // 6 ft
  const BOARD_W = 0.27;   // ~6.5"
  const BOARD_STEP = 0.28;
  const boardGeo = keep(new THREE.BoxGeometry(BOARD_W, FENCE_H, 0.04));
  boardGeo.translate(0, FENCE_H / 2, 0);
  const boardMat = keep(new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.9, metalness: 0 }));
  const boards = [];
  const nBoards = Math.ceil((half * 2) / BOARD_STEP);
  for (let i = 0; i <= nBoards; i++) {
    const t = -half + i * BOARD_STEP;
    const tint = () => new THREE.Color().setScalar(0.82 + rand() * 0.22);
    const dh = 1 + (rand() - 0.5) * 0.02;
    boards.push({ m: mat4(t, groundY, half, 1, dh, 1, 0), c: tint() });          // back
    boards.push({ m: mat4(half, groundY, t, 1, dh, 1, Math.PI / 2), c: tint() }); // right
  }
  group.add(keep(instanced(boardGeo, boardMat, boards)));

  const woodDark = keep(new THREE.MeshStandardMaterial({ color: "#7a5634", roughness: 0.9 }));
  const railGeo = keep(new THREE.BoxGeometry(1, 0.14, 0.09));
  const rails = [];
  for (const y of [0.6, FENCE_H - 0.5]) {
    rails.push({ m: mat4(0, groundY + y, half + 0.07, half * 2, 1, 1, 0) });
    rails.push({ m: mat4(half + 0.07, groundY + y, 0, half * 2, 1, 1, Math.PI / 2) });
  }
  group.add(keep(instanced(railGeo, woodDark, rails)));

  const postGeo = keep(new THREE.BoxGeometry(0.2, FENCE_H + 0.15, 0.2));
  postGeo.translate(0, (FENCE_H + 0.15) / 2, 0);
  const posts = [];
  const POST_STEP = 4;
  const nPosts = Math.round((half * 2) / POST_STEP);
  for (let i = 0; i <= nPosts; i++) {
    const t = -half + i * POST_STEP;
    posts.push({ m: mat4(t, groundY, half + 0.12) });
    posts.push({ m: mat4(half + 0.12, groundY, t) });
  }
  group.add(keep(instanced(postGeo, woodDark, posts)));

  // ── HOUSES ──
  const frameMat = keep(new THREE.MeshStandardMaterial({ color: "#fbfbfb", roughness: 0.6 }));
  const glassMat = keep(new THREE.MeshStandardMaterial({ color: "#26323d", roughness: 0.08, metalness: 0.4 }));
  const shutterMat = keep(new THREE.MeshStandardMaterial({ color: "#1f2328", roughness: 0.7 }));
  const brickMat = keep(new THREE.MeshStandardMaterial({ color: "#8a4b3a", roughness: 0.95 }));
  const frameGeo = keep(new THREE.BoxGeometry(1.5, 2.1, 0.1));
  const glassGeo = keep(new THREE.BoxGeometry(1.22, 1.82, 0.06));
  const shutterGeo = keep(new THREE.BoxGeometry(0.5, 2.1, 0.06));
  const doorGeo = keep(new THREE.BoxGeometry(1.3, 3.2, 0.1));

  function buildHouse() {
    const g = new THREE.Group();
    const stories = rand() < 0.65 ? 2 : 1;
    const w = 12 + rand() * 5;
    const d = 9 + rand() * 3;
    const h = stories === 2 ? 9 : 5.2;
    const pitch = 0.45 + rand() * 0.3;
    const rise = pitch * (d / 2);
    const ov = 0.6;

    const sidingMat = keep(new THREE.MeshStandardMaterial({ map: sidingTex, color: pick(SIDING_COLORS), roughness: 0.85, side: THREE.DoubleSide }));
    const roofMat = keep(new THREE.MeshStandardMaterial({ map: shingleTex, color: pick(ROOF_TINTS), roughness: 0.9 }));
    const doorMat = keep(new THREE.MeshStandardMaterial({ color: pick(DOOR_COLORS), roughness: 0.6 }));

    // Body
    const bodyGeo = keep(boxUV(w, h, d));
    bodyGeo.translate(0, h / 2, 0);
    g.add(new THREE.Mesh(bodyGeo, sidingMat));

    // Gable ends at ±x (ridge along x)
    const tri = new THREE.Shape();
    tri.moveTo(-d / 2, 0);
    tri.lineTo(d / 2, 0);
    tri.lineTo(0, rise);
    tri.closePath();
    for (const sgn of [1, -1]) {
      const gg = keep(new THREE.ShapeGeometry(tri));
      gg.rotateY(sgn * Math.PI / 2);
      gg.translate(sgn * (w / 2 + 0.001), h, 0);
      g.add(new THREE.Mesh(gg, sidingMat));
    }

    // Roof slabs (front toward +z, back toward −z)
    const run = d / 2 + ov;
    const L = Math.hypot(run, run * pitch);
    const a = Math.atan(pitch);
    const slabGeo = keep(boxUV(w + ov * 2, 0.15, L));
    for (const sgn of [1, -1]) {
      const slab = new THREE.Mesh(slabGeo, roofMat);
      slab.position.set(0, h + rise - (pitch * run) / 2 + 0.08, (sgn * run) / 2);
      slab.rotation.x = sgn * a;
      g.add(slab);
    }

    // Chimney
    const chim = new THREE.Mesh(keep(new THREE.BoxGeometry(1, rise + 2.2, 1)), brickMat);
    chim.position.set(w * 0.3 * (rand() < 0.5 ? 1 : -1), h + (rise + 2.2) / 2, -d * 0.18);
    g.add(chim);

    // Front windows (+z face), door centered on the ground floor
    const fz = d / 2;
    const cols = Math.max(2, Math.floor(w / 3.4));
    const span = w - 3;
    for (let s = 0; s < stories; s++) {
      const cy = s === 0 ? 2.6 : 6.9;
      for (let c = 0; c < cols; c++) {
        const cx = -span / 2 + (cols === 1 ? span / 2 : (c / (cols - 1)) * span);
        if (s === 0 && Math.abs(cx) < 1.6) continue; // door slot
        const fr = new THREE.Mesh(frameGeo, frameMat);
        fr.position.set(cx, cy, fz + 0.05);
        const gl = new THREE.Mesh(glassGeo, glassMat);
        gl.position.set(cx, cy, fz + 0.09);
        const sl = new THREE.Mesh(shutterGeo, shutterMat);
        sl.position.set(cx - 1.05, cy, fz + 0.04);
        const sr = new THREE.Mesh(shutterGeo, shutterMat);
        sr.position.set(cx + 1.05, cy, fz + 0.04);
        g.add(fr, gl, sl, sr);
      }
    }
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 1.6, fz + 0.05);
    g.add(door);

    return { g, d };
  }

  // rotation.y maps local +z (house front) → (sin θ, 0, cos θ)
  const placeHouse = (x, z, ry) => {
    const { g } = buildHouse();
    g.position.set(x, groundY, z);
    g.rotation.y = ry;
    group.add(g);
  };
  // Back row (faces −z), right row (faces −x), far left row (faces +x)
  const backZ = half + 6 + 6;
  [-0.62, 0, 0.62].forEach((k) => placeHouse(k * half + (rand() - 0.5) * 3, backZ + rand() * 3, Math.PI));
  const rightX = half + 6 + 6;
  [-0.38, 0.38].forEach((k) => placeHouse(rightX + rand() * 3, k * half + (rand() - 0.5) * 3, -Math.PI / 2));
  const leftX = -half - 24;
  [-0.4, 0.4].forEach((k) => placeHouse(leftX - rand() * 4, k * half, Math.PI / 2));

  // ── HEDGE (left, −x) — dense rows of squashed leaf blobs ──
  const leafGeo = keep(new THREE.IcosahedronGeometry(1, 1));
  const leafMat = keep(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85, flatShading: true }));
  const hedge = [];
  const hx = -half + 0.9;
  for (let z = -half * 0.95; z <= half * 0.95; z += 0.8) {
    for (let layer = 0; layer < 3; layer++) {
      const r = 0.9 + rand() * 0.35;
      hedge.push({
        m: mat4(hx + (rand() - 0.5) * 0.5, groundY + 0.7 + layer * 0.85 + rand() * 0.2, z + (rand() - 0.5) * 0.4, r, r * 0.9, r, rand() * Math.PI),
        c: green(0.26, 0.17),
      });
    }
  }

  // ── TREES (broadleaf + conifer) ──
  const trunkGeo = keep(new THREE.CylinderGeometry(0.2, 0.36, 1, 7));
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = keep(new THREE.MeshStandardMaterial({ color: "#5a4231", roughness: 0.95 }));
  const coneGeo = keep(new THREE.ConeGeometry(1, 1, 9));
  coneGeo.translate(0, 0.5, 0);
  const trunks = [];
  const canopy = [...hedge];
  const cones = [];

  const broadleaf = (x, z, k = 1) => {
    const th = (3.5 + rand() * 3) * k;
    const cr = (3 + rand() * 2.2) * k;
    trunks.push({ m: mat4(x, groundY, z, 1.2 * k, th, 1.2 * k) });
    for (let b = 0; b < 6; b++) {
      const r = cr * (0.55 + rand() * 0.35);
      canopy.push({
        m: mat4(
          x + (rand() - 0.5) * cr * 1.1,
          groundY + th + cr * 0.4 + rand() * cr * 0.8,
          z + (rand() - 0.5) * cr * 1.1,
          r, r * (0.8 + rand() * 0.25), r, rand() * Math.PI
        ),
        c: green(0.22, 0.2),
      });
    }
  };
  const conifer = (x, z, k = 1) => {
    const H = (10 + rand() * 8) * k;
    const R = (2.2 + rand() * 1) * k;
    trunks.push({ m: mat4(x, groundY, z, 0.9 * k, H * 0.25, 0.9 * k) });
    const col = green(0.3, 0.13);
    for (let i = 0; i < 3; i++) {
      const base = H * (0.18 + i * 0.24);
      const r = R * (1 - i * 0.26);
      cones.push({ m: mat4(x, groundY + base, z, r, H * (0.42 - i * 0.06), r, rand() * Math.PI), c: col.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.04) });
    }
  };
  const tree = (x, z) => (rand() < 0.5 ? broadleaf(x, z) : conifer(x, z));

  // Between fence and houses (back/right) and beyond the houses
  for (let i = 0; i < 10; i++) tree((rand() * 2 - 1) * half * 1.3, half + 2.5 + rand() * 2.5);
  for (let i = 0; i < 12; i++) tree((rand() * 2 - 1) * half * 1.6, half + 26 + rand() * 14);
  for (let i = 0; i < 7; i++) tree(half + 2.5 + rand() * 2.5, (rand() * 2 - 1) * half);
  for (let i = 0; i < 9; i++) tree(half + 26 + rand() * 14, (rand() * 2 - 1) * half * 1.4);
  // Left: conifers behind the hedge
  for (let i = 0; i < 14; i++) conifer(-half - 3 - rand() * 14, (rand() * 2 - 1) * half * 1.2, 0.9 + rand() * 0.3);
  // Front: distant broadleaf line + shrubs on the lawn edge
  for (let i = 0; i < 14; i++) broadleaf((rand() * 2 - 1) * half * 1.5, -half - 6 - rand() * 22);
  for (let i = 0; i < 16; i++) {
    const r = 0.7 + rand() * 0.6;
    canopy.push({ m: mat4((rand() * 2 - 1) * half * 0.9, groundY + r * 0.45, -half + 0.8 + rand() * 1.2, r * 1.2, r * 0.75, r), c: green(0.26, 0.2) });
  }

  group.add(keep(instanced(trunkGeo, trunkMat, trunks)));
  group.add(keep(instanced(leafGeo, leafMat, canopy)));
  group.add(keep(instanced(coneGeo, leafMat, cones)));

  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose?.();
    },
  };
}