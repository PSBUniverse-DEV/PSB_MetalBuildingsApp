"use client";
// ═══════════════════════════════════════════════════════════
// environment.js — Photoreal backyard environment for the 3D preview.
//
//   setupEnvironment(scene, renderer) → { setTopView, setActive, dispose }
//
// Applied only while a NON-default background is selected in the viewer's
// "Change background" picker; the default background is plain white (no
// dome, grass, fog, or HDR lighting).
//
// - Panorama: loads an equirectangular HDR (RGBELoader), assigns it to
//   scene.environment for realistic lighting/reflections on the building,
//   and projects it onto a GroundedSkybox dome so the horizon lines up
//   with the ground. Falls back to scene.background = texture if the dome
//   misbehaves, and to a neutral sky-blue while (or if) the HDR is absent.
// - Grass: a large ground disc with a tiled grass color map (normal and
//   roughness maps are optional and skipped silently when missing).
// - Realism: ACES tone mapping, sRGB output, PCF soft shadows, horizon fog.
//
// Assets:
//   Bundled from the module Images folder (REQUIRED — the build fails if
//   either file is missing):
//     src/modules/metal-buildings/Images/env/backyard.hdr          2K/4K equirect HDRI
//     src/modules/metal-buildings/Images/textures/grass_color.jpg  grass albedo
//   Served from /public (optional — skipped silently when missing):
//     /assets/textures/grass_normal.jpg
//     /assets/textures/grass_roughness.jpg
// ═══════════════════════════════════════════════════════════

import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { GroundedSkybox } from "three/addons/objects/GroundedSkybox.js";
// Bundled from the module Images folder (see header). The JPG imports like the
// other module images (Next static image → .src); the .hdr is referenced with
// new URL(…, import.meta.url), which both webpack and Turbopack emit as a URL.
import grassColorImg from "../Images/textures/grass_color.jpg";

const BACKYARD_HDR_URL = new URL("../Images/env/backyard.hdr", import.meta.url).href;

// ─── TUNABLES (edit freely) ────────────────────────────────
// Scene units: 1 unit = 2 ft (SCALE = 0.5 in the preview), so a 30 ft
// building spans ~15 units and the camera orbits at ~20-60 units out.

// Skybox dome (GroundedSkybox): height = camera height of the panorama
// above its ground (~5 ft here). The radius is how far away the backdrop
// (fence, houses, trees) is painted — sized to the building so the backdrop
// stays in proportion: radius = building maxDim × SKYBOX_RADIUS_PER_DIM,
// clamped to [SKYBOX_MIN_RADIUS, SKYBOX_RADIUS]. While the backyard is on,
// OrbitControls' maxDistance is clamped to 0.9 × that radius.
export const SKYBOX_HEIGHT = 2.5;
export const SKYBOX_RADIUS = 250;        // maximum dome radius
export const SKYBOX_MIN_RADIUS = 30;     // minimum dome radius (~60 ft)
export const SKYBOX_RADIUS_PER_DIM = 2.5;

/** Dome radius (scene units) for a building of size maxDim. */
export function skyboxRadiusFor(maxDim) {
  const r = (Number(maxDim) || 0) * SKYBOX_RADIUS_PER_DIM;
  return Math.min(SKYBOX_RADIUS, Math.max(SKYBOX_MIN_RADIUS, r));
}

// Grass disc — reaches almost to the dome edge so it covers the dome's
// projected (stretched) panorama ground; fog blends the edge.
export const GROUND_RADIUS = SKYBOX_RADIUS - 5;
export const GRASS_REPEAT = 20;

// Lighting
export const ENV_INTENSITY = 1.0;  // HDR environment strength on the building
export const SUN_INTENSITY = 1.4;  // shadow-casting directional light

// Horizon fog — subtle; fades the grass edge into the backdrop. Near/far are
// multiples of the current dome radius (set in setSize).
export const FOG_COLOR = "#cfe0ee";
export const FOG_NEAR_K = 1.2;
export const FOG_FAR_K = 2.0;

// Backdrops
const DEFAULT_BG = "#ffffff";   // plain white — the default background
const FALLBACK_BG = "#8ec5e8";  // sky-blue until the HDR loads (env active)
const TOP_VIEW_BG = "#e9eef2";  // neutral backdrop for Top View

// Asset URLs
const HDR_URL = BACKYARD_HDR_URL;
const GRASS_COLOR_URL = grassColorImg?.src ?? grassColorImg;
const GRASS_NORMAL_URL = "/assets/textures/grass_normal.jpg";
const GRASS_ROUGHNESS_URL = "/assets/textures/grass_roughness.jpg";

// Grass sits just under the installation slab (which spans y = -0.11..+0.01)
// so the two never z-fight.
const GROUND_Y = -0.115;

// The skybox dome's flat ground sits just BELOW the grass, so the textured
// grass is the visible ground everywhere and the panorama only shows as the
// distant backdrop. (At y = 0 the dome ground hid the grass and showed the
// photo's lower half stretched across hundreds of feet — radial streaks and
// a smeared camera-stand blob under the building.)
const DOME_GROUND_Y = GROUND_Y - 0.05;

