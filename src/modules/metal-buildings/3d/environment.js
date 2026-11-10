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
// Assets (served from /public — create these folders and drop in files;
// the app runs with a flat-color fallback until they exist):
//   /assets/env/backyard.hdr                 2K/4K equirect HDRI
//   /assets/textures/grass_color.jpg         grass albedo (required for textured grass)
//   /assets/textures/grass_normal.jpg        optional
//   /assets/textures/grass_roughness.jpg     optional
// ═══════════════════════════════════════════════════════════

import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { GroundedSkybox } from "three/addons/objects/GroundedSkybox.js";

// ─── TUNABLES (edit freely) ────────────────────────────────
// Scene units: 1 unit = 2 ft (SCALE = 0.5 in the preview), so a 30 ft
// building spans ~15 units and the camera orbits at ~20-60 units out.

// Skybox dome (GroundedSkybox): height = camera height of the panorama
// above its ground (~5 ft here), radius must contain the camera at all
// zoom levels (OrbitControls maxDistance is clamped to SKYBOX_RADIUS * 0.9).
export const SKYBOX_HEIGHT = 2.5;
export const SKYBOX_RADIUS = 250;

// Grass disc — big enough to reach the dome base; fog blends the edge.
export const GROUND_RADIUS = 220;
export const GRASS_REPEAT = 20;

// Lighting
export const ENV_INTENSITY = 1.0;  // HDR environment strength on the building
export const SUN_INTENSITY = 1.4;  // shadow-casting directional light

// Horizon fog — subtle; fades the ground disc edge into the horizon color.
export const FOG_COLOR = "#cfe0ee";
export const FOG_NEAR = 200;
export const FOG_FAR = 320;

// Backdrops
const DEFAULT_BG = "#ffffff";   // plain white — the default background
const FALLBACK_BG = "#8ec5e8";  // sky-blue until the HDR loads (env active)
const TOP_VIEW_BG = "#e9eef2";  // neutral backdrop for Top View

// Asset URLs
const HDR_URL = "/assets/env/backyard.hdr";
const GRASS_COLOR_URL = "/assets/textures/grass_color.jpg";
const GRASS_NORMAL_URL = "/assets/textures/grass_normal.jpg";
const GRASS_ROUGHNESS_URL = "/assets/textures/grass_roughness.jpg";

// Grass sits just under the installation slab (which spans y = -0.11..+0.01)
// so the two never z-fight.
const GROUND_Y = -0.115;

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
  const fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
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

      try {
        skybox = new GroundedSkybox(tex, SKYBOX_HEIGHT, SKYBOX_RADIUS);
        // Per the three.js docs: raise by `height` so the dome's ground
        // plane lands at y = 0, level with the building and grass.
        skybox.position.y = SKYBOX_HEIGHT;
        skybox.material.fog = false; // don't wash out the panorama with scene fog
        scene.add(skybox);
        disposables.push(skybox.geometry, skybox.material);
      } catch {
        // Dome misbehaved → update() falls back to the equirect texture.
      }
      update();
    },
    undefined,
    () => {} // missing/broken HDR → keep the sky-blue fallback, lights still work
  );

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
    dispose() {
      if (disposed) return;
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