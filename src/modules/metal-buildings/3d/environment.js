"use client";
// ═══════════════════════════════════════════════════════════
// environment.js — Procedural 3D backyard for the 3D preview (three.js only).
//
//   setupEnvironment(scene, renderer)
//     → { setTopView, setActive, setBackdrop, setSize, dispose }
//
// Applied only while the "Backyard" background is selected; other presets
// use the backdrop set via setBackdrop (Default = plain white).
//
// - Sky: three.js Sky shader (Preetham + soft clouds) — backyardScene.js.
// - Lighting: PMREM environment map rendered from the same sky (no HDR file).
// - Ground: large grass disc with a procedural CanvasTexture (no image).
// - Props: fence, trees, bushes, distant houses (backyardScene.js), sized to
//   the building so the fence stays just outside the camera's zoom range.
// - Realism: ACES tone mapping, sRGB output, PCF soft shadows, horizon fog.
// ═══════════════════════════════════════════════════════════

import * as THREE from "three";
import { createSky, createSkyEnvironment, buildBackyardProps } from "./backyardScene";

// ─── TUNABLES (edit freely) ────────────────────────────────
// Scene units: 1 unit = 2 ft (SCALE = 0.5 in the preview).

// Yard radius = building maxDim × SKYBOX_RADIUS_PER_DIM, clamped to
// [SKYBOX_MIN_RADIUS, SKYBOX_RADIUS]. While the backyard is on,
// OrbitControls' maxDistance is clamped to 0.9 × that radius (in
// BuildingPreviewV2), so the fence (at YARD_FENCE_K × radius) never blocks
// the building.
export const SKYBOX_RADIUS = 250;        // maximum yard radius
export const SKYBOX_MIN_RADIUS = 30;     // minimum yard radius (~60 ft)
export const SKYBOX_RADIUS_PER_DIM = 2.5;
const YARD_FENCE_K = 0.95;

/** Yard radius (scene units) for a building of size maxDim. */
export function skyboxRadiusFor(maxDim) {
  const r = (Number(maxDim) || 0) * SKYBOX_RADIUS_PER_DIM;
  return Math.min(SKYBOX_RADIUS, Math.max(SKYBOX_MIN_RADIUS, r));
}

// Grass disc — reaches far past the yard; fog blends the edge.
export const GROUND_RADIUS = SKYBOX_RADIUS - 5;
export const GRASS_REPEAT = 20;

// Lighting
export const ENV_INTENSITY = 1.0;  // sky environment strength on the building
export const SUN_INTENSITY = 1.4;  // shadow-casting directional light

// Horizon fog — near/far are multiples of the yard radius (set in setSize).
export const FOG_COLOR = "#d6e4ef";
export const FOG_NEAR_K = 1.2;
export const FOG_FAR_K = 2.4;

// Sky box scale — inside the camera far plane (1000).
const SKY_SCALE = 900;

// Backdrops
const DEFAULT_BG = "#ffffff";   // plain white — the default background
const HORIZON_BG = "#cfe0ee";   // under the sky mesh (captures / safety)
const TOP_VIEW_BG = "#e9eef2";  // neutral backdrop for Top View

// Optional grass detail maps from /public (skipped silently when missing).
const GRASS_NORMAL_URL = "/assets/textures/grass_normal.jpg";
const GRASS_ROUGHNESS_URL = "/assets/textures/grass_roughness.jpg";

// Grass sits just under the installation slab (y = -0.11..+0.01).
const GROUND_Y = -0.115;

const defaultColor = new THREE.Color(DEFAULT_BG);
const horizonColor = new THREE.Color(HORIZON_BG);
const topViewColor = new THREE.Color(TOP_VIEW_BG);

// ─── PROCEDURAL GRASS (THREE.CanvasTexture, tileable) ──────
const GRASS_BASE = "#4c8f3f";
const GRASS_TONES = [
  [62, 122, 50], [78, 142, 58], [96, 160, 66], [54, 108, 44], [112, 170, 78], [70, 128, 46],
];

function makeGrassTexture(size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  let seed = 20240611;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const tone = () => GRASS_TONES[Math.floor(rand() * GRASS_TONES.length)];

  ctx.fillStyle = GRASS_BASE;
  ctx.fillRect(0, 0, size, size);

  const EDGE = 48;
  const wrapped = (x, y, draw) => {
    const xs = [0];
    const ys = [0];
    if (x < EDGE) xs.push(size);
    if (x > size - EDGE) xs.push(-size);
    if (y < EDGE) ys.push(size);
    if (y > size - EDGE) ys.push(-size);
    for (const ox of xs) for (const oy of ys) draw(x + ox, y + oy);
  };

  for (let i = 0; i < 160; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 12 + rand() * 36;
    const [cr, cg, cb] = tone();
    const a = 0.18 + rand() * 0.22;
    wrapped(x, y, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }

  ctx.lineCap = "round";
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 4 + rand() * 8;
    const ang = -Math.PI / 2 + (rand() - 0.5) * 1.2;
    const dx = Math.cos(ang) * len;
    const dy = Math.sin(ang) * len;
    const [cr, cg, cb] = tone();
    const light = rand() < 0.15 ? 28 : 0;
    ctx.strokeStyle = `rgba(${Math.min(255, cr + light)},${Math.min(255, cg + light)},${Math.min(255, cb + light)},${0.55 + rand() * 0.4})`;
    ctx.lineWidth = 0.8 + rand() * 0.9;
    wrapped(x, y, (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + dx, py + dy);
      ctx.stroke();
    });
  }

  return new THREE.CanvasTexture(canvas);
}