const defaultColor = new THREE.Color(DEFAULT_BG);
const fallbackColor = new THREE.Color(FALLBACK_BG);
const topViewColor = new THREE.Color(TOP_VIEW_BG);

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
  let skybox = null;
  let hdrTex = null;

  // ─── Realism settings ─────────────────────────────────────
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ─── Backdrop + horizon fog (applied by update() when active) ─
  const fog = new THREE.Fog(FOG_COLOR, SKYBOX_RADIUS * FOG_NEAR_K, SKYBOX_RADIUS * FOG_FAR_K);
  scene.background = defaultColor.clone(); // plain white until the env activates

  // ─── Grass ground (flat green now, textured when the map loads) ──
  const groundGeo = new THREE.CircleGeometry(GROUND_RADIUS, 96);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    color: "#4f9e4c",
    roughness: 0.95,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = GROUND_Y;
  ground.receiveShadow = true;
  scene.add(ground);
  disposables.push(groundGeo, groundMat);

  // Texture helper — every load is optional: a missing file keeps the
  // current look and never logs an error.
  const texLoader = new THREE.TextureLoader();
  const loadTexture = (url, onOk) =>
    texLoader.load(
      url,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        disposables.push(tex);
        onOk(tex);
      },
      undefined,
      () => {} // missing file → keep the fallback look silently
    );

  const tileTexture = (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(GRASS_REPEAT, GRASS_REPEAT);
    return tex;
  };

  loadTexture(GRASS_COLOR_URL, (tex) => {
    tileTexture(tex);
    tex.colorSpace = THREE.SRGBColorSpace; // color map only
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    groundMat.map = tex;
    groundMat.color.set("#ffffff"); // let the texture show its true colors
    groundMat.needsUpdate = true;
  });
  loadTexture(GRASS_NORMAL_URL, (tex) => {
    groundMat.normalMap = tileTexture(tex);
    groundMat.needsUpdate = true;
  });
  loadTexture(GRASS_ROUGHNESS_URL, (tex) => {
    groundMat.roughnessMap = tileTexture(tex);
    groundMat.needsUpdate = true;
  });

  // ─── HDR panorama: environment lighting + grounded skybox ─
  new RGBELoader().load(
    HDR_URL,
    (tex) => {
      if (disposed) {
        tex.dispose();
        return;
      }
      tex.mapping = THREE.EquirectangularReflectionMapping;
      disposables.push(tex);
      hdrTex = tex; // applied as scene.environment by update() when active

      buildSkybox(); // at the current (building-sized) dome radius
      update();
    },
    undefined,
    () => {} // missing/broken HDR → keep the sky-blue fallback, lights still work
  );

  // ─── Dome (re)build — sized to the building (setSize) ─────
  let domeRadius = SKYBOX_RADIUS;

  function disposeSkybox() {
    if (!skybox) return;
    scene.remove(skybox);
    skybox.geometry.dispose();
    skybox.material.dispose(); // the HDR texture is shared — not disposed here
    skybox = null;
  }

  function buildSkybox() {
    if (disposed || !hdrTex) return;
    disposeSkybox();
    try {
      skybox = new GroundedSkybox(hdrTex, SKYBOX_HEIGHT, domeRadius);
      // The dome's ground plane is `height` below its origin; raise it so
      // that plane lands at DOME_GROUND_Y (just under the grass disc).
      skybox.position.y = SKYBOX_HEIGHT + DOME_GROUND_Y;
      skybox.material.fog = false; // don't wash out the panorama with scene fog
      scene.add(skybox);
    } catch {
      skybox = null; // Dome misbehaved → update() falls back to the equirect texture.
    }
  }

  // ─── Visibility state (default vs env, 3D vs Top View) ────
  function update() {
    const domeOn = envActive && !topView;
    if (skybox) skybox.visible = domeOn;
    ground.visible = envActive;

    if (!envActive) {
      // Default background: plain white — no dome, grass, fog, or HDR lighting.
      scene.environment = prevEnvironment ?? null;
      scene.fog = prevFog ?? null;
      scene.background = defaultColor.clone();
      return;
    }

    // Photoreal environment (any non-default background).
    scene.fog = fog;
    if (hdrTex) {
      scene.environment = hdrTex;
      scene.environmentIntensity = ENV_INTENSITY;
    }
    if (topView) scene.background = topViewColor.clone();
    else if (skybox) scene.background = fallbackColor.clone(); // hidden behind the dome anyway
    else scene.background = hdrTex ?? fallbackColor.clone(); // no dome → equirect texture or sky-blue
  }

  const handle = {
    /** Top View: hide the dome, use a neutral backdrop (grass stays). */
    setTopView(value) {
      topView = !!value;
      update();
    },
    /** Photoreal env on/off — on when a non-default background is picked. */
    setActive(value) {
      envActive = !!value;
      update();
    },
    /** Size the dome (and fog band) to the building's maxDim. */
    setSize(maxDim) {
      const r = skyboxRadiusFor(maxDim);
      if (Math.abs(r - domeRadius) < 0.01) return;
      domeRadius = r;
      fog.near = r * FOG_NEAR_K;
      fog.far = r * FOG_FAR_K;
      buildSkybox();
      update();
    },
    dispose() {
      if (disposed) return;
      disposeSkybox();
      disposed = true;
      scene.remove(ground);
      if (skybox) scene.remove(skybox);
      for (const d of disposables) d.dispose?.();
      scene.environment = prevEnvironment ?? null;
      scene.fog = prevFog ?? null;
      scene.background = prevBackground ?? null;
    },
  };

  update();
  return handle;
}