/**
 * Builds the environment around the existing scene. Returns a handle whose
 * dispose() removes and disposes everything this module added.
 */
export function setupEnvironment(scene, renderer) {
  const disposables = [];
  const prevBackground = scene.background;
  const prevEnvironment = scene.environment;
  const prevFog = scene.fog;

  let disposed = false;
  let topView = false;
  let envActive = false;
  // Backdrop shown while the backyard is OFF (other presets): THREE.Color or
  // Texture owned by the caller; null = plain white.
  let backdrop = null;

  // ─── Realism settings ─────────────────────────────────────
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ─── Fog + plain white until activated ────────────────────
  const fog = new THREE.Fog(FOG_COLOR, SKYBOX_RADIUS * FOG_NEAR_K, SKYBOX_RADIUS * FOG_FAR_K);
  scene.background = defaultColor.clone();

  // ─── Sky (backdrop) + sky-lit environment map ─────────────
  const sky = createSky(SKY_SCALE);
  sky.visible = false;
  scene.add(sky);
  disposables.push(sky.geometry, sky.material);
  const envRT = createSkyEnvironment(renderer);
  disposables.push(envRT);

  // ─── Grass ground (procedural texture) ────────────────────
  const groundGeo = new THREE.CircleGeometry(GROUND_RADIUS, 96);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, metalness: 0.0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = GROUND_Y;
  ground.receiveShadow = true;
  ground.visible = false;
  scene.add(ground);
  disposables.push(groundGeo, groundMat);

  const tileTexture = (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(GRASS_REPEAT, GRASS_REPEAT);
    return tex;
  };
  {
    const tex = tileTexture(makeGrassTexture());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    disposables.push(tex);
    groundMat.map = tex;
    groundMat.needsUpdate = true;
  }
  const texLoader = new THREE.TextureLoader();
  const loadOptional = (url, onOk) =>
    texLoader.load(
      url,
      (tex) => {
        if (disposed) { tex.dispose(); return; }
        disposables.push(tex);
        onOk(tex);
      },
      undefined,
      () => {}
    );
  loadOptional(GRASS_NORMAL_URL, (tex) => { groundMat.normalMap = tileTexture(tex); groundMat.needsUpdate = true; });
  loadOptional(GRASS_ROUGHNESS_URL, (tex) => { groundMat.roughnessMap = tileTexture(tex); groundMat.needsUpdate = true; });

  // ─── Props (fence, trees, bushes, houses) — sized in setSize ─
  let yardRadius = 0;
  let props = null;

  function buildProps() {
    if (disposed || yardRadius <= 0) return;
    if (props) { scene.remove(props.group); props.dispose(); }
    props = buildBackyardProps({ radius: yardRadius * YARD_FENCE_K, groundY: GROUND_Y });
    props.group.visible = envActive;
    scene.add(props.group);
  }

  // ─── Visibility state (default vs backyard, 3D vs Top View) ─
  function update() {
    sky.visible = envActive && !topView;
    ground.visible = envActive;
    if (props) props.group.visible = envActive;

    if (!envActive) {
      scene.environment = prevEnvironment ?? null;
      scene.fog = prevFog ?? null;
      scene.background = backdrop ?? defaultColor.clone();
      return;
    }

    scene.fog = fog;
    scene.environment = envRT.texture;
    scene.environmentIntensity = ENV_INTENSITY;
    scene.background = topView ? topViewColor.clone() : horizonColor.clone();
  }

  const handle = {
    /** Top View: hide the sky, use a neutral backdrop (grass + props stay). */
    setTopView(value) {
      topView = !!value;
      update();
    },
    /** Backyard on/off. */
    setActive(value) {
      envActive = !!value;
      update();
    },
    /** Backdrop (THREE.Color / Texture, or null = white) used while the backyard is off. */
    setBackdrop(value) {
      backdrop = value ?? null;
      update();
    },
    /** Size the yard (fence, trees, houses) and fog to the building's maxDim. */
    setSize(maxDim) {
      const r = skyboxRadiusFor(maxDim);
      if (Math.abs(r - yardRadius) < 0.01) return;
      yardRadius = r;
      fog.near = r * FOG_NEAR_K;
      fog.far = r * FOG_FAR_K;
      buildProps();
      update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (props) { scene.remove(props.group); props.dispose(); props = null; }
      scene.remove(ground);
      scene.remove(sky);
      for (const d of disposables) d.dispose?.();
      scene.environment = prevEnvironment ?? null;
      scene.fog = prevFog ?? null;
      scene.background = prevBackground ?? null;
    },
  };

  update();
  return handle;
}