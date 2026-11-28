"use client";
// ═══════════════════════════════════════════════════════════
// BuildingPreviewV2 — Version 2 of the 3D building preview
// Forked from BuildingPreview.jsx for independent iteration.
// ═══════════════════════════════════════════════════════════

import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { createRibPanelGeometry, createRidgeCapGeometry, ribHeightAtSlopeDist, RIB_MAX_HEIGHT } from "../3d/roof/ribPanelGeometry";
import { WalkInDoor, PrehungExteriorDoor, PrehungLightDoor, SteelDoor, RollupDoor, Window, SinglePaneGridWindow, Frameout, Vent } from "../3d";
import { getStyleProfile } from "../data/styleProfiles";
import { parseOpening } from "../data/openings";
import FloorPlanSvg, { isEnclosedWall } from "../components/FloorPlanSvg";
import { buildLegendEntries } from "../components/orderForm.utils";
import "../components/orderForm.css"; // legend styles shared with the printed floor plan
import { getLeanToStorageDepthFt, isLeanToWithStorage } from "../data/leanToStorage";
import { createWallRibTexture, createWallSidingTexture, WALL_RIB_TILE } from "../3d/shared/wallRibTexture";
import { setupEnvironment, SKYBOX_RADIUS, SUN_INTENSITY, skyboxRadiusFor } from "../3d/environment";
import AppIcon from "@/shared/components/ui/AppIcon";

// ─── DEFAULT ZOOM ───────────────────────────────────────────
// The preview loads at this zoom level. In the zoom system, 100% (= Fit) is the
// "home" camera distance, so 90% pulls the camera back slightly for margin. Used by
// both the initial camera framing and ViewerControlBridge's baseDist reference.
const DEFAULT_ZOOM = 0.9;
// Auto-fit: 100% zoom frames the building's bounding sphere (footprint incl.
// lean-tos/extensions × roof peak) in the narrower of the vertical/horizontal
// FOV, times this factor (< 1 = tighter, since a sphere overestimates a box).
const FIT_MARGIN = 0.9;

// ═══════════════════════════════════════════════════════════
// PARAMETRIC METAL BUILDING — ONE ENGINE, STYLE RULES
//
// Architecture:
//   Building
//   ├── Structure (FrameSystem)
//   │   ├── Portal Frames (repeated along length)
//   │   │   ├── Left Column   (MAIN_TUBE)
//   │   │   ├── Right Column  (MAIN_TUBE)
//   │   │   ├── Rafters       (MAIN_TUBE)
//   │   │   ├── Haunch Braces  (SECONDARY_TUBE, corner braces at eaves)
//   │   │   └── Truss Web     (BRACE_TUBE, truss style only)
//   │   ├── Eave Struts   (SECONDARY_TUBE, along length)
//   │   ├── Base Rails    (SECONDARY_TUBE, along length)
//   │   └── Ridge Beam    (SECONDARY_TUBE, peaked styles)
//   ├── Roof (RoofSystem)
//   │   ├── Left slope  (ONE continuous surface)
//   │   ├── Right slope (ONE continuous surface)
//   │   └── Ridge Cap   (optional per style)
//   ├── Trim (TrimSystem)
//   │   ├── Gable rake edges
//   │   └── Eave edge lines
//   ├── Walls (WallPanels)
//   │   ├── Side Walls (one panel per side)
//   │   └── End Walls  (pentagon / gable shape)
//   └── Extras (LeanToSystem, WallOpenings)
// ═══════════════════════════════════════════════════════════

const SCALE = 0.5;            // 1 scene unit = 2 feet
const BAY_SPACING_FT = 5;     // structural bay spacing (real feet)
// Wainscot (two-tone lower wall band) height — fixed 3 ft regardless of building
// height (clamped to 90% of the wall so very short walls never split at the top).
const WAINSCOT_FT = 3;
const wainscotSplit = (wallH) => Math.min(WAINSCOT_FT * SCALE, wallH * 0.9);

// ─── THICKNESS HIERARCHY ──────────────────────────────────
// Main frame (posts, rafters) > secondary (eave struts, base rails) > braces
// At SCALE 0.5: a 4" real tube = 0.167 scene units
const MAIN_TUBE = 0.16;       // columns + rafters — bold, load-bearing
const SECONDARY_TUBE = 0.09;  // eave struts, base rails, ridge beam
const BRACE_TUBE = 0.06;      // knee braces, truss web members
const BASE_RAIL_TUBE = 0.2;   // footer channel at the building's foot
const STEEL_COLOR = "#f5f5f5";
const TRIM_COLOR = "#C89B68";

// ─── VIEW ORIENTATION ──────────────────────────────────────
// Building space keeps left = −x / right = +x / front = −z. The default camera
// looks at the FRONT from the front-left corner (toward +z), where −x would
// appear on the viewer's RIGHT. The building group is mirrored on X so Left
// shows on the viewer's left (as when standing in front of the building).
// World-space helpers (camera presets, captures, drag rays) apply MIRROR_X.
const MIRROR_X = -1;
const MIRROR_MATRIX = new THREE.Matrix4().makeScale(MIRROR_X, 1, 1);

// Wall siding finish — matte painted steel (reference look): low metalness
// keeps the full diffuse light (lighter walls), high roughness spreads it
// evenly across the panel. The groove texture itself is unchanged.
const WALL_MAT = { roughness: 0.85, metalness: 0.04, envMapIntensity: 0.6 };
const PANEL_WIDTH = 1.5 * SCALE; // one texture tile = ~3ft real panel width
// Enclosed-wall siding rib texture + pitch constants live in the shared
// 3d/shared/wallRibTexture module (also used by the wall-matched door slabs).
const LEANTO_TUBE = 0.065;       // lean-to columns — lighter than secondary
const LEANTO_DROP = 0.50;        // lean-to roof starts ~1ft below main eave (scene units)
const LEANTO_OVERHANG = 0.06;    // minimal drip edge past outer columns (~1.5" real)

// ─── FLAT PURLIN STRAPS ────────────────────────────────────
// Purlins are flat straps (wide face against the roof skin), not square tubes —
// the roof reads as resting on the frame instead of floating above it.
const STRAP_W = 0.12;  // strap width across the roof slope
const STRAP_T = 0.02;  // strap thickness (wide face against the roof skin)
// Perpendicular distance from the nominal rafter line to the roof skin's
// underside: the skin rests on the straps, which rest on the top chord
// (MAIN_TUBE, or SECONDARY_TUBE top chord for lattice-truss styles).
function roofStack(preset, strapsVisible = true) {
  const chordHalf = preset.hasLatticeColumns ? SECONDARY_TUBE / 2 : MAIN_TUBE / 2;
  return chordHalf + (strapsVisible ? STRAP_T : 0) + 0.012;
}

// ─── STYLE PRESETS — delegated to unified style profiles ──
// getPreset returns the rendering rules for a given roofStyle key.
function getPreset(roofStyle) {
  return getStyleProfile(roofStyle).rendering;
}

// ─── PANEL TEXTURE GENERATOR ──────────────────────────────
// Creates a canvas texture with subtle panel seam lines.
// Direction: "vertical" for walls, "horizontal" for roof panels along length.

function createPanelTexture(baseColor, direction = "vertical", lineSpacing = 24) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Fill base color — clean, solid
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Standing-seam rib effect — alternating light/dark to simulate raised panels
  const ribCount = Math.floor(size / lineSpacing);
  for (let i = 0; i < ribCount; i++) {
    const stripStart = i * lineSpacing;
    // Left shadow edge of rib
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(
      direction === "vertical" ? stripStart : 0,
      direction === "vertical" ? 0 : stripStart,
      direction === "vertical" ? 2 : size,
      direction === "vertical" ? size : 2
    );
    // Center highlight of panel (subtle convex look)
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(
      direction === "vertical" ? stripStart + lineSpacing * 0.25 : 0,
      direction === "vertical" ? 0 : stripStart + lineSpacing * 0.25,
      direction === "vertical" ? lineSpacing * 0.5 : size,
      direction === "vertical" ? size : lineSpacing * 0.5
    );
    // Right highlight edge of rib (light catches edge)
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(
      direction === "vertical" ? stripStart + lineSpacing - 2 : 0,
      direction === "vertical" ? 0 : stripStart + lineSpacing - 2,
      direction === "vertical" ? 2 : size,
      direction === "vertical" ? size : 2
    );
  }

  // Panel seam lines — bold dark grooves
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 3;
  if (direction === "vertical") {
    for (let x = 0; x < size; x += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
  } else {
    for (let y = 0; y < size; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─── GRID: THE BACKBONE ───────────────────────────────────
// Pure function. Single source of truth. Everything derives from this.
//
// Mono-slope mode (Free Standing Lean To): frontHeightFt != null switches the
// roof to ONE plane from the tall "Back" eave (x = -halfW, height) down to the
// short "Front" eave (x = +halfW, frontHeight). The eave-to-eave drop replaces
// the peaked styles' ridge rise.

function computeGrid(width, length, height, pitch, overhangFt, frontHeightFt = null) {
  const w = width * SCALE;
  const l = length * SCALE;
  const h = height * SCALE;
  const halfW = w / 2;

  // Mono-slope (Free Standing Lean To): h stays the tall "Back" eave; hLow is
  // the short "Front" eave. Clamped so the plane always keeps a visible drop.
  const monoSlope = frontHeightFt != null;
  const hLow = monoSlope ? Math.min(Math.max(frontHeightFt, 1), height - 0.5) * SCALE : h;

  // Roof rise: peaked styles rise halfW×pitch to the ridge; mono-slope drops
  // from the tall "Back" eave (h) to the short "Front" eave (hLow).
  const roofPeak = monoSlope ? h - hLow : halfW * pitch;
  const overhang = overhangFt * SCALE;

  // Bay grid — posts, rafters, wall panels all snap to this
  const baySpacing = BAY_SPACING_FT * SCALE;
  const bayCount = Math.max(1, Math.round(l / baySpacing));
  const bay = l / bayCount; // actual bay spacing (may differ slightly from target)

  // Bay Z positions (each bay line along the length)
  const bayPositions = [];
  for (let i = 0; i <= bayCount; i++) bayPositions.push(-l / 2 + bay * i);

  // Slope geometry — run is the half-span on peaked styles and the full span
  // on mono-slope (the single plane crosses the whole width).
  const run = monoSlope ? w : halfW;
  const slopeLen = Math.sqrt(run * run + roofPeak * roofPeak);
  const slopeDirX = run / slopeLen;
  const slopeDirY = roofPeak / slopeLen;

  // Overhang extends along slope direction (eave sides only)
  const ovEX = overhang * slopeDirX;
  const ovEY = overhang * slopeDirY;

  // Camera / lights — mono-slope's tallest point is the tall eave itself
  const maxDim = Math.max(w, l, monoSlope ? h : h + roofPeak);

  return {
    w, l, h, halfW, roofPeak, overhang,
    ovEX, ovEY, slopeLen, slopeDirX, slopeDirY,
    bayCount, bay, bayPositions,
    monoSlope, hLow,
    maxDim,
  };
}

// ─── MAIN COMPONENT ───────────────────────────────────────

export default function BuildingPreview({
  width = 12, length = 20, height = 6,
  // Front (short) eave height for mono-slope styles (Free Standing Lean To).
  // null → derived from roof pitch (or a 2ft drop below `height`).
  frontHeight = null,
  roofStyle = "regular", roofPitch = null, defaultRoofPitch = 0.25,
  roofOverhang = 0, walls = {}, highlightedWall = null,
  sidingDirection = "horizontal",
  // Per-wall siding seam direction override (custom wall rows): map of
  // "front"|"back"|"left"|"right" → "horizontal"|"vertical". Missing entries
  // fall back to the global sidingDirection.
  wallSiding = {},
  // Roof panel install direction (Roofing selection): "horizontal" renders
  // the roof grooves horizontally (ribs along the building length),
  // "vertical" keeps the ribs running down the slope (default).
  roofPanelDir = "vertical",
  roofColor = "#cc0000", wallColor = "#e0e0e0", twoToneColor = null, trimColor = TRIM_COLOR, storage = null,
  leantos = [], openings = {},
  // Rain gutters — driven by the configurator's Gutters / Rain Gutters /
  // Number of Downspouts selections: "none" | "left" | "right" | "both".
  gutters = "none", downspoutCount = 0,
  installationSurface = "Concrete",
  // Roof extension beyond the enclosed back end (+Z) — open covered area
  // carried by outer posts (Loafing Shed).
  roofExtension = 0,
  onCaptureReady = null,
  // Opening interaction (ConfiguratorViewV1): drag-to-move + selection for
  // dimension callouts. Omitted → openings render statically (V2 unchanged).
  onMoveOpening = null, onSelectOpening = null, selectedOpening = null,
  // Doors & Windows wall picking: { section, wall } descriptors.
  onWallSelect = null, selectedWall = null,
}) {
  const pitch = roofPitch != null ? roofPitch : defaultRoofPitch;
  // Roof groove direction — only "horizontal" flips the ribs; anything else
  // keeps the default vertical (ribs down the slope) rendering.
  const roofDir = roofPanelDir === "horizontal" ? "horizontal" : "vertical";
  // Mono-slope styles carry their slope in the two eave heights, not the pitch.
  // When no explicit front height arrives, derive it: full-width run at the
  // roof pitch (12' @ 2/12 → 2' drop — the reference 9×7), floor 4ft.
  const isMonoSlopeStyle = !!getPreset(roofStyle).monoSlope;
  // Styles with a fixed mono-slope (Loafing Shed 3/12) use it in place of the
  // roof-pitch selection, which those styles hide.
  const monoSlopePitch = getPreset(roofStyle).monoSlopePitch ?? null;
  const frontHeightFt = useMemo(() => {
    if (!isMonoSlopeStyle) return null;
    if (frontHeight != null) return frontHeight;
    return Math.max(4, height - width * (monoSlopePitch ?? pitch));
  }, [isMonoSlopeStyle, frontHeight, height, width, pitch, monoSlopePitch]);
  const grid = useMemo(
    () => computeGrid(width, length, height, pitch, roofOverhang, frontHeightFt),
    [width, length, height, pitch, roofOverhang, frontHeightFt]
  );

  const { w, l, h } = grid;
  // Roof extension (feet, from the configurator's Roof Extension choice).
  // Default: open bay beyond the enclosed back end (+Z) on outer posts.
  // rendering.roofExtensionSide === "tall" (Loafing Shed): an awning off the
  // tall (-X) side instead — footprint/camera grow on -X, not +Z.
  const roofExtOnTall = getPreset(roofStyle).roofExtensionSide === "tall";
  const roofExt = roofExtension * SCALE;
  const roofExtBack = roofExtOnTall ? 0 : roofExt;
  const roofExtSide = roofExtOnTall ? roofExt : 0;

  // ─── STEP DOWN BARN — left/right sections are real lean-tos ──
  // They arrive through the regular `leantos` pipeline (the configurator
  // auto-adds them from the style profile's defaultLeantos hints) and render
  // through LeanToSystem like any other lean-to. The stepDown spec is only
  // consulted here for the center-wall siding look.
  const isStepDown = !!getPreset(roofStyle).stepDown;
  // ---- CENTER STORAGE -- one wall becomes the storage's clad outer wall ----
  // FrameSystem must see that wall as clad (members behind cladding hidden),
  // while WallPanels must skip it (StorageSystem owns its cladding).
  const storageLoc = storageWorldSide(storage?.location);
  const storageActive = !!storageLoc && storageLoc !== "none" && Number(storage?.depthFt) > 0;
  const frameWalls = useMemo(
    () => (storageActive ? { ...walls, [storageLoc]: true } : walls),
    [walls, storageActive, storageLoc]
  );
  const panelWalls = useMemo(
    () => (storageActive ? { ...walls, [storageLoc]: false } : walls),
    [walls, storageActive, storageLoc]
  );
  // WallPanels only: an end wall with a front/back lean-to always closes its
  // gable triangle (the lean-to's fascia only covers attach → eave). Open →
  // "gable"; a "top_N" strip → "ext_gable_N"; clad/gable ends unchanged.
  const cladWalls = useMemo(() => {
    let next = panelWalls;
    for (const side of ["front", "back"]) {
      if (storageActive && storageLoc === side) continue;
      if (!(leantos ?? []).some((lt) => lt?.side_key === side)) continue;
      const v = panelWalls[side];
      let upgraded = null;
      if (!v || v === "open") upgraded = "gable";
      else if (typeof v === "string" && v.startsWith("top_")) upgraded = `ext_gable_${v.slice("top_".length)}`;
      if (upgraded) next = { ...next, [side]: upgraded };
    }
    return next;
  }, [panelWalls, leantos, storageActive, storageLoc]);
  // Ends closed above a lean-to use the ribbed (horizontal) wall siding so the
  // gable matches the lean-to's fascia below it.
  const ribEnds = useMemo(() => ({
    front: cladWalls.front !== panelWalls.front,
    back: cladWalls.back !== panelWalls.back,
  }), [cladWalls, panelWalls]);
  const allLeantos = leantos;
  // Total footprint: center width + side lean-tos (camera framing / floor)
  const leantoTotalW = allLeantos
    .filter((lt) => lt.side_key === "left" || lt.side_key === "right")
    .reduce((sum, lt) => sum + (lt.width_ft || 0) * SCALE, 0);
  // Building footprint bounds (center building + lean-to projections) — used
  // by the installation-surface slab so it hugs the true footprint.
  const footprint = useMemo(() => {
    let minX = -w / 2 - roofExtSide, maxX = w / 2, minZ = -l / 2, maxZ = l / 2 + roofExtBack;
    for (const lt of allLeantos) {
      const proj = (lt.width_ft || 0) * SCALE;
      if (lt.side_key === "left") minX -= proj;
      else if (lt.side_key === "right") maxX += proj;
      else if (lt.side_key === "front") minZ -= proj;
      else if (lt.side_key === "back") maxZ += proj;
    }
    return { minX, maxX, minZ, maxZ };
  }, [allLeantos, w, l, roofExtBack, roofExtSide]);
  // True building center (footprint center) — the orbit pivot, so rotation
  // always revolves around the building even with one-sided lean-tos.
  const center = useMemo(
    () => ({ x: (footprint.minX + footprint.maxX) / 2, z: (footprint.minZ + footprint.maxZ) / 2 }),
    [footprint]
  );
  const maxDim = Math.max(grid.maxDim, w + leantoTotalW + roofExtSide, l + roofExtBack);
  const camDist = maxDim * 1.3;
  const shadowSize = maxDim * 1.5;
  // Default camera framing — the "home" (front-left) direction pulled back to
  // DEFAULT_ZOOM (90%) for slight margin. Scaling is done around the orbit target
  // so "Fit" (100%) lands exactly on the home distance along the same direction.
  // World (mirrored) center / footprint for the camera, orbit target and the
  // floor watermark (which stays outside the mirrored building group).
  const viewCenter = { x: MIRROR_X * center.x, z: center.z };
  const viewFootprint = MIRROR_X < 0
    ? { ...footprint, minX: -footprint.maxX, maxX: -footprint.minX }
    : footprint;
  const homeDir = [-camDist * 0.64, h * 0.68, -camDist * 0.77];
  const camTarget = [viewCenter.x, h / 2, viewCenter.z];
  const defaultCamPos = camTarget.map((t, i) => t + (homeDir[i] - t) / DEFAULT_ZOOM);
  // Auto-fit box — whole footprint (center + lean-tos + roof extensions) and
  // the roof-peak height. ViewerControlBridge sizes the home distance from it.
  const fitBox = useMemo(() => ({
    sizeX: footprint.maxX - footprint.minX,
    sizeY: grid.monoSlope ? h : h + (grid.roofPeak || 0),
    sizeZ: footprint.maxZ - footprint.minZ,
  }), [footprint, grid.monoSlope, grid.roofPeak, h]);
  // Order Form captures: the whole building's WORLD box (mirrored on X like
  // the scene) — footprint incl. lean-tos / roof extensions, up to the peak.
  const captureBounds = useMemo(() => {
    const xs = MIRROR_X < 0
      ? { minX: -footprint.maxX, maxX: -footprint.minX }
      : { minX: footprint.minX, maxX: footprint.maxX };
    return { ...xs, minZ: footprint.minZ, maxZ: footprint.maxZ, maxY: fitBox.sizeY };
  }, [footprint, fitBox.sizeY]);

  // ─── VIEWER TOOLBAR plumbing ──────────────────────────────
  // apiRef: camera operations exposed by ViewerControlBridge (inside Canvas).
  // hist: recorded camera snapshots (after each user navigation) so the
  // toolbar's undo/redo flyout can walk back and forth through views.
  const apiRef = useRef(null);
  // Shared bridge to the Top View floor plan's zoom (populated by
  // TopViewFloorPlan) — non-null only while the floor-plan overlay is
  // mounted, so the viewer's zoom UI routes to the plan in Top View.
  const planApiRef = useRef(null);
  const histRef = useRef({ stack: [], index: -1 });
  const [hist, setHist] = useState({ stack: [], index: -1 });
  // Display toggles consumed by the scene (shadows / labels / watermark) and
  // OrbitControls (auto-rotate).
  const [display, setDisplay] = useState({
    background: "default",
    shadows: false,
    labels: false,
    watermark: true,
    autoRotate: false,
    autoRotateSpeed: 1.5,
  });
  // View-mode toggle (3D / Top View) — top-left of the viewport (reference
  // design). Tracks which camera mode the segmented control is showing.
  const [viewMode, setViewMode] = useState("3d"); // "3d" | "top"
  // Return to the default (home) view when a lean-to / wall focus ends
  // (highlightedWall goes from a value to null): switching tab, back to
  // Center, removing or collapsing the lean-to. Skipped in Top View.
  const prevHighlightRef = useRef(highlightedWall);
  useEffect(() => {
    const prev = prevHighlightRef.current;
    prevHighlightRef.current = highlightedWall;
    if (prev && !highlightedWall && viewMode !== "top") {
      apiRef.current?.setView?.("home");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react only to focus changes
  }, [highlightedWall]);
  // Top-down camera snapshot for the toggle — positioned over the true
  // footprint center so asymmetric lean-tos stay centered in the top view.
  const topViewSnapshot = useCallback(() => ({
    position: [center.x, maxDim * 1.5, center.z + 0.05],
    target: [center.x, h / 2, center.z],
  }), [center, maxDim, h]);

  const handleNavSnapshot = useCallback((snap) => {
    const h = histRef.current;
    const stack = h.stack.slice(0, h.index + 1);
    stack.push(snap);
    const trimmed = stack.length > 30 ? stack.slice(stack.length - 30) : stack;
    histRef.current = { stack: trimmed, index: trimmed.length - 1 };
    setHist(histRef.current);
  }, []);

  const jumpToView = useCallback((i) => {
    const h = histRef.current;
    if (i < 0 || i >= h.stack.length) return;
    apiRef.current?.applyView(h.stack[i]);
    histRef.current = { ...h, index: i };
    setHist(histRef.current);
  }, []);
  const undoView = useCallback(() => jumpToView(histRef.current.index - 1), [jumpToView]);
  const redoView = useCallback(() => jumpToView(histRef.current.index + 1), [jumpToView]);

  // Clear the selected opening when clicking empty space — but not right after
  // a drag ends over empty space (pointer capture makes that look like a miss).
  const handleCanvasMissed = useCallback(() => {
    if (performance.now() - lastOpeningDragEnd > 350) onSelectOpening?.(null, null);
  }, [onSelectOpening]);

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 400, background: "var(--psb-bg)", position: "relative" }}>
      <Canvas camera={{ position: defaultCamPos, fov: 50, near: 0.25, far: 1000 }} shadows gl={{ preserveDrawingBuffer: true }} onPointerMissed={handleCanvasMissed}>
        <ambientLight intensity={0.85} />
        {/* Soft neutral fill lifts shaded siding without adding hard shadows
            or changing the selected wall, roof, and trim colors. */}
        <hemisphereLight color="#ffffff" groundColor="#e5e5e5" intensity={0.65} />
        <directionalLight
          position={[maxDim * 0.8, maxDim * 1.2, maxDim * 0.6]}
          intensity={SUN_INTENSITY} castShadow={display.shadows}
          shadow-normalBias={0.04} shadow-bias={-0.0002}
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-left={-shadowSize} shadow-camera-right={shadowSize}
          shadow-camera-top={shadowSize} shadow-camera-bottom={-shadowSize}
          shadow-camera-near={0.1} shadow-camera-far={maxDim * 4}
        />
        <directionalLight position={[-maxDim * 0.5, maxDim * 0.6, -maxDim * 0.4]} intensity={0.6} />
        {/* Balance the side opposite the +X key light so its siding does not
            appear dark beside the front wall. No additional cast shadows. */}
        <directionalLight position={[-maxDim, maxDim * 0.7, 0]} intensity={1.5} />
        {/* NOTE: intentionally NO zoomToCursor — it drifts the orbit target
            toward the cursor, making rotation pivot around arbitrary points
            (e.g. a corner) instead of the building center. */}
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={Math.max(1, maxDim * 0.15)}
          maxDistance={Math.min(maxDim * 6, (display.background === "backyard" ? skyboxRadiusFor(maxDim) : SKYBOX_RADIUS) * 0.9)}
          zoomSpeed={1.2}
          maxPolarAngle={Math.PI * 0.85} minPolarAngle={0.1}
          target={[viewCenter.x, h / 2, viewCenter.z]}
          autoRotate={display.autoRotate}
          autoRotateSpeed={display.autoRotateSpeed}
        />
        <CameraController highlightedWall={highlightedWall} grid={grid} maxDim={maxDim} storage={storage} leantos={allLeantos} />
        {/* SceneEnvironment owns scene.background: Backyard = photoreal env;
            other presets = solid color / gradient backdrop; Default = white. */}
        <SceneEnvironment topView={viewMode === "top"} active={display.background === "backyard"}
          presetId={display.background || "default"} maxDim={maxDim} />
        <ViewerControlBridge apiRef={apiRef} planApiRef={planApiRef} onNavSnapshot={handleNavSnapshot} maxDim={maxDim} grid={grid} center={viewCenter}
          fitBox={fitBox} autoFit={viewMode !== "top" && !highlightedWall} />

        {/* Building (mirrored on X — see MIRROR_X): Left shows on the viewer's left. */}
        <group scale={[MIRROR_X, 1, 1]}>
        <InstallationSurface footprint={footprint} surface={installationSurface} />
        {grid.monoSlope ? (
          /* Free Standing Lean To — standalone mono-slope shelter */
          <MonoSlopeBuilding grid={grid} roofStyle={roofStyle} trimColor={trimColor} roofColor={roofColor} wallColor={wallColor} twoToneColor={twoToneColor} walls={panelWalls} sidingDirection={sidingDirection} wallSiding={wallSiding} roofDir={roofDir} roofExtension={roofExtension} />
        ) : (
          <>
            <FrameSystem grid={grid} roofStyle={roofStyle} walls={frameWalls} openings={openings} />
            <RoofSystem grid={grid} roofColor={roofColor} roofStyle={roofStyle} walls={walls} roofDir={roofDir} />
            <WallPanels grid={grid} walls={cladWalls} ribEnds={ribEnds} wallColor={wallColor} twoToneColor={twoToneColor} sidingDirection={sidingDirection} wallSiding={wallSiding} verticalSiding={isStepDown} openings={openings} />
            <TrimSystem grid={grid} roofStyle={roofStyle} trimColor={trimColor} />
          </>
        )}
        <StorageSystem grid={grid} storage={storage} walls={walls} wallColor={wallColor} twoToneColor={twoToneColor} sidingDirection={sidingDirection} verticalSiding={isStepDown} onWallSelect={onWallSelect} selectedWall={selectedWall} onMoveOpening={onMoveOpening} onSelectOpening={onSelectOpening} selectedOpening={selectedOpening} />
        {(onWallSelect || selectedWall) && <CenterWallSelection grid={grid} walls={panelWalls} onSelect={onWallSelect} selectedWall={selectedWall} />}
        <GutterSystem grid={grid} roofStyle={roofStyle} walls={walls} sides={gutters} downspouts={downspoutCount} />
        <WallOpenings grid={grid} openings={openings} wallColor={wallColor} onMoveOpening={onMoveOpening} onSelectOpening={onSelectOpening} selectedOpening={selectedOpening} />
        {allLeantos.map((lt, i) => (
          <LeanToSystem key={`lt-${i}`} grid={grid} leanto={lt} hostWall={walls[lt.side_key]} roofColor={roofColor} wallColor={wallColor} trimColor={trimColor} siblingLeantos={allLeantos} roofOverhang={roofOverhang} roofDir={lt.roofPanelDir || roofDir} onWallSelect={onWallSelect} selectedWall={selectedWall} />
        ))}
        {display.labels && <WallLabels grid={grid} />}
        </group>
        {/* Outside the mirror so the logo text reads correctly. */}
        {display.watermark && <FloorWatermark footprint={viewFootprint} maxDim={maxDim} />}
        <ViewCaptureBridge onCaptureReady={onCaptureReady} grid={grid} maxDim={maxDim} bounds={captureBounds} />
      </Canvas>

      {/* Top View — flat floor-plan overlay (idea-room mock) covering the
          viewport while the Top View toggle is active. */}
      {viewMode === "top" && (
        <TopViewFloorPlan
          grid={grid}
          walls={walls}
          openings={openings}
          leantos={allLeantos}
          apiRef={planApiRef}
          watermark={display.watermark}
        />
      )}

      {/* Floating viewer toolbar with flowing flyout panels */}
      <ViewerToolbar
        apiRef={apiRef}
        hist={hist}
        onUndo={undoView}
        onRedo={redoView}
        onJump={jumpToView}
        display={display}
        setDisplay={setDisplay}
        onViewModeChange={setViewMode}
      />

      {/* Top-left 3D / Top View segmented toggle (reference design) */}
      <ViewModeToggle
        apiRef={apiRef}
        mode={viewMode}
        onModeChange={setViewMode}
        topView={topViewSnapshot}
      />
    </div>
  );
}

// ─── VIEW CAPTURE — Order Form building images ──────────────
// Registers captureViews() (via onCaptureReady) that snapshots the 3D model
// from fixed angles for the printed Order Form's Building Images page.
// Wall orientation: front = -z, back = +z, left = -x, right = +x.

// Captured views: the building may fill this fraction of the frame on its
// tighter axis; CAPTURE_PAD (scene units) is added around the footprint for
// roof overhangs / trims.
const CAPTURE_FILL = 0.9;
const CAPTURE_PAD = 0.25;

function ViewCaptureBridge({ onCaptureReady, grid, maxDim, bounds = null }) {
  const { camera, gl, scene } = useThree();

  useEffect(() => {
    if (!onCaptureReady) return;

    const captureViews = () => {
      const { h } = grid;
      const b = bounds ?? { minX: -maxDim / 2, maxX: maxDim / 2, minZ: -maxDim / 2, maxZ: maxDim / 2, maxY: h };
      const minX = b.minX - CAPTURE_PAD, maxX = b.maxX + CAPTURE_PAD;
      const minZ = b.minZ - CAPTURE_PAD, maxZ = b.maxZ + CAPTURE_PAD;
      const maxY = b.maxY + CAPTURE_PAD * 0.5;
      // Aim at the center of the whole building box (not the main building).
      const lookTarget = new THREE.Vector3((minX + maxX) / 2, maxY / 2, (minZ + maxZ) / 2);
      const corners = [];
      for (const x of [minX, maxX]) for (const y of [0, maxY]) for (const z of [minZ, maxZ]) corners.push(new THREE.Vector3(x, y, z));
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 50) / 2) * CAPTURE_FILL;
      const tanH = tanV * (camera.aspect || 1);
      const worldUp = new THREE.Vector3(0, 1, 0);
      // Smallest camera distance along `dirArr` (target → camera) that keeps
      // every box corner inside the frame: depth = D − r·dir must satisfy
      // |r·right| ≤ tanH·depth and |r·up| ≤ tanV·depth.
      const fitPosition = (dirArr) => {
        const dir = new THREE.Vector3(dirArr[0], dirArr[1], dirArr[2]).normalize();
        const forward = dir.clone().negate();
        const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        let dist = maxDim * 0.5;
        for (const c of corners) {
          const r = c.clone().sub(lookTarget);
          const along = r.dot(dir);
          dist = Math.max(dist, along + Math.abs(r.dot(right)) / tanH, along + Math.abs(r.dot(up)) / tanV);
        }
        return lookTarget.clone().addScaledVector(dir, dist);
      };
      // Same angles as before (front = -z, back = +z, left/right mirrored).
      const views = [
        { caption: "Perspective View", dir: [0.9, 0.7, 0.8] },
        { caption: "Front", dir: [0, 0.5, -1] },
        { caption: "Left Side", dir: [MIRROR_X * -1, 0.5, 0] },
        { caption: "Right Side", dir: [MIRROR_X * 1, 0.5, 0] },
        { caption: "Back", dir: [0, 0.5, 1] },
      ];

      const originalPosition = camera.position.clone();
      const originalQuaternion = camera.quaternion.clone();
      const captured = [];
      try {
        for (const view of views) {
          camera.position.copy(fitPosition(view.dir));
          camera.lookAt(lookTarget);
          camera.updateProjectionMatrix();
          gl.render(scene, camera);
          captured.push({ caption: view.caption, image: gl.domElement.toDataURL("image/png") });
        }
      } finally {
        // Restore the user's camera.
        camera.position.copy(originalPosition);
        camera.quaternion.copy(originalQuaternion);
        camera.updateProjectionMatrix();
        gl.render(scene, camera);
      }
      return captured;
    };

    onCaptureReady(captureViews);
  }, [onCaptureReady, camera, gl, scene, grid, maxDim, bounds]);

  return null;
}

// ─── WALL LABELS (Front / Back / Left / Right indicators) ──

function WallLabels({ grid }) {
  const { l, h, halfW } = grid;
  const labelStyle = {
    background: "rgba(0,0,0,0.)",
    color: "#fff",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 8,
    fontWeight: 400,
    whiteSpace: "nowrap",
    userSelect: "none",
    pointerEvents: "none",
  };
  return (
    <group>
      <Html position={[0, 0.05, -l / 2 - 0.3]} center style={labelStyle} distanceFactor={4}>Front</Html>
      <Html position={[0, 0.05, l / 2 + 0.3]} center style={labelStyle} distanceFactor={8}>Back</Html>
      <Html position={[-halfW - 0.3, 0.05, 0]} center style={labelStyle} distanceFactor={8}>Left</Html>
      <Html position={[halfW + 0.3, 0.05, 0]} center style={labelStyle} distanceFactor={8}>Right</Html>
    </group>
  );
}

// ─── FLOOR WATERMARK (Premium Steel Buildings logo on the ground) ──
// public/images/psb_logo_title.png — also used by the Top View floor plan.
const WATERMARK_LOGO_URL = "/images/psb_logo_title.png";

// Logo → soft gray watermark texture: white/light pixels become see-through
// and dark pixels gray (alpha from luminance), so it reads on any background
// with no white box (reference look). Resolves { texture, aspect } or null.
function useWatermarkLogoTexture(url) {
  const [logo, setLogo] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let tex = null;
    const img = new Image();
    img.onload = () => {
      if (cancelled || !img.naturalWidth || !img.naturalHeight) return;
      const cw = img.naturalWidth;
      const ch = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, cw, ch);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const lum = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
        const a = (1 - lum) * (px[i + 3] / 255);
        px[i] = 90;
        px[i + 1] = 90;
        px[i + 2] = 90;
        px[i + 3] = Math.round(Math.min(1, a * 1.6) * 255);
      }
      ctx.putImageData(data, 0, 0);
      tex = new THREE.CanvasTexture(canvas);
      tex.anisotropy = 8;
      setLogo({ texture: tex, aspect: ch / cw });
    };
    img.src = url;
    return () => {
      cancelled = true;
      tex?.dispose();
    };
  }, [url]);
  return logo;
}

// Four faded logos on the ground just outside the installation slab, one
// per side, each readable from its own side. Placed from the true footprint
// (lean-tos and roof extensions included) so they never sit on the slab.
function FloorWatermark({ footprint, maxDim }) {
  const logo = useWatermarkLogoTexture(WATERMARK_LOGO_URL);
  if (!logo) return null;

  const { minX, maxX, minZ, maxZ } = footprint;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const planeW = maxDim * 0.28;
  const planeH = planeW * logo.aspect;
  // Slab allowance + small gap + half the logo depth.
  const offset = SURFACE_ALLOWANCE_FT * SCALE + maxDim * 0.04 + planeH / 2;
  const y = 0.02;
  const mat = <meshBasicMaterial map={logo.texture} transparent opacity={0.55} depthWrite={false} />;

  return (
    <group>
      {/* Front — readable from front (looking at building from -Z) */}
      <mesh position={[cx, y, minZ - offset]} rotation={[-Math.PI / 2, 0, Math.PI]}>
        <planeGeometry args={[planeW, planeH]} />
        {mat}
      </mesh>
      {/* Back — readable from back (looking at building from +Z) */}
      <mesh position={[cx, y, maxZ + offset]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[planeW, planeH]} />
        {mat}
      </mesh>
      {/* Left — readable from left (looking at building from -X) */}
      <mesh position={[minX - offset, y, cz]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
        <planeGeometry args={[planeW, planeH]} />
        {mat}
      </mesh>
      {/* Right — readable from right (looking at building from +X) */}
      <mesh position={[maxX + offset, y, cz]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[planeW, planeH]} />
        {mat}
      </mesh>
    </group>
  );
}

// ─── INSTALLATION SURFACE (footprint slab) ─────────────────
// Renders the selected Installation Surface (Concrete / Dirt / Asphalt /
// Gravel) as a textured slab that hugs the building footprint plus a visible
// installation allowance on every side — the scene background stays bare (no
// full ground plane). Textures are procedural (canvas) so the scene updates
// live as the user switches surface type.

// Installation allowance: how far the surface slab extends beyond the
// building footprint on each side (feet).
const SURFACE_ALLOWANCE_FT = 1.5;

const SURFACE_STYLES = {
  concrete: { base: "#b3b3ad", mottle: ["#a4a49d", "#c0c0ba", "#9b9b94"], speckle: ["#8f8f88", "#c9c9c3"], speckleAlpha: 0.18 },
  dirt:     { base: "#8a6b4a", mottle: ["#6f5236", "#a0825c", "#7d5c3d"], speckle: ["#5f452c", "#b08d63"], speckleAlpha: 0.3 },
  asphalt:  { base: "#3c3f42", mottle: ["#2e3134", "#55595d", "#474b4e"], speckle: ["#26282b", "#6a6e72"], speckleAlpha: 0.28 },
  gravel:   { base: "#b09a76", mottle: ["#8f7a58", "#c7b492", "#6f5f45"], speckle: ["#6f5f45", "#d3c3a4", "#8f7a58", "#e0d2b8"], speckleAlpha: 0.5 },
};

function resolveSurfaceStyle(name) {
  const n = String(name ?? "").toLowerCase();
  if (/dirt|soil|earth/.test(n)) return SURFACE_STYLES.dirt;
  if (/asphalt|blacktop|pavement/.test(n)) return SURFACE_STYLES.asphalt;
  if (/gravel|stone|crush/.test(n)) return SURFACE_STYLES.gravel;
  return SURFACE_STYLES.concrete;
}

function makeSurfaceTexture({ base, mottle, speckle, speckleAlpha }, size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Soft cloudy mottling (large, very translucent patches)
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = mottle[i % mottle.length];
    ctx.globalAlpha = 0.05 + Math.random() * 0.07;
    ctx.beginPath();
    ctx.ellipse(Math.random() * size, Math.random() * size, 30 + Math.random() * 90, 20 + Math.random() * 70, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Faint vertical streaks (weathered slab look)
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = mottle[i % mottle.length];
    ctx.globalAlpha = 0.04 + Math.random() * 0.05;
    ctx.fillRect(Math.random() * size, Math.random() * size, 6 + Math.random() * 26, 90 + Math.random() * 220);
  }
  // Fine speckle grain
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = speckle[i % speckle.length];
    ctx.globalAlpha = speckleAlpha * (0.4 + Math.random() * 0.6);
    const s = 1 + Math.random() * 2.5;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ─── SCENE BACKGROUNDS — "Change background" viewer feature ─
// Presets render procedurally (zero assets required) and upgrade to a
// photo backdrop at /images/backgrounds/<id>.jpg when that file exists —
// drop JPGs into public/images/backgrounds/ to replace a preset's look.
// Applied as scene.background so the backdrop also appears in saved
// captures (Save PNG / order-form images).

const BG_PRESETS = [
  { id: "default", name: "Default", kind: "none", thumb: "linear-gradient(180deg,#eef3f8,#dfe9f2)" },
  {
    id: "backyard", name: "Backyard", kind: "scene",
    sky: ["#7ec8f2", "#bfe6fb"], ground: ["#6db86a", "#4f9e4c"],
    thumb: "linear-gradient(180deg,#7ec8f2 0%,#bfe6fb 55%,#6db86a 55%,#4f9e4c 100%)",
  },
  { id: "basic-gray", name: "Basic Gray", kind: "color", color: "#d9d9d9", thumb: "#d9d9d9" },
  {
    id: "farm", name: "Farm", kind: "scene",
    sky: ["#ffd9a0", "#ffe9c9"], ground: ["#d9b06c", "#b98d4e"],
    thumb: "linear-gradient(180deg,#ffd9a0 0%,#ffe9c9 55%,#d9b06c 55%,#b98d4e 100%)",
  },
  { id: "sky", name: "Sky", kind: "gradient", stops: [["#4a90d9", 0], ["#cfe8f7", 1]], thumb: "linear-gradient(180deg,#4a90d9,#cfe8f7)" },
  { id: "dark", name: "Dark", kind: "color", color: "#2b2f36", thumb: "#2b2f36" },
];

// Procedural backdrop texture — sky+ground scene or plain gradient.
function makeBackgroundTexture(preset) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (preset.kind === "scene") {
    const sky = ctx.createLinearGradient(0, 0, 0, size * 0.55);
    sky.addColorStop(0, preset.sky[0]);
    sky.addColorStop(1, preset.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, size, size * 0.55);
    const ground = ctx.createLinearGradient(0, size * 0.55, 0, size);
    ground.addColorStop(0, preset.ground[0]);
    ground.addColorStop(1, preset.ground[1]);
    ctx.fillStyle = ground;
    ctx.fillRect(0, size * 0.55, size, size * 0.45);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    for (const [color, at] of preset.stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── PHOTO-REAL ENVIRONMENT (HDR skybox + grass ground) ────
// Mounts setupEnvironment (3d/environment.js) into the scene and keeps its
// state in sync with the 3D/Top View toggle and the "Change background"
// picker: Default = plain white (environment off); any non-default choice
// turns on the photoreal backyard environment. Disposes everything it
// added on unmount.
function SceneEnvironment({ topView, active, presetId = "default", maxDim }) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const handleRef = useRef(null);
  // Latest props for the one-time build below (no rebuild on change).
  const latestRef = useRef({ maxDim, topView, active, backdrop: null });
  useEffect(() => { Object.assign(latestRef.current, { maxDim, topView, active }); });

  // Build once per scene/renderer; tear down on unmount.
  useEffect(() => {
    const handle = setupEnvironment(scene, gl);
    const cur = latestRef.current;
    handle.setSize(cur.maxDim);
    handle.setBackdrop(cur.backdrop);
    handle.setTopView(cur.topView);
    handle.setActive(cur.active);
    handleRef.current = handle;
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
  }, [scene, gl]);

  // Picker: Backyard → photoreal env on; everything else → env off.
  useEffect(() => {
    handleRef.current?.setActive(active);
  }, [active]);

  // 3D ↔ Top View.
  useEffect(() => {
    handleRef.current?.setTopView(topView);
  }, [topView]);

  // Backdrop for non-Backyard presets: solid color (Basic Gray, Dark) or the
  // procedural gradient/scene texture (Sky, Farm); Default → null (white).
  useEffect(() => {
    const preset = BG_PRESETS.find((p) => p.id === presetId) ?? BG_PRESETS[0];
    let tex = null;
    let bg = null;
    if (preset.id !== "backyard") {
      if (preset.kind === "color") bg = new THREE.Color(preset.color);
      else if (preset.kind === "scene" || preset.kind === "gradient") {
        tex = makeBackgroundTexture(preset);
        bg = tex;
      }
    }
    latestRef.current.backdrop = bg;
    handleRef.current?.setBackdrop(bg);
    return () => {
      tex?.dispose();
    };
  }, [presetId]);

  // Keep the backdrop dome in proportion to the building.
  useEffect(() => {
    handleRef.current?.setSize(maxDim);
  }, [maxDim]);

  return null;
}

function InstallationSurface({ footprint, surface = "Concrete" }) {
  const style = resolveSurfaceStyle(surface);

  // Slab = building footprint + installation allowance on every side.
  const allowance = SURFACE_ALLOWANCE_FT * SCALE;
  const slabW = Math.max(footprint.maxX - footprint.minX, 0.1) + allowance * 2;
  const slabL = Math.max(footprint.maxZ - footprint.minZ, 0.1) + allowance * 2;
  const slabX = (footprint.minX + footprint.maxX) / 2;
  const slabZ = (footprint.minZ + footprint.maxZ) / 2;

  // Grain scale stays constant regardless of slab size (repeat = size / 8).
  const slabTex = useMemo(() => {
    const tex = makeSurfaceTexture(style);
    tex.repeat.set(slabW / 8, slabL / 8);
    return tex;
  }, [style, slabW, slabL]);

  // Dispose GPU texture when the surface type (or size) changes.
  useEffect(() => () => slabTex.dispose(), [slabTex]);

  // Hide the slab when the camera drops below ground level (bottom view) so
  // the building's underside stays visible. Toggled imperatively each frame
  // (no re-render); a small hysteresis band avoids flicker at the threshold.
  const slabRef = useRef(null);
  useFrame(({ camera }) => {
    const m = slabRef.current;
    if (!m) return;
    if (camera.position.y < -0.25) m.visible = false;
    else if (camera.position.y > 0.25) m.visible = true;
  });

  // Textured installation-surface slab under the building footprint —
  // slightly raised, receives shadows when the Shadows view option is on.
  return (
    <mesh ref={slabRef} position={[slabX, -0.05, slabZ]} receiveShadow>
      <boxGeometry args={[slabW, 0.12, slabL]} />
      <meshStandardMaterial map={slabTex} roughness={0.9} metalness={0.02} />
    </mesh>
  );
}

// ─── STEEL TUBE (reusable structural member — square cross-section) ──

function SteelTube({ start, end, size = MAIN_TUBE, color = STEEL_COLOR }) {
  const [sx, sy, sz] = start;
  const [ex, ey, ez] = end;
  const dx = ex - sx, dy = ey - sy, dz = ez - sz;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const mx = (sx + ex) / 2, my = (sy + ey) / 2, mz = (sz + ez) / 2;

  const rotation = useMemo(() => {
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const e = new THREE.Euler().setFromQuaternion(quat);
    return [e.x, e.y, e.z];
  }, [dx, dy, dz]);

  return (
    <mesh position={[mx, my, mz]} rotation={rotation} castShadow>
      <boxGeometry args={[size, len, size]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
    </mesh>
  );
}

// ─── GABLE RAKE TRIM (one mitered piece) ───────────────────
// Both rake trims of one gable end as a single piece, eave → peak → eave,
// mitered at the peak — two square-cut tubes meeting at the ridge left a V
// gap. Band = the roof line ± half a tube (vertical offset size/2·√(1+k²),
// same top/bottom lines as the old tubes), extruded `size` deep around z.
function GableRakeTrim({ halfX, eaveY, ridgeY, z, size = MAIN_TUBE, color = TRIM_COLOR }) {
  const geo = useMemo(() => {
    const k = (ridgeY - eaveY) / Math.max(halfX, 1e-6);
    const d = (size / 2) * Math.sqrt(1 + k * k);
    const s = new THREE.Shape();
    s.moveTo(-halfX, eaveY - d);
    s.lineTo(-halfX, eaveY + d);
    s.lineTo(0, ridgeY + d);
    s.lineTo(halfX, eaveY + d);
    s.lineTo(halfX, eaveY - d);
    s.lineTo(0, ridgeY - d);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: size, bevelEnabled: false });
    g.translate(0, 0, -size / 2);
    return g;
  }, [halfX, eaveY, ridgeY, size]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[0, 0, z]} castShadow>
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
    </mesh>
  );
}

// ─── STEEL FLAT BAR (flat strap — wide face against a plane) ──
// Rectangular strap oriented so its WIDE face lies flat against the roof
// plane: the member runs along the bar axis, `width` spans in-slope and
// `thickness` is perpendicular to the roof. `normal` is the roof's outward
// normal so the strap hugs the skin exactly (matches the flat-strap purlins
// in the reference).

function SteelFlatBar({ start, end, width, thickness, normal, color = STEEL_COLOR }) {
  const [sx, sy, sz] = start;
  const [ex, ey, ez] = end;
  const dx = ex - sx, dy = ey - sy, dz = ez - sz;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const mx = (sx + ex) / 2, my = (sy + ey) / 2, mz = (sz + ez) / 2;

  const rotation = useMemo(() => {
    // Build the orientation basis directly:
    //   Y axis = member direction (box length runs along it)
    //   Z axis = roof outward normal (box thickness along it → wide X–Y
    //            face sits flat on the roof plane)
    //   X axis = Y × Z (in-slope width direction)
    const yAxis = new THREE.Vector3(dx, dy, dz).normalize();
    const zAxis = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    zAxis.crossVectors(xAxis, yAxis).normalize(); // re-orthogonalize
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    const e = new THREE.Euler().setFromRotationMatrix(m);
    return [e.x, e.y, e.z];
  }, [dx, dy, dz, normal]);

  return (
    <mesh position={[mx, my, mz]} rotation={rotation} castShadow>
      <boxGeometry args={[width, len, thickness]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════
// FRAME SYSTEM — Parametric Portal Frame Construction
//
// Structure:
//   FrameSystem
//   ├── Portal Frames (repeating at each bay)
//   │   ├── Left Post       (MAIN_TUBE)
//   │   ├── Right Post      (MAIN_TUBE)
//   │   ├── Rafter           straight tubes (MAIN_TUBE)
//   │   └── Haunch Braces   (SECONDARY_TUBE, corner braces per frame)
//   │
//   ├── Secondary (along length, connecting portals)
//   │   ├── Eave Struts     (SECONDARY_TUBE)
//   │   ├── Base Rails      (BASE_RAIL_TUBE, footer channel at the foot)
//   │   └── Ridge Beam      (SECONDARY_TUBE, peaked styles only)
//   │
//   └── No girts/purlins visible — they live behind panels
// ═══════════════════════════════════════════════════════════

function FrameSystem({ grid, roofStyle, walls = {}, openings = {} }) {
  const { l, h, halfW, roofPeak, bayPositions, slopeDirX, slopeDirY } = grid;
  const preset = getPreset(roofStyle);

  // ─── Enclosure state: determine what's hidden by cladding ──
  const hasLeft = !!walls.left;
  const hasRight = !!walls.right;
  const hasFront = !!walls.front;
  const hasBack = !!walls.back;
  const hasAnyWall = hasLeft || hasRight || hasFront || hasBack;
  const isFullyEnclosed = hasLeft && hasRight && hasFront && hasBack;

  // ─── Straight members (posts, braces, secondary) ───────
  const members = useMemo(() => {
    const m = [];
    const zF = -l / 2, zB = l / 2;
    // One-piece mitered roof beam / chord across the span (eave → peak →
    // eave), drawn with GableRakeTrim — two square tubes meeting at the ridge
    // left a V gap. s/e stay at the frame's z so the opening leg-adjust loop
    // below still shifts it with its frame.
    const miterMember = (halfX, eaveY, ridgeY, z, size) => ({
      s: [-halfX, eaveY, z], e: [halfX, eaveY, z], t: size,
      miter: { halfX, eaveY, ridgeY, size },
    });

    // Portal frames at each bay — COLUMNS ALWAYS VISIBLE
    for (let bi = 0; bi < bayPositions.length; bi++) {
      const z = bayPositions[bi];
      const isEdgeBay = bi === 0 || bi === bayPositions.length - 1;

      // Columns — NEVER hidden. Every building needs visible legs.
      if (preset.hasLatticeColumns) {
        // ─── UNIFIED TRUSS PORTAL FRAME ──────────────────────────
        // One continuous structural skeleton: columns → top chord → bottom chord → web
        // Outer column rail flows into sloped top chord
        // Inner column rail flows into horizontal bottom chord
        const railGap = MAIN_TUBE * 1.8;
        const webSegs = Math.max(5, Math.round(h / (MAIN_TUBE * 3)));

        // ── Column lattice (each side) ──
        for (const side of [-1, 1]) {
          const cx = side * halfW;
          const outerX = cx + side * railGap / 2;
          const innerX = cx - side * railGap / 2;
          // Outer rail: ground → eave (continues as top chord)
          m.push({ s: [outerX, 0, z], e: [outerX, h, z], t: BRACE_TUBE });
          // Inner rail: ground → eave (continues as bottom chord)
          m.push({ s: [innerX, 0, z], e: [innerX, h, z], t: BRACE_TUBE });
          // Column webbing
          const segH = h / webSegs;
          for (let wi = 0; wi < webSegs; wi++) {
            const y1 = wi * segH;
            const y2 = (wi + 1) * segH;
            if (wi % 2 === 0) {
              m.push({ s: [innerX, y1, z], e: [outerX, y2, z], t: BRACE_TUBE });
            } else {
              m.push({ s: [outerX, y1, z], e: [innerX, y2, z], t: BRACE_TUBE });
            }
          }
          // Base tie
          m.push({ s: [innerX, 0, z], e: [outerX, 0, z], t: BRACE_TUBE });
          // Eave tie (connects outer rail to inner rail at top — bridges to chords)
          m.push({ s: [innerX, h, z], e: [outerX, h, z], t: BRACE_TUBE });
        }

        // ── Roof truss (continuous with columns) ──
        // Parallel-chord rafter truss on each slope (same lattice language as
        // the legs): sloped top chord + sloped bottom chord a fixed depth below
        // it, zigzag webbing with verticals between the chords, and a king post
        // at the ridge where the two bottom chords meet.
        if (isEdgeBay || !isFullyEnclosed) {
          const leftOuter  = -halfW - railGap / 2;
          const rightOuter =  halfW + railGap / 2;
          const ridgeY = h + roofPeak;
          // Truss depth — vertical distance between the parallel chords.
          // Kept shallow (≈ 0.7–1.8 ft) so the truss band reads slim instead
          // of the old chunky 3+ ft band.
          const trussDepth = Math.max(0.35, Math.min(0.9, roofPeak * 0.2));
          const DIVS = 8;

          for (const side of [-1, 1]) {
            const tStart = side === -1 ? leftOuter : rightOuter;
            if (side === -1) {
              // Top chord (continuous with the column outer rails) and the
              // parallel bottom chord trussDepth below it — each one mitered
              // piece across the span, closed at the apex.
              m.push(miterMember(rightOuter, h, ridgeY, z, SECONDARY_TUBE));
              m.push(miterMember(rightOuter, h - trussDepth, ridgeY - trussDepth, z, SECONDARY_TUBE));
            }

            for (let di = 0; di < DIVS; di++) {
              const x1 = tStart * (1 - di / DIVS);
              const y1 = h + roofPeak * (di / DIVS);
              const x2 = tStart * (1 - (di + 1) / DIVS);
              const y2 = h + roofPeak * ((di + 1) / DIVS);
              // Vertical at interior panel points (eave end is the column rail)
              if (di > 0) {
                m.push({ s: [x1, y1 - trussDepth, z], e: [x1, y1, z], t: BRACE_TUBE });
              }
              // Zigzag diagonal — alternates direction each panel
              if (di % 2 === 0) {
                m.push({ s: [x1, y1 - trussDepth, z], e: [x2, y2, z], t: BRACE_TUBE });
              } else {
                m.push({ s: [x1, y1, z], e: [x2, y2 - trussDepth, z], t: BRACE_TUBE });
              }
            }
          }

          // King post — the bottom assembly's center vertical, kept inside the
          // slim truss band (junction of the bottom chords up to the apex) so
          // the truss reads compact like the reference, not a full-width tie.
          m.push({ s: [0, ridgeY - trussDepth, z], e: [0, ridgeY, z], t: SECONDARY_TUBE });
        }
      } else {
        // Solid tube columns
        m.push({ s: [-halfW, 0, z], e: [-halfW, h, z], t: MAIN_TUBE });
        m.push({ s: [halfW, 0, z], e: [halfW, h, z], t: MAIN_TUBE });
      }

      // Rafters — always visible at edge bays; interior hidden only when fully enclosed
      // Skip if lattice columns (lattice rafters already rendered above)
      if (!preset.hasLatticeColumns) {
        if (isEdgeBay || !isFullyEnclosed) {
          // Both roof beams as one mitered piece (closed at the ridge).
          m.push(miterMember(halfW, h, h + roofPeak, z, MAIN_TUBE));
        }
      }

      // Haunch (corner) braces — prominent diagonals at each eave junction,
      // from partway down the column up to the underside of the rafter,
      // forming the triangular corner (matches reference). Visible on edge
      // bays always; interior only when open. Skip lattice columns (their
      // unified truss frame has its own eave tie).
      if (preset.kneeBraces && !preset.hasLatticeColumns && (isEdgeBay || !isFullyEnclosed)) {
        const HAUNCH_DROP = 0.10; // fraction of column height below the eave
        const HAUNCH_RUN = 0.10;  // fraction of half-span up the rafter slope
        const hy = h * (1 - HAUNCH_DROP);
        const rx = halfW * (1 - HAUNCH_RUN);
        const ry = h + roofPeak * HAUNCH_RUN;
        m.push({ s: [-halfW, hy, z], e: [-rx, ry, z], t: SECONDARY_TUBE });
        m.push({ s: [halfW, hy, z], e: [rx, ry, z], t: SECONDARY_TUBE });
      }
    }

    // Eave struts — always present (they define the roof edge silhouette)
    m.push({ s: [-halfW, h, zF], e: [-halfW, h, zB], t: SECONDARY_TUBE });
    m.push({ s: [halfW, h, zF], e: [halfW, h, zB], t: SECONDARY_TUBE });
    // Outer rail eave struts for lattice buildings (top chord continuity in Z)
    if (preset.hasLatticeColumns) {
      const rg = MAIN_TUBE * 1.8;
      m.push({ s: [-halfW - rg / 2, h, zF], e: [-halfW - rg / 2, h, zB], t: BRACE_TUBE });
      m.push({ s: [halfW + rg / 2, h, zF], e: [halfW + rg / 2, h, zB], t: BRACE_TUBE });
    }

    // Base rails — footer channel at the foot of the SIDE walls only, sitting
    // fully on the ground so it reads as a continuous base like the reference.
    // Hidden only when that specific wall's cladding covers it.
    const railY = BASE_RAIL_TUBE / 2;
    if (!hasLeft)  m.push({ s: [-halfW, railY, zF], e: [-halfW, railY, zB], t: BASE_RAIL_TUBE });
    if (!hasRight) m.push({ s: [halfW, railY, zF], e: [halfW, railY, zB], t: BASE_RAIL_TUBE });

    // Ridge beam — defines the roofline on standard styles. Truss-frame
    // styles that want zigzag frames only (Commercial) drop it via
    // hasRidgeBeam: false so nothing runs along the ridge between frames.
    if (preset.hasRidgeBeam !== false) {
      m.push({ s: [0, h + roofPeak, zF], e: [0, h + roofPeak, zB], t: SECONDARY_TUBE });
    }

    // Purlins — flat straps against the roof skin's underside, running the
    // building length. Only when open (no walls at all). Each strap is lifted
    // along the roof's outward normal so it rests on the top chord with its
    // wide face flat under the skin (no floating gap).
    if (preset.hasPurlins && !hasAnyWall) {
      const PURLIN_COUNT = 3;
      // Perpendicular lift off the rafter centerline: the strap's underside
      // rests on the chord top face, its wide top face hugs the roof skin.
      const chordHalf = preset.hasLatticeColumns ? SECONDARY_TUBE / 2 : MAIN_TUBE / 2;
      const PURLIN_SIT = chordHalf + STRAP_T / 2;
      const leftN = [-slopeDirY, slopeDirX, 0];
      const rightN = [slopeDirY, slopeDirX, 0];
      for (let bi = 0; bi < bayPositions.length - 1; bi++) {
        const z1 = bayPositions[bi], z2 = bayPositions[bi + 1];
        for (let pi = 1; pi <= PURLIN_COUNT; pi++) {
          const t = pi / (PURLIN_COUNT + 1);
          const px = halfW * (1 - t);
          const py = h + roofPeak * t;
          // Outward roof normal: right slope (+slopeDirY, +slopeDirX), left slope
          // (-slopeDirY, +slopeDirX). Lift each strap onto the chord top face.
          const liftY = py + PURLIN_SIT * slopeDirX;
          const rightX = px + PURLIN_SIT * slopeDirY;
          const leftX = -px - PURLIN_SIT * slopeDirY;
          m.push({ s: [leftX, liftY, z1], e: [leftX, liftY, z2], f: { w: STRAP_W, t: STRAP_T, n: leftN } });
          m.push({ s: [rightX, liftY, z1], e: [rightX, liftY, z2], f: { w: STRAP_W, t: STRAP_T, n: rightN } });
        }
      }

      // Ridge purlins — a flat strap pair straddling the ridge (one on each
      // slope, close to the apex), running the full building length. Same
      // flat-strap treatment as the other purlins.
      const RIDGE_T = 0.92; // near the apex (0 = eave, 1 = ridge)
      const rpx = halfW * (1 - RIDGE_T);
      const rpy = h + roofPeak * RIDGE_T;
      const rLiftY = rpy + PURLIN_SIT * slopeDirX;
      const rRightX = rpx + PURLIN_SIT * slopeDirY;
      const rLeftX = -rpx - PURLIN_SIT * slopeDirY;
      m.push({ s: [rLeftX, rLiftY, zF], e: [rLeftX, rLiftY, zB], f: { w: STRAP_W, t: STRAP_T, n: leftN } });
      m.push({ s: [rRightX, rLiftY, zF], e: [rRightX, rLiftY, zB], f: { w: STRAP_W, t: STRAP_T, n: rightN } });
    }

    // Collar tie — a single horizontal member joining the two opposing rafters
    // high in the roof rise, near the ridge. Collar-tie-only
    // framing: no bottom chord, no diagonal webbing. Shown on every style
    // (gable-end bays always; interior only when open).
    // Skip when hasLatticeColumns (its unified truss frame already renders).
    if (preset.hasTruss && !preset.hasLatticeColumns) {   
      const TIE_FRAC = 0.85; // up the roof rise — 0 = eave, 1 = ridge (near the ridge)
      for (let bi = 0; bi < bayPositions.length; bi++) {
        const z = bayPositions[bi];
        const isEdge = bi === 0 || bi === bayPositions.length - 1;
        if (!isEdge && isFullyEnclosed) continue;

        const tieY = h + roofPeak * TIE_FRAC;
        const tieX = halfW * (1 - TIE_FRAC);
        m.push({ s: [-tieX, tieY, z], e: [tieX, tieY, z], t: SECONDARY_TUBE });
      }
    }

    // Side girts — horizontal members along wall height (sides only, not ends)
    // Attached to outer rail of columns; visible when walls are open
    if (preset.hasGirts) {
      const GIRT_COUNT = Math.max(2, Math.round(h / (MAIN_TUBE * 5)));
      const girtX = preset.hasLatticeColumns ? halfW + MAIN_TUBE * 0.9 : halfW;
      for (let gi = 1; gi <= GIRT_COUNT; gi++) {
        const gy = (gi / (GIRT_COUNT + 1)) * h;
        // Left side girts
        if (!hasLeft) m.push({ s: [-girtX, gy, zF], e: [-girtX, gy, zB], t: BRACE_TUBE });
        // Right side girts
        if (!hasRight) m.push({ s: [girtX, gy, zF], e: [girtX, gy, zB], t: BRACE_TUBE });
      }
    }

    // Legs adjust around side-wall openings: an interior frame whose z lands in
    // an opening span hugs the span edge instead of crossing the opening
    // (reference behavior). Longitudinal members and the end frames (z = ±l/2,
    // which frame the end walls) stay in place.
    const legSpans = [
      ...openingAxisSpans(openings.left, l, MAIN_TUBE / 2 + 0.12),
      ...openingAxisSpans(openings.right, l, MAIN_TUBE / 2 + 0.12),
    ];
    if (legSpans.length > 0) {
      for (let i = 0; i < m.length; i++) {
        const mem = m[i];
        const s = mem.s;
        const e = mem.e;
        if (Math.abs(s[2] - e[2]) > 1e-6) continue;      // longitudinal member
        if (Math.abs(s[2]) >= l / 2 - 0.01) continue;    // end frames stay
        const z2 = adjustLegAxis(s[2], legSpans);
        if (z2 !== s[2]) {
          m[i] = { ...mem, s: [s[0], s[1], z2], e: [e[0], e[1], z2] };
        }
      }
    }
    return m;
  }, [l, h, halfW, roofPeak, slopeDirX, slopeDirY, preset, bayPositions, hasLeft, hasRight, hasAnyWall, isFullyEnclosed, openings]);

  return (
    <group>
      {members.map((mem, i) =>
        mem.miter ? (
          <GableRakeTrim key={`f${i}`} {...mem.miter} z={mem.s[2]} color={STEEL_COLOR} />
        ) : mem.f ? (
          <SteelFlatBar key={`f${i}`} start={mem.s} end={mem.e} width={mem.f.w} thickness={mem.f.t} normal={mem.f.n} />
        ) : (
          <SteelTube key={`f${i}`} start={mem.s} end={mem.e} size={mem.t} />
        )
      )}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// ROOF SYSTEM — Solid surface following rafter profile
//
// Two ribbed slope planes meeting at the ridge, slight overhang
// past posts, strong surface presence
// ═══════════════════════════════════════════════════════════

function RoofSystem({ grid, roofColor, roofStyle, walls = {}, roofDir = "vertical" }) {
  const { w, l, h, halfW, roofPeak, ovEX, ovEY, slopeLen, slopeDirX } = grid;
  const preset = getPreset(roofStyle);
  const isHorizRoof = roofDir === "horizontal";
  const color = roofColor || "#cc0000";
  const hasAnyWall = !!(walls.left || walls.right || walls.front || walls.back);
  // The roof skin rests directly on the structure below it — flat purlin
  // straps (or the top chord itself when straps are hidden behind walls):
  // chord half + strap thickness + a hair, measured perpendicular to the
  // slope. Convert that perpendicular clearance to a vertical lift so the
  // roof stays parallel to the rafters at any pitch (layering:
  // chord → straps → roof, no floating gap).
  const strapsVisible = preset.hasPurlins && !hasAnyWall;
  const ROOF_OFFSET = roofStack(preset, strapsVisible) / Math.max(slopeDirX, 0.1);
  // Sheet-metal cap lift above the ribbed roof skin (ridge cap rests on it)
  const CAP_LIFT = 0.015;
  // Constant hem-bottom lift: gives the cap a straight outer silhouette
  const HEM_LIFT = 0.006;

  // ─── PEAKED ROOF (A-Frame, Vertical, Garage, Barn) ─────
  // Roof skin = real rib-panel geometry (see 3d/roof/ribPanelGeometry.js).
  // Color comes straight from the roofColor prop - unchanged.

  // Peaked roof: build two slope quads as BufferGeometry (reliable from all angles)
  const ro = ROOF_OFFSET;
  // Extend roof past wall surfaces: base gap cover + actual overhang
  const eaveExt = MAIN_TUBE * 0.8 + ovEX;
  const eaveExtY = ovEY; // vertical drop at eave due to overhang slope
  const zF = -l / 2 - eaveExt, zB = l / 2 + eaveExt;
  const ridgeY = h + roofPeak + ro;
  const eaveY = h + ro - eaveExtY;

  // Ridge cap - rib-conforming legs that rest ON the ribbed skin (no gap).
  // Same rib profile phase as the slopes (same zF/zB), lifted by CAP_LIFT.
  const capLeg = 0.45;                              // leg along each slope (~11 in real)
  const capTuck = 0.04;                             // each leg tucks past the apex (overlap)
  const slopeRun = halfW + eaveExt;
  const slopeRise = ridgeY - eaveY;
  const capSlopeLen = Math.hypot(slopeRun, slopeRise) || 1;
  const capOut = (capLeg / capSlopeLen) * slopeRun;    // leg end - horizontal reach
  const capDrop = (capLeg / capSlopeLen) * slopeRise;  // leg end - vertical drop

  const leftSlopeGeo = useMemo(() => {
    return createRibPanelGeometry({
      zF,
      zB,
      eave: [-(halfW + eaveExt), eaveY],
      ridge: [0, ridgeY],
      dir: roofDir,
    });
  }, [halfW, eaveExt, eaveY, ridgeY, zF, zB, roofDir]);

  const rightSlopeGeo = useMemo(() => {
    return createRibPanelGeometry({
      zF,
      zB,
      eave: [halfW + eaveExt, eaveY],
      ridge: [0, ridgeY],
      dir: roofDir,
    });
  }, [halfW, eaveExt, eaveY, ridgeY, zF, zB, roofDir]);

  // Horizontal install: the cap runs parallel to the ribs (constant along z),
  // so its hem/crest rows lift by the rib heights sampled at those slope
  // positions instead of conforming along z.
  const capHemRibH = isHorizRoof ? ribHeightAtSlopeDist(Math.max(0, capSlopeLen - capLeg), capSlopeLen) : 0;
  const capCrestRibH = isHorizRoof ? ribHeightAtSlopeDist(capSlopeLen, capSlopeLen) : 0;

  const leftCapGeo = useMemo(() => {
    if (!preset.ridgeCap) return null;
    return createRidgeCapGeometry({
      zF,
      zB,
      eave: [-capOut, ridgeY - capDrop],
      ridge: [capTuck, ridgeY],
      baseLift: CAP_LIFT,
      hemLift: HEM_LIFT,
      dir: roofDir,
      hemRibH: capHemRibH,
      crestRibH: capCrestRibH,
    });
  }, [preset.ridgeCap, capOut, capDrop, capTuck, CAP_LIFT, HEM_LIFT, ridgeY, zF, zB, roofDir, capHemRibH, capCrestRibH]);

  const rightCapGeo = useMemo(() => {
    if (!preset.ridgeCap) return null;
    return createRidgeCapGeometry({
      zF,
      zB,
      eave: [capOut, ridgeY - capDrop],
      ridge: [-capTuck, ridgeY],
      baseLift: CAP_LIFT,
      hemLift: HEM_LIFT,
      dir: roofDir,
      hemRibH: capHemRibH,
      crestRibH: capCrestRibH,
    });
  }, [preset.ridgeCap, capOut, capDrop, capTuck, CAP_LIFT, HEM_LIFT, ridgeY, zF, zB, roofDir, capHemRibH, capCrestRibH]);

  // Dispose rebuilt/unmounted slope + cap geometries
  useEffect(() => () => {
    leftSlopeGeo?.dispose();
    rightSlopeGeo?.dispose();
    leftCapGeo?.dispose();
    rightCapGeo?.dispose();
  }, [leftSlopeGeo, rightSlopeGeo, leftCapGeo, rightCapGeo]);

  return (
    <group>
      {/* Left roof slope */}
      <mesh geometry={leftSlopeGeo} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={0} polygonOffsetUnits={-1} />
      </mesh>
      {/* Right roof slope */}
      <mesh geometry={rightSlopeGeo} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={0} polygonOffsetUnits={-1} />
      </mesh>
      {/* Ridge cap - conforming legs, flush on the ribs */}
      {preset.ridgeCap && leftCapGeo && rightCapGeo && (
        <group>
          <mesh geometry={leftCapGeo} castShadow receiveShadow>
            <meshStandardMaterial color={color} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={0} polygonOffsetUnits={-2} />
          </mesh>
          <mesh geometry={rightCapGeo} castShadow receiveShadow>
            <meshStandardMaterial color={color} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={0} polygonOffsetUnits={-3} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// TRIM SYSTEM — Minimal, clean edge definition
//
// Only renders what's structurally visible:
//   Gable rake, eave lines, ridge line
// No corner trim or base trim boxes (handled by frame)
// ═══════════════════════════════════════════════════════════

function TrimSystem({ grid, roofStyle, trimColor = TRIM_COLOR }) {
  const { l, h, halfW, roofPeak, ovEX, ovEY } = grid;
  const preset = getPreset(roofStyle);
  // Truss styles (lattice columns) rest the roof skin on the thinner truss top
  // chord (roofStack uses SECONDARY_TUBE), so a MAIN_TUBE trim would poke
  // through the skin near the ridge. Match the chord size there.
  // The trim is 6% larger than the frame member it covers, so it WRAPS that
  // member (frame hidden inside, no coplanar faces) instead of sharing its
  // exact surfaces — identical overlapping tubes z-fight (trim/steel flicker).
  const T = (preset.hasLatticeColumns ? SECONDARY_TUBE : MAIN_TUBE) * 1.06;

  // Rake line = the end-frame member under it: rafter (halfW + overhang) on
  // standard frames; the truss top chord (halfW + railGap/2, eave at h) on
  // lattice styles — same line as FrameSystem so the trim encloses it.
  const rakeHalfX = preset.hasLatticeColumns ? halfW + (MAIN_TUBE * 1.8) / 2 : halfW + ovEX;
  const rakeEaveY = preset.hasLatticeColumns ? h : h - ovEY;

  // Roof endpoints
  const leftEaveF = [-halfW - ovEX, h - ovEY, -l / 2];
  const leftEaveB = [-halfW - ovEX, h - ovEY, l / 2];
  const rightEaveF = [halfW + ovEX, h - ovEY, -l / 2];
  const rightEaveB = [halfW + ovEX, h - ovEY, l / 2];
  const ridgeF = [0, h + roofPeak, -l / 2];
  const ridgeB = [0, h + roofPeak, l / 2];

  return (
    <group>
      {/* Gable rake trim — one mitered piece per end, wrapping the end frame */}
      <GableRakeTrim halfX={rakeHalfX} eaveY={rakeEaveY} ridgeY={h + roofPeak} z={-l / 2} size={T} color={trimColor} />
      <GableRakeTrim halfX={rakeHalfX} eaveY={rakeEaveY} ridgeY={h + roofPeak} z={l / 2} size={T} color={trimColor} />
      {/* Eave edge tubes */}
      <SteelTube start={leftEaveF} end={leftEaveB} size={T} color={trimColor} />
      <SteelTube start={rightEaveF} end={rightEaveB} size={T} color={trimColor} />
      {/* Ridge line - hidden when a ridge cap covers it */}
      {!preset.ridgeCap && <SteelTube start={ridgeF} end={ridgeB} size={T} color={trimColor} />}
    </group>
  );
}

// ─── GUTTER SYSTEM — white gutter runs + downspouts ─────────
// Rendered when the configurator's "Gutters" option is on. `sides`:
// "none" | "left" | "right" | "both" (left = -X, right = +X; on
// mono-slope styles left = the tall eave, right = the short eave).
// `downspouts` (0-10) splits as evenly as possible across the runs.
// Runs hug the eave trim (fascia) just under the roof drip edge and
// span the full roof edge including the gable overhang.

const GUTTER_COLOR = "#f8f8f8";   // standard white gutter
const GUT_R = 0.12;               // half-round trough radius (~6" wide, ~3" deep)
const GUT_GAP = 0.02;             // clearance to the fascia tube (no z-fighting)
const DS_R = 0.06;                // round downspout pipe radius (~3" Ø real)
const DS_INSET = 0.5;             // downspout fallback inset (more downs than posts)

// ─── GUTTER PIPE — round downspout segment (cylinder between two points) ──
function GutterPipe({ start, end, radius = DS_R, color = GUTTER_COLOR }) {
  const [sx, sy, sz] = start;
  const [ex, ey, ez] = end;
  const dx = ex - sx, dy = ey - sy, dz = ez - sz;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const mx = (sx + ex) / 2, my = (sy + ey) / 2, mz = (sz + ez) / 2;

  const rotation = useMemo(() => {
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const e = new THREE.Euler().setFromQuaternion(quat);
    return [e.x, e.y, e.z];
  }, [dx, dy, dz]);

  return (
    <mesh position={[mx, my, mz]} rotation={rotation} castShadow>
      <cylinderGeometry args={[radius, radius, len, 16]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.4} />
    </mesh>
  );
}

function GutterSystem({ grid, roofStyle, walls = {}, sides = "none", downspouts = 0 }) {
  const { l, h, hLow, halfW, ovEX, ovEY, slopeDirX, monoSlope, bayPositions } = grid;
  const sideList = sides === "both" ? ["left", "right"] : sides === "left" || sides === "right" ? [sides] : [];

  // Roof skin lift above the eave trim (same stack as RoofSystem) so the
  // trough top sits just under the drip edge at any pitch.
  const preset = getPreset(roofStyle);
  const hasAnyWall = !!(walls.left || walls.right || walls.front || walls.back);
  const strapsVisible = preset.hasPurlins && !hasAnyWall;
  const ro = roofStack(preset, strapsVisible) / Math.max(slopeDirX, 0.1);

  // Run spans the full roof edge (incl. the gable overhang), like the skin.
  const eaveExt = MAIN_TUBE * 0.8 + ovEX;
  const zStart = -l / 2 - eaveExt;
  const zEnd = l / 2 + eaveExt;

  // Downspout count per run — even split, the extra one goes left.
  const n = Math.min(10, Math.max(0, Math.trunc(Number(downspouts) || 0)));
  const countFor = (side) => {
    if (!sideList.includes(side)) return 0;
    if (sideList.length === 2) return side === "left" ? Math.ceil(n / 2) : Math.floor(n / 2);
    return n;
  };
  const dsZ = (count) => {
    const posts = bayPositions ?? [];
    if (count <= 0) return [];
    // Snap to the post lines (corners first) — the reference downspout hugs a
    // column. With more downspouts than posts, spread along the run instead.
    if (count === 1) return [posts.length ? posts[Math.floor((posts.length - 1) / 2)] : (zStart + zEnd) / 2];
    if (count <= posts.length) {
      return Array.from({ length: count }, (_, i) => posts[Math.round((i * (posts.length - 1)) / (count - 1))]);
    }
    return Array.from({ length: count }, (_, i) => zStart + DS_INSET + (i * (zEnd - zStart - 2 * DS_INSET)) / (count - 1));
  };

  if (sideList.length === 0) return null;

  return (
    <group>
      {sideList.map((side) => {
        const sign = side === "right" ? 1 : -1;
        // Eave trim (fascia) tube centerline height — mono-slope eaves sit at
        // their own heights (tall side is +ovEY, short side -ovEY).
        const trimY = monoSlope ? (sign < 0 ? h + ovEY : hLow - ovEY) : h - ovEY;
        const yTop = trimY + ro - 0.025;  // rim just under the drip edge
        const x0 = halfW + ovEX + MAIN_TUBE / 2 + GUT_GAP; // trough back rim face
        const runLen = zEnd - zStart;
        const zMid = (zStart + zEnd) / 2;
        // Downspout line — just outboard of the column face, hugging the post.
        const xPost = halfW + MAIN_TUBE / 2 + DS_R + 0.02;
        return (
          <group key={side}>
            {/* Half-round trough — rounded profile, rim horizontal, open top */}
            <mesh position={[sign * (x0 + GUT_R), yTop, zMid]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[GUT_R, GUT_R, runLen, 20, 1, true, -Math.PI / 2, Math.PI]} />
              <meshStandardMaterial color={GUTTER_COLOR} roughness={0.5} metalness={0.4} side={THREE.DoubleSide} />
            </mesh>
            {/* End caps — half-discs closing the run */}
            {[zStart, zEnd].map((z, i) => (
              <mesh key={`cap${i}`} position={[sign * (x0 + GUT_R), yTop, z]} castShadow>
                <circleGeometry args={[GUT_R, 20, Math.PI, Math.PI]} />
                <meshStandardMaterial color={GUTTER_COLOR} roughness={0.5} metalness={0.4} side={THREE.DoubleSide} />
              </mesh>
            ))}
            {/* Downspouts — elbow + pipe + shoe along the post lines */}
            {dsZ(countFor(side)).map((z, i) => {
              const yElbowTop = yTop - GUT_R + 0.02;  // tucked under the trough
              const yPipeTop = yTop - GUT_R - 0.14;   // elbow drop
              const yShoe = 0.18;                     // shoe starts above the slab
              return (
                <group key={`ds${i}`}>
                  {/* Top elbow — round pipe, gutter outlet → down to the post line */}
                  <GutterPipe start={[sign * (x0 + GUT_R * 0.6), yElbowTop, z]} end={[sign * xPost, yPipeTop, z]} />
                  {/* Vertical round pipe down the column face */}
                  <GutterPipe start={[sign * xPost, yPipeTop, z]} end={[sign * xPost, yShoe, z]} />
                  {/* Bottom shoe — round pipe angled outward at the ground */}
                  <GutterPipe start={[sign * xPost, yShoe, z]} end={[sign * (xPost + 0.16), 0.02, z]} />
                  {/* Formed-look joints at the bends */}
                  {[[sign * (x0 + GUT_R * 0.6), yElbowTop, z], [sign * xPost, yPipeTop, z], [sign * xPost, yShoe, z]].map((p, j) => (
                    <mesh key={`j${j}`} position={p} castShadow>
                      <sphereGeometry args={[DS_R * 1.05, 14, 12]} />
                      <meshStandardMaterial color={GUTTER_COLOR} roughness={0.5} metalness={0.4} />
                    </mesh>
                  ))}
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

// ─── WALL PANELS ───────────────────────────────────────────

// Partial top-band height (feet) for side walls. Accepts both "top_N" and
// "ext_gable_N" render types — on a side wall there is no gable, so an
// extended-gable selection renders as the same N-ft band at the top, open
// below (matching the ends' below-eave strip).
function parsePanelBand(wt) {
  if (typeof wt !== "string") return null;
  const src = wt.startsWith("ext_gable_")
    ? wt.slice("ext_gable_".length)
    : wt.startsWith("top_")
      ? wt.slice("top_".length)
      : null;
  if (src == null) return null;
  const ft = parseFloat(src);
  return isNaN(ft) ? null : ft;
}

function WallPanels({ grid, walls, ribEnds = {}, wallColor, twoToneColor, sidingDirection = "vertical", verticalSiding = false, wallSiding = {}, openings = {} }) {
  const { w, l, h, halfW, roofPeak, bayCount, bay } = grid;
  const panelColor = wallColor || "#e0e0e0";
  const splitY = wainscotSplit(h);

  // Opening cutouts per wall — side panels mirror x (their local +x maps to
  // world -z under the 90° wall rotation).
  const leftHoles = useMemo(() => openingHoles(openings.left, l, h, true), [openings.left, l, h]);
  const rightHoles = useMemo(() => openingHoles(openings.right, l, h, true), [openings.right, l, h]);
  const frontHoles = useMemo(() => openingHoles(openings.front, w, h, false), [openings.front, w, h]);
  const backHoles = useMemo(() => openingHoles(openings.back, w, h, false), [openings.back, w, h]);

  const getColor = (wall) => panelColor;
  const getOpacity = (wall) => 1.0;
  const wallType = (wall) => {
    const v = walls[wall];
    if (!v) return null;
    if (v === true) return "enclosed";
    return v;
  };

  // Parse partial panel height from render_type (e.g. "top_1.5" → 1.5ft, "top_3" → 3ft)
  // Sidewalls also accept "ext_gable_N" (see parsePanelBand) so custom-wall
  // extended-gable selections render the same top band as the ends' strip.
  const parseTopPanel = parsePanelBand;

  // Per-wall siding direction: custom wall rows may set their own
  // Horizontal/Vertical style ("wallSiding"); fall back to the global setting.
  const wallDir = (wall) => wallSiding[wall] || sidingDirection;

  // Side wall: single panel with texture-based seams (direction from siding selection)
  const renderSideWall = (x, wall) => {
    const wt = wallType(wall);
    if (!wt) return null;
    const color = getColor(wall);
    const op = getOpacity(wall);
    const ribSiding = wt === "enclosed"; // horizontal corrugation, matching the roof
    const holes = wall === "left" ? leftHoles : rightHoles;
    const dir = wallDir(wall);

    // Partial top panel (e.g. "top_1.5", "top_3", "ext_gable_3")
    const topFt = parseTopPanel(wt);
    if (topFt) {
      const panelH = topFt * SCALE;
      const panelY = h - panelH / 2;
      return (
        <SideWallPanel x={x} y={panelY} h={panelH} l={l} color={color} opacity={op} sidingDirection={dir} ribSiding={ribSiding} />
      );
    }

    if (!twoToneColor) {
      return (
        <SideWallPanel x={x} h={h} l={l} color={color} opacity={op} sidingDirection={dir} ribSiding={ribSiding} holes={holes} />
      );
    }
    return (
      <group>
        <SideWallPanel x={x} y={splitY + (h - splitY) / 2} h={h - splitY} l={l} color={panelColor} opacity={op} sidingDirection={dir} ribSiding={ribSiding} holes={holes} />
        <SideWallPanel x={x} y={splitY / 2} h={splitY} l={l} color={twoToneColor} opacity={op} sidingDirection={dir} ribSiding={ribSiding} holes={holes} />
      </group>
    );
  };

  return (
    <group>
      {wallType("front") && (
        <EndWallMesh w={w} h={h} roofPeak={roofPeak} z={-l / 2} type={wallType("front")} color={getColor("front")} opacity={getOpacity("front")} twoToneColor={twoToneColor} splitY={splitY} sidingDirection={wallDir("front")} ribSiding={wallType("front") === "enclosed" || !!ribEnds.front} holes={frontHoles} />
      )}
      {wallType("back") && (
        <EndWallMesh w={w} h={h} roofPeak={roofPeak} z={l / 2} type={wallType("back")} color={getColor("back")} opacity={getOpacity("back")} twoToneColor={twoToneColor} splitY={splitY} sidingDirection={wallDir("back")} ribSiding={wallType("back") === "enclosed" || !!ribEnds.back} holes={backHoles} />
      )}
      {renderSideWall(-halfW, "left")}
      {renderSideWall(halfW, "right")}
    </group>
  );
}

// ─── SIDE WALL PANEL (textured) ────────────────────────────
// Vertical ribs are shaped by light coming ACROSS the wall. The side fill
// light skims the end walls but hits the side walls head-on, so vertical
// ribs read much fainter there — boost the rib normal on side walls only
// (tune this one value if the two still differ: higher = deeper ribs).
const VERTICAL_SIDE_RIB_DEPTH = 2.4;
const SIDE_RIB_NORMAL_VERTICAL = new THREE.Vector2(VERTICAL_SIDE_RIB_DEPTH, VERTICAL_SIDE_RIB_DEPTH);
const SIDE_RIB_NORMAL_DEFAULT = new THREE.Vector2(1, 1);

function SideWallPanel({ x, y, h, l, color, opacity, sidingDirection = "vertical", ribSiding = false, holes = [] }) {
  const posY = y != null ? y : h / 2;
  // Offset wall slightly outward from column line so it covers the structure
  const sign = x > 0 ? 1 : -1;
  const wallX = x + sign * (MAIN_TUBE * 0.6);

  // Opening cutouts clipped to this panel's vertical range (two-tone splits),
  // converted to the panel's centered local coords.
  const clipped = useMemo(
    () => clipHoles(holes, posY - h / 2, posY + h / 2).map((o) => ({ ...o, y0: o.y0 - posY, y1: o.y1 - posY })),
    [holes, posY, h]
  );
  const cut = clipped.length > 0;

  const tex = useMemo(() => {
    if (ribSiding) {
      // Keep the exact uncut rib pitch when openings are introduced; ribs run
      // horizontally or vertically per the Side Wall Siding Panels choice.
      return createWallSidingTexture(color, sidingDirection, l, h);
    }
    const t = createPanelTexture(color, sidingDirection, 28);
    t.repeat.set(l / PANEL_WIDTH, h / PANEL_WIDTH);
    return t;
  }, [color, sidingDirection, ribSiding, l, h]);

  // Cut variant: flat shape with holes and the same normalized UVs as the
  // uncut box, so adding a door cannot stretch or densify the siding.
  const geo = useMemo(
    () => (cut ? makeHoledWallShape(
      [[-l / 2, -h / 2], [l / 2, -h / 2], [l / 2, h / 2], [-l / 2, h / 2]],
      clipped,
      { width: l, bottomY: -h / 2, eaveY: h / 2 }
    ) : null),
    [cut, l, h, clipped]
  );

  return (
    <mesh position={[wallX, posY, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
      {geo ? <primitive object={geo} attach="geometry" /> : <boxGeometry args={[l, h, 0.02]} />}
      <meshStandardMaterial map={tex} normalMap={tex.userData.normalMap}
        normalScale={ribSiding && sidingDirection === "vertical" ? SIDE_RIB_NORMAL_VERTICAL : SIDE_RIB_NORMAL_DEFAULT}
        transparent={opacity < 1} opacity={opacity} {...WALL_MAT} side={2} />
    </mesh>
  );
}

// ─── END WALL MESH (pentagon / gable / two-tone) ───────────

function EndWallMesh({ w, h, roofPeak, z, type, color, opacity, twoToneColor = null, splitY = 0, sidingDirection = "vertical", ribSiding = false, holes = [] }) {
  // Offset end wall slightly outward so it covers the frame tubes
  const sign = z > 0 ? 1 : -1;
  const wallZ = z + sign * (MAIN_TUBE * 0.6);

  // Opening cutouts — only the full-pentagon and two-tone variants have
  // cladding below the eave where doors sit; partial/gable variants are open
  // below, so no cut is needed there.
  const upperCut = holes.length > 0 && !(typeof type === "string" && type.startsWith("top_")) && !(typeof type === "string" && type.startsWith("ext_gable_")) && type !== "gable";
  const lowerCut = holes.length > 0 && !!twoToneColor && type !== "gable";

  // Partial top panel for end walls (e.g. "top_1.5", "top_3")
  const topFt = (typeof type === "string" && type.startsWith("top_")) ? parseFloat(type.replace("top_", "")) : null;
  const isTopPanel = topFt != null && !isNaN(topFt);

  // Extended gable: gable triangle + panel strip below eave (e.g. "ext_gable_3")
  const extGableFt = (typeof type === "string" && type.startsWith("ext_gable_")) ? parseFloat(type.replace("ext_gable_", "")) : null;
  const isExtGable = extGableFt != null && !isNaN(extGableFt);

  // Textures for end walls (panel lines follow siding direction). Repeats stay
  // identical with or without openings; cutout UVs are normalized separately.
  // Proportional eave v (height fraction) so the siding runs at the same
  // pitch/phase as the side walls (which map evenly from their bottom edge).
  const eaveVFull = h / Math.max(h + roofPeak, 1e-6);
  const eaveVTwoTone = (h - splitY) / Math.max(h + roofPeak - splitY, 1e-6);

  const upperTex = useMemo(() => {
    // Height the upper piece actually spans (bottom → top of its geometry).
    const spanH = isTopPanel ? topFt * SCALE
      : isExtGable ? roofPeak + extGableFt * SCALE
      : type === "gable" ? roofPeak
      : twoToneColor ? h + roofPeak - splitY
      : h + roofPeak;
    if (ribSiding) {
      // Enclosed walls: fine uniform horizontal ridges (~5in pitch)
      return createWallSidingTexture(color, sidingDirection, w, spanH);
    }
    const t = createPanelTexture(color, sidingDirection, 28);
    if (isTopPanel) {
      const panelH = topFt * SCALE;
      t.repeat.set(w / PANEL_WIDTH, panelH / PANEL_WIDTH);
    } else if (isExtGable) {
      const stripH = extGableFt * SCALE;
      t.repeat.set(w / PANEL_WIDTH, (roofPeak + stripH) / PANEL_WIDTH);
    } else {
      t.repeat.set(w / PANEL_WIDTH, (h + roofPeak) / PANEL_WIDTH);
    }
    return t;
  }, [color, sidingDirection, ribSiding, w, h, roofPeak, isTopPanel, topFt, isExtGable, extGableFt, type, twoToneColor, splitY]);

  const lowerTex = useMemo(() => {
    if (isTopPanel || isExtGable) return null;
    if (!twoToneColor || type === "gable") return null;
    if (ribSiding) {
      // Enclosed walls: fine uniform horizontal ridges (~5in pitch)
      return createWallSidingTexture(twoToneColor, sidingDirection, w, splitY);
    }
    const t = createPanelTexture(twoToneColor, sidingDirection, 28);
    t.repeat.set(w / PANEL_WIDTH, splitY / PANEL_WIDTH);
    return t;
  }, [twoToneColor, type, sidingDirection, ribSiding, w, splitY, isTopPanel, isExtGable]);

  const upperGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();

    if (isTopPanel) {
      // Partial top panel: rectangle strip at top of wall
      const panelH = topFt * SCALE;
      const baseY = h - panelH;
      const verts = new Float32Array([
        -w / 2, baseY, wallZ, w / 2, baseY, wallZ, w / 2, h, wallZ, -w / 2, h, wallZ,
      ]);
      const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
    } else if (isExtGable) {
      // Extended gable: gable triangle + rectangle strip below eave
      // Strip goes from (h - stripH) to h, then gable from h to h+roofPeak
      const stripH = extGableFt * SCALE;
      const baseY = h - stripH;
      const totalH = roofPeak + stripH;
      // 6 vertices: bottom-left, bottom-right, top-right(eave), ridge, top-left(eave), and we reuse eave corners
      const verts = new Float32Array([
        -w / 2, baseY, wallZ,   // 0 - bottom-left of strip
         w / 2, baseY, wallZ,   // 1 - bottom-right of strip
         w / 2, h, wallZ,       // 2 - top-right (eave)
         0, h + roofPeak, wallZ, // 3 - ridge peak
        -w / 2, h, wallZ,       // 4 - top-left (eave)
      ]);
      const uvs = new Float32Array([
        0, 0,
        1, 0,
        1, stripH / totalH,
        0.5, 1,
        0, stripH / totalH,
      ]);
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      // Two triangles for strip (0,1,2 + 0,2,4) + one for gable (2,3,4)
      g.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4]);
    } else if (type === "gable") {
      const verts = new Float32Array([-w / 2, h, wallZ, 0, h + roofPeak, wallZ, w / 2, h, wallZ]);
      const uvs = new Float32Array([0, 0, 0.5, 1, 1, 0]);
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex([0, 1, 2]);
    } else if (twoToneColor) {
      if (upperCut) {
        return makeHoledWallShape(
          [[-w / 2, splitY], [w / 2, splitY], [w / 2, h], [0, h + roofPeak], [-w / 2, h]],
          clipHoles(holes, splitY, h + roofPeak),
          { width: w, bottomY: splitY, eaveY: h, peakY: h + roofPeak, eaveV: eaveVTwoTone }
        );
      }
      const verts = new Float32Array([
        -w / 2, splitY, wallZ, w / 2, splitY, wallZ, w / 2, h, wallZ, 0, h + roofPeak, wallZ, -w / 2, h, wallZ,
      ]);
      const uvs = new Float32Array([0, 0, 1, 0, 1, eaveVTwoTone, 0.5, 1, 0, eaveVTwoTone]);
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4]);
    } else {
      if (upperCut) {
        return makeHoledWallShape(
          [[-w / 2, 0], [w / 2, 0], [w / 2, h], [0, h + roofPeak], [-w / 2, h]],
          clipHoles(holes, 0, h + roofPeak),
          { width: w, bottomY: 0, eaveY: h, peakY: h + roofPeak, eaveV: eaveVFull }
        );
      }
      const verts = new Float32Array([
        -w / 2, 0, wallZ, w / 2, 0, wallZ, w / 2, h, wallZ, 0, h + roofPeak, wallZ, -w / 2, h, wallZ,
      ]);
      const uvs = new Float32Array([0, 0, 1, 0, 1, eaveVFull, 0.5, 1, 0, eaveVFull]);
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4]);
    }
    g.computeVertexNormals();
    return g;
  }, [w, h, roofPeak, wallZ, type, twoToneColor, splitY, isTopPanel, topFt, isExtGable, extGableFt, upperCut, holes, eaveVFull, eaveVTwoTone]);

  const lowerGeo = useMemo(() => {
    if (!twoToneColor || type === "gable") return null;
    if (lowerCut) {
      return makeHoledWallShape(
        [[-w / 2, 0], [w / 2, 0], [w / 2, splitY], [-w / 2, splitY]],
        clipHoles(holes, 0, splitY),
        { width: w, bottomY: 0, eaveY: splitY }
      );
    }
    const g = new THREE.BufferGeometry();
    const verts = new Float32Array([-w / 2, 0, wallZ, w / 2, 0, wallZ, w / 2, splitY, wallZ, -w / 2, splitY, wallZ]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [w, wallZ, twoToneColor, type, splitY, lowerCut, holes]);

  return (
    <group>
      <mesh geometry={upperGeo} position={[0, 0, upperCut ? wallZ : 0]} castShadow>
        {/* End-wall geometry faces +z: inward on the FRONT wall (sign −1),
            so flip the rib relief there to read raised like the side walls. */}
        <meshStandardMaterial map={upperTex} normalMap={upperTex.userData.normalMap} normalScale={[1, sign]} transparent={opacity < 1} opacity={opacity} {...WALL_MAT} side={2} />
      </mesh>
      {lowerGeo && lowerTex && (
        <mesh geometry={lowerGeo} position={[0, 0, lowerCut ? wallZ : 0]} castShadow>
          <meshStandardMaterial map={lowerTex} normalMap={lowerTex.userData.normalMap} normalScale={[1, sign]} transparent={opacity < 1} opacity={opacity} {...WALL_MAT} side={2} />
        </mesh>
      )}
    </group>
  );
}

// ---- CLICKABLE WALL TARGETS (Doors & Windows selection) -------------------
function wallRectangle(w, h) {
  return [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];
}

function WallPickTarget({ outline, position, rotation = [0, 0, 0], target, label, labelPosition = null, selectedWall, onSelect }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    outline.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [outline]);
  useEffect(() => () => { geometry.dispose(); }, [geometry]);

  const selected = selectedWall?.section === target.section && selectedWall?.wall === target.wall;
  const border = [...outline, outline[0]].map(([x, y]) => [x, y, 0.035]);
  const click = (e) => {
    if (!onSelect || e.delta > 4) return;
    e.stopPropagation();
    onSelect(target);
  };

  return (
    <group position={position} rotation={rotation}>
      {onSelect && (
        <mesh geometry={geometry} onClick={click}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {selected && (
        <>
          <Line points={border} color="#00c5d8" lineWidth={3} depthTest={false} renderOrder={30} />
          <Html position={labelPosition ?? [0, 0.06, 0.06]} center style={{ pointerEvents: "none" }}>
            <div style={{ background: "rgba(255,255,255,0.9)", color: "#18242b", padding: "3px 8px", borderRadius: 3, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
              {label}
            </div>
          </Html>
        </>
      )}
    </group>
  );
}

function CenterWallSelection({ grid, walls = {}, selectedWall, onSelect }) {
  const { w, l, h, hLow, halfW, roofPeak, monoSlope } = grid;
  const endOutline = monoSlope
    ? [[-w / 2, 0], [w / 2, 0], [w / 2, hLow], [-w / 2, h]]
    : [[-w / 2, 0], [w / 2, 0], [w / 2, h], [0, h + roofPeak], [-w / 2, h]];
  // Only closed walls are pickable — open walls hold no doors/windows and their
  // invisible targets would otherwise intercept clicks meant for interior walls
  // (e.g. Center Storage's inner partition) through the open side.
  return (
    <group>
      {walls.front && <WallPickTarget outline={endOutline} position={[0, 0, -l / 2]} target={{ section: "center", wall: "front" }} label="Front Wall" selectedWall={selectedWall} onSelect={onSelect} />}
      {walls.back && <WallPickTarget outline={endOutline} position={[0, 0, l / 2]} target={{ section: "center", wall: "back" }} label="Back Wall" selectedWall={selectedWall} onSelect={onSelect} />}
      {walls.left && <WallPickTarget outline={wallRectangle(l, h)} position={[-halfW, 0, 0]} rotation={[0, Math.PI / 2, 0]} target={{ section: "center", wall: "left" }} label="Left Wall" selectedWall={selectedWall} onSelect={onSelect} />}
      {walls.right && <WallPickTarget outline={wallRectangle(l, monoSlope ? hLow : h)} position={[halfW, 0, 0]} rotation={[0, Math.PI / 2, 0]} target={{ section: "center", wall: "right" }} label="Right Wall" selectedWall={selectedWall} onSelect={onSelect} />}
    </group>
  );
}

// ---- STORAGE WALL PANEL (plain textured rectangle) -----------------------
// Generic cladding panel for StorageSystem. `w` spans the panel horizontally
// and `rotY` orients it (0 = faces +/-Z, Math.PI/2 = faces +/-X). One solid
// color; the two-tone wainscot split is composed by stacking two panels (the
// same band semantics as WallPanels' enclosed walls).

function StorageWallPanel({ x, y, z, w, h, rotY = 0, color, ribSiding = true, sidingDirection = "vertical", holes = [] }) {
  const clipped = useMemo(
    () => clipHoles(holes, y - h / 2, y + h / 2).map((o) => ({ ...o, y0: o.y0 - y, y1: o.y1 - y })),
    [holes, y, h]
  );
  const cut = clipped.length > 0;
  const geo = useMemo(() => {
    if (!cut) return null;
    return makeHoledWallShape(
      [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]],
      clipped,
      { width: w, bottomY: -h / 2, eaveY: h / 2 }
    );
  }, [cut, clipped, w, h]);
  useEffect(() => () => { geo?.dispose(); }, [geo]);

  const tex = useMemo(() => {
    if (ribSiding) {
      return createWallSidingTexture(color, sidingDirection, w, h);
    }
    const t = createPanelTexture(color, sidingDirection, 28);
    t.repeat.set(w / PANEL_WIDTH, h / PANEL_WIDTH);
    return t;
  }, [color, ribSiding, sidingDirection, w, h]);

  return (
    <mesh position={[x, y, z]} rotation={[0, rotY, 0]} castShadow receiveShadow>
      {geo ? <primitive object={geo} attach="geometry" /> : <boxGeometry args={[w, h, 0.02]} />}
      <meshStandardMaterial map={tex} normalMap={tex.userData.normalMap} {...WALL_MAT} side={2} />
    </mesh>
  );
}

// ---- STORAGE SLOPE PANEL (trapezoid: flat bottom, sloped top) ------------
// End cap for a storage strip under a sloped roof: hA is the panel height at
// its local -w/2 edge, hB at the +w/2 edge (before rotY). `y` offsets the
// band vertically (used to stack the two-tone wainscot bands).

function StorageSlopePanel({ x, y = 0, z, w, hA, hB, rotY = 0, color, ribSiding = true, sidingDirection = "vertical", holes = [] }) {
  const hMax = Math.max(hA, hB, 0.01);
  // Opening cutouts clipped to this panel's vertical range (two-tone splits),
  // converted to the panel's bottom-origin local coords.
  const clipped = useMemo(
    () => clipHoles(holes, y, y + hMax).map((o) => ({ ...o, y0: o.y0 - y, y1: o.y1 - y })),
    [holes, y, hMax]
  );
  const cut = clipped.length > 0;
  const geo = useMemo(() => {
    if (cut) {
      return makeHoledWallShape(
        [[-w / 2, 0], [w / 2, 0], [w / 2, hB], [-w / 2, hA]],
        clipped,
        { width: w, bottomY: 0, eaveY: hMax }
      );
    }
    const g = new THREE.BufferGeometry();
    const verts = new Float32Array([
      -w / 2, 0, 0, w / 2, 0, 0, w / 2, hB, 0, -w / 2, hA, 0,
    ]);
    // UVs track the geometry position instead of the unit square: on a
    // trapezoid a unit-square UV map is a different affine map per triangle
    // and kinks the siding along the diagonal. Linear UVs keep one affine
    // map across the whole panel so the ribs stay straight and evenly spaced.
    const uvs = new Float32Array([0, 0, 1, 0, 1, hB / hMax, 0, hA / hMax]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [cut, clipped, w, hA, hB, hMax]);

  const tex = useMemo(() => {
    if (ribSiding) {
      // Enclosed walls: fine uniform horizontal ridges (~5in pitch)
      return createWallSidingTexture(color, sidingDirection, w, hMax);
    }
    const t = createPanelTexture(color, sidingDirection, 28);
    t.repeat.set(w / PANEL_WIDTH, hMax / PANEL_WIDTH);
    return t;
  }, [color, ribSiding, sidingDirection, w, hMax]);

  return (
    <mesh position={[x, y, z]} rotation={[0, rotY, 0]} castShadow receiveShadow>
      <primitive object={geo} attach="geometry" />
      <meshStandardMaterial map={tex} normalMap={tex.userData.normalMap} {...WALL_MAT} side={2} />
    </mesh>
  );
}
// Center Storage side in building space. "Left"/"Right" are the building's
// own sides (left = −x); the building group is mirrored on X (MIRROR_X), so
// they already appear on the viewer's left/right when facing the front — no
// extra swap here (the old swap double-flipped after the mirror).
function storageWorldSide(loc) {
  return loc;
}

// ---- CENTER STORAGE (enclosed strip along one wall) ----------------------
// Renders the configurator's "Center Storage": a depthFt-deep enclosed strip
// along the selected wall (front/back/left/right) spanning that wall's full
// run. Surfaces: the outer wall (the building's own wall clad enclosed), an
// interior partition at depthFt inboard, and end caps closing both ends of
// the strip -- skipped where the abutting building wall is already clad (the
// cap would sit hidden behind that cladding). All surfaces rise to the roof
// underside (the nominal rafter line, the same convention as EndWallMesh's
// gable peak) and the side-strip end caps follow the roof slope across the
// strip. Walls use the siding/wainscot colors and the enclosed-wall rib
// texture. Self-contained on purpose: the caller drops the storage-side wall
// from WallPanels (this system owns that cladding) while FrameSystem still
// sees it as clad, so the members behind the cladding stay hidden.

function StorageSystem({ grid, storage, walls = {}, wallColor, twoToneColor, sidingDirection = "vertical", verticalSiding = false, onWallSelect = null, selectedWall = null, onMoveOpening = null, onSelectOpening = null, selectedOpening = null }) {
  const { w, l, h, hLow, halfW, roofPeak, monoSlope } = grid;
  const loc = storageWorldSide(storage?.location);
  const depthFt = Number(storage?.depthFt);
  if (!loc || loc === "none" || !(depthFt > 0)) return null;

  const panelColor = wallColor || "#e0e0e0";
  const openingsMap = storage?.openings || {};
  const ribSiding = true; // horizontal corrugation, matching the roof
  // Small offset that keeps the double-faced opening readably in front of the
  // wall plane (same convention as the main-building WallOpenings).
  const Z_OFFSET = MAIN_TUBE_SKIN;

  // Roof underside (rafter line) height at x -- wall tops meet the roof on
  // the nominal line (peaked: rises toward the ridge; mono: drops tall->short).
  const roofYAt = (x) =>
    monoSlope ? h + (hLow - h) * (x + halfW) / w : h + roofPeak * (halfW - Math.abs(x)) / halfW;

  // front = -z, back = +z, left = -x, right = +x (see ViewCaptureBridge).
  const isSide = loc === "left" || loc === "right";
  const sign = loc === "left" || loc === "front" ? -1 : 1;
  // Strip depth in scene units -- clamped so the open area keeps at least 2ft.
  const span = isSide ? w : l;
  const depth = Math.min(depthFt * SCALE, Math.max(span - 2 * SCALE, 0.2));
  // Wall cladding renders slightly outboard of the column line (same
  // convention as SideWallPanel / EndWallMesh); caps reach that plane too.
  const OUT = MAIN_TUBE * 0.6;

  // Full cladding of height hh with the two-tone wainscot split. Plain
  // function call (not a component) so texture memos stay stable.
  const clad = (x, z, pw, rotY, hh, holes = []) => {
    const s = wainscotSplit(hh);
    return twoToneColor ? (
      <>
        <StorageWallPanel x={x} y={s + (hh - s) / 2} z={z} w={pw} h={hh - s} rotY={rotY} color={panelColor} ribSiding={ribSiding} sidingDirection={sidingDirection} holes={holes} />
        <StorageWallPanel x={x} y={s / 2} z={z} w={pw} h={s} rotY={rotY} color={twoToneColor} ribSiding={ribSiding} sidingDirection={sidingDirection} holes={holes} />
      </>
    ) : (
      <StorageWallPanel x={x} y={hh / 2} z={z} w={pw} h={hh} rotY={rotY} color={panelColor} ribSiding={ribSiding} sidingDirection={sidingDirection} holes={holes} />
    );
  };

  // Sloped end cap (trapezoid) with the two-tone wainscot split: the lower
  // band is a rectangle, the upper band keeps the roof-following slope.
  const cap = (x, z, pw, hA, hB, rotY, holes = []) => {
    if (!twoToneColor) {
      return <StorageSlopePanel x={x} z={z} w={pw} hA={hA} hB={hB} rotY={rotY} color={panelColor} ribSiding={ribSiding} sidingDirection={sidingDirection} holes={holes} />;
    }
    const s = wainscotSplit(Math.min(hA, hB));
    return (
      <>
        <StorageSlopePanel x={x} y={s} z={z} w={pw} hA={hA - s} hB={hB - s} rotY={rotY} color={panelColor} ribSiding={ribSiding} sidingDirection={sidingDirection} holes={holes} />
        <StorageSlopePanel x={x} z={z} w={pw} hA={s} hB={s} rotY={rotY} color={twoToneColor} ribSiding={ribSiding} sidingDirection={sidingDirection} holes={holes} />
      </>
    );
  };

  // A strip end cap is redundant when the abutting building wall already
  // clads that edge (the cap would render hidden behind that cladding).
  const abutsClad = (v) => v === true || v === "enclosed";

  // Render openings (if any) for one storage wall. `place(offset, sillTop)`
  // returns the world { pos, rot } for an item on that wall's plane. `axis`
  // is the world axis the wall runs along ("x" | "z") and `planeNormal` /
  // `planeConst` describe the wall's mid-plane for drag raycasts (the same
  // `normal · point + planeConst = 0` convention as WallOpenings).
  const openingSet = (wallKey, items, wallLen, wallH, place, axis, planeNormal, planeConst) =>
    items && items.length > 0 ? (
      <StorageOpenings
        wallKey={wallKey} items={items} wallLen={wallLen} wallH={wallH} wallColor={panelColor} place={place}
        axis={axis} planeNormal={planeNormal} planeConst={planeConst}
        onMoveOpening={onMoveOpening} onSelectOpening={onSelectOpening} selectedOpening={selectedOpening}
      />
    ) : null;

  if (isSide) {
    // Left/right strip: runs the full length. The partition rises to the roof
    // above it (flat top -- the roof line is constant along the run) and the
    // caps follow the roof slope from the eave up to the partition top.
    const xOuter = sign * (halfW + OUT);
    const xInner = sign * (halfW - depth);
    const outerH = roofYAt(sign * halfW);
    const partH = roofYAt(xInner);
    const capPw = depth + OUT;
    const capX = (xOuter + xInner) / 2;
    // Local -w/2 cap edge maps to world xOuter on the left strip and to
    // xInner on the right strip (rotY = 0 keeps local x on the world x axis).
    const capHA = sign < 0 ? outerH : partH;
    const capHB = sign < 0 ? partH : outerH;
    const capMinH = Math.min(outerH, partH);
    const capZ = l / 2 - 0.02;
    const innerItems = openingsMap.inner || [];
    const outerItems = openingsMap.outer || [];
    const frontCapItems = openingsMap.front_end || [];
    const backCapItems = openingsMap.back_end || [];
    const innerHoles = openingHoles(innerItems, l, partH, true);
    const outerHoles = openingHoles(outerItems, l, outerH, true);
    const frontCapHoles = openingHoles(frontCapItems, capPw, capMinH, false);
    const backCapHoles = openingHoles(backCapItems, capPw, capMinH, false);
    const hasFrontCap = !abutsClad(walls.front);
    const hasBackCap = !abutsClad(walls.back);
    const capOutline = [[-capPw / 2, 0], [capPw / 2, 0], [capPw / 2, capHB], [-capPw / 2, capHA]];
    return (
      <group>
        {/* Outer wall -- the building's side wall clad enclosed, to the eave */}
        {clad(xOuter, 0, l, Math.PI / 2, outerH, outerHoles)}
        {/* Interior partition at depthFt inboard, up to the roof underside */}
        {clad(xInner, 0, l, Math.PI / 2, partH, innerHoles)}
        {openingSet("inner", innerItems, l, partH, (off, y) => ({ pos: [xInner - sign * Z_OFFSET, y, off], rot: [0, -sign * Math.PI / 2, 0] }), "z", [1, 0, 0], -xInner)}
        {openingSet("outer", outerItems, l, outerH, (off, y) => ({ pos: [xOuter + sign * Z_OFFSET, y, off], rot: [0, sign * Math.PI / 2, 0] }), "z", [1, 0, 0], -xOuter)}
        {(onWallSelect || selectedWall) && (
          <>
            <WallPickTarget outline={wallRectangle(l, partH)} position={[xInner, 0, 0]} rotation={[0, Math.PI / 2, 0]}
              target={{ section: "storage", wall: "inner" }} label="Storage Inner Wall" selectedWall={selectedWall} onSelect={onWallSelect} />
            <WallPickTarget outline={wallRectangle(l, outerH)} position={[xOuter, 0, 0]} rotation={[0, Math.PI / 2, 0]}
              target={{ section: "storage", wall: "outer" }} label="Storage Outer Wall" selectedWall={selectedWall} onSelect={onWallSelect} />
            {hasFrontCap && (
              <WallPickTarget outline={capOutline} position={[capX, 0, -capZ]}
                target={{ section: "storage", wall: "front_end" }} label="Front End" selectedWall={selectedWall} onSelect={onWallSelect} />
            )}
            {hasBackCap && (
              <WallPickTarget outline={capOutline} position={[capX, 0, capZ]}
                target={{ section: "storage", wall: "back_end" }} label="Back End" selectedWall={selectedWall} onSelect={onWallSelect} />
            )}
          </>
        )}
        {/* End caps closing the strip at both gable ends */}
        {hasFrontCap && cap(capX, -capZ, capPw, capHA, capHB, 0, frontCapHoles)}
        {hasBackCap && cap(capX, capZ, capPw, capHA, capHB, 0, backCapHoles)}
        {openingSet("front_end", frontCapItems, capPw, capMinH, (off, y) => ({ pos: [capX + off, y, -capZ - Z_OFFSET], rot: [0, Math.PI, 0] }), "x", [0, 0, 1], capZ)}
        {openingSet("back_end", backCapItems, capPw, capMinH, (off, y) => ({ pos: [capX + off, y, capZ + Z_OFFSET], rot: [0, 0, 0] }), "x", [0, 0, 1], -capZ)}
        {/* Corner legs at both ends of the partition */}
        <SteelTube start={[xInner, 0, -capZ]} end={[xInner, partH, -capZ]} size={MAIN_TUBE} />
        <SteelTube start={[xInner, 0, capZ]} end={[xInner, partH, capZ]} size={MAIN_TUBE} />
      </group>
    );
  }

  // Front/back strip: runs the full width. The outer wall is the building's
  // end wall and the partition mirrors its shape (gable pentagon on peaked
  // styles, trapezoid on mono-slope) so both reach the roof. The caps at the
  // side-wall lines are rectangles (the roof line is flat along the length).
  const zOuter = sign * (l / 2 + OUT);
  const zInner = sign * (l / 2 - depth);
  const capPw = depth + OUT;
  const capZ = (zOuter + zInner) / 2;
  const innerItems = openingsMap.inner || [];
  const outerItems = openingsMap.outer || [];
  const leftCapItems = openingsMap.left_end || [];
  const rightCapItems = openingsMap.right_end || [];
  const innerHoles = openingHoles(innerItems, w, h + roofPeak, false);
  const outerHoles = openingHoles(outerItems, w, h + roofPeak, false);
  const leftCapX = halfW - 0.02;
  const rightCapX = -(halfW - 0.02);
  const leftCapH = roofYAt(leftCapX);
  const rightCapH = roofYAt(rightCapX);
  const leftCapHoles = openingHoles(leftCapItems, capPw, leftCapH, true);
  const rightCapHoles = openingHoles(rightCapItems, capPw, rightCapH, true);
  const hasLeftCap = !abutsClad(walls.right);
  const hasRightCap = !abutsClad(walls.left);
  const innerOutline = monoSlope
    ? [[-w / 2, 0], [w / 2, 0], [w / 2, hLow], [-w / 2, h]]
    : [[-w / 2, 0], [w / 2, 0], [w / 2, h], [0, h + roofPeak], [-w / 2, h]];
  return (
    <group>
      {monoSlope ? (
        <MonoEndWall w={w} hTall={h} hShort={hLow} z={sign * l / 2} type="enclosed" color={panelColor} twoToneColor={twoToneColor} splitY={wainscotSplit(hLow)} sidingDirection={sidingDirection} />
      ) : (
        <EndWallMesh w={w} h={h} roofPeak={roofPeak} z={sign * l / 2} type="enclosed" color={panelColor} opacity={1} twoToneColor={twoToneColor} splitY={wainscotSplit(h)} sidingDirection={sidingDirection} ribSiding={ribSiding} holes={outerHoles} />
      )}
      {/* Partition at depthFt inboard -- same shape as the end wall */}
      {monoSlope ? (
        <MonoEndWall w={w} hTall={h} hShort={hLow} z={zInner} type="enclosed" color={panelColor} twoToneColor={twoToneColor} splitY={wainscotSplit(hLow)} sidingDirection={sidingDirection} />
      ) : (
        <EndWallMesh w={w} h={h} roofPeak={roofPeak} z={zInner} type="enclosed" color={panelColor} opacity={1} twoToneColor={twoToneColor} splitY={wainscotSplit(h)} sidingDirection={sidingDirection} ribSiding={ribSiding} holes={innerHoles} />
      )}
      {openingSet("inner", innerItems, w, h, (off, y) => ({ pos: [off, y, zInner - sign * Z_OFFSET], rot: [0, sign > 0 ? Math.PI : 0, 0] }), "x", [0, 0, 1], -zInner)}
      {openingSet("outer", outerItems, w, h, (off, y) => ({ pos: [off, y, zOuter + sign * Z_OFFSET], rot: [0, sign > 0 ? 0 : Math.PI, 0] }), "x", [0, 0, 1], -zOuter)}
      {(onWallSelect || selectedWall) && (
        <>
          <WallPickTarget outline={innerOutline} position={[0, 0, zInner]}
            target={{ section: "storage", wall: "inner" }} label="Storage Inner Wall" selectedWall={selectedWall} onSelect={onWallSelect} />
          <WallPickTarget outline={innerOutline} position={[0, 0, zOuter]}
            target={{ section: "storage", wall: "outer" }} label="Storage Outer Wall" selectedWall={selectedWall} onSelect={onWallSelect} />
          {hasLeftCap && (
            <WallPickTarget outline={wallRectangle(capPw, leftCapH)} position={[leftCapX, 0, capZ]} rotation={[0, Math.PI / 2, 0]}
              target={{ section: "storage", wall: "left_end" }} label="Left End" selectedWall={selectedWall} onSelect={onWallSelect} />
          )}
          {hasRightCap && (
            <WallPickTarget outline={wallRectangle(capPw, rightCapH)} position={[rightCapX, 0, capZ]} rotation={[0, Math.PI / 2, 0]}
              target={{ section: "storage", wall: "right_end" }} label="Right End" selectedWall={selectedWall} onSelect={onWallSelect} />
          )}
        </>
      )}
      {/* End caps closing the strip at both side walls */}
      {hasLeftCap && clad(leftCapX, capZ, capPw, Math.PI / 2, leftCapH, leftCapHoles)}
      {hasRightCap && clad(rightCapX, capZ, capPw, Math.PI / 2, rightCapH, rightCapHoles)}
      {openingSet("left_end", leftCapItems, capPw, leftCapH, (off, y) => ({ pos: [leftCapX + Z_OFFSET, y, capZ + off], rot: [0, Math.PI / 2, 0] }), "z", [1, 0, 0], -leftCapX)}
      {openingSet("right_end", rightCapItems, capPw, rightCapH, (off, y) => ({ pos: [rightCapX - Z_OFFSET, y, capZ + off], rot: [0, -Math.PI / 2, 0] }), "z", [1, 0, 0], -rightCapX)}
      {/* Corner legs at both ends of the partition */}
      <SteelTube start={[leftCapX, 0, zInner]} end={[leftCapX, leftCapH, zInner]} size={MAIN_TUBE} />
      <SteelTube start={[rightCapX, 0, zInner]} end={[rightCapX, rightCapH, zInner]} size={MAIN_TUBE} />
    </group>
  );
}
// Center-storage openings on any storage wall (outer / inner / end caps).
// Renders doors/windows at the wall's plane (double-faced, like the main
// building walls) with the same drag-to-move + selection controls as the
// center-section WallOpenings. `place(offset, sillTop)` returns the world
// { pos, rot } for an item on that wall's plane; `axis` is the world axis the
// wall runs along ("x" | "z") and `planeNormal` / `planeConst` describe the
// wall's mid-plane for drag raycasts (`normal · point + planeConst = 0`).
function StorageOpenings({ wallKey, items = [], wallLen, wallH, wallColor = null, place, axis = "z", planeNormal = [1, 0, 0], planeConst = 0, onMoveOpening = null, onSelectOpening = null, selectedOpening = null }) {
  const { gl, camera, controls } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const dragRef = useRef(null);
  const cbRef = useRef({ onMoveOpening, onSelectOpening });
  useEffect(() => { cbRef.current = { onMoveOpening, onSelectOpening }; }, [onMoveOpening, onSelectOpening]);

  const allItems = useMemo(() => {
    const entries = [];
    items.forEach((it, srcIdx) => {
      const p = parseOpening(it);
      if (p) entries.push({ ...p, it, wall: wallKey, srcIdx });
    });
    const count = entries.length;
    const spacing = wallLen / (count + 1);
    return entries.map((e, idx) => ({
      ...e,
      offset: e.it.posFt != null ? Number(e.it.posFt) * SCALE : spacing * (idx + 1) - wallLen / 2,
    }));
  }, [items, wallLen, wallKey]);

  // Open/closed state per opening — double-clicking a door toggles its
  // open/close animation.
  const [openMap, setOpenMap] = useState({});

  // Shared drag plane for this wall.
  const plane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(planeNormal[0], planeNormal[1], planeNormal[2]), planeConst),
    [planeNormal, planeConst]
  );

  // ─── DRAG TO MOVE (slides the item along its storage wall) ───
  const handleDragMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    // Building is mirrored on X — bring the ray into building space so the
    // wall planes / offsets below stay in building coordinates.
    raycaster.ray.applyMatrix4(MIRROR_MATRIX);
    const out = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(d.plane, out)) return;
    const raw = d.axis === "z" ? out.z : out.x;
    const clamped = Math.max(-d.maxOff, Math.min(d.maxOff, raw));
    const sillFt = d.canY
      ? Math.max(0, Math.min(d.maxSill, out.y - d.oh / 2)) / SCALE
      : 0;
    cbRef.current.onMoveOpening?.(d.wall, d.srcIdx, clamped / SCALE, sillFt);
  }, [gl, camera, raycaster]);

  const moveFnRef = useRef(() => {});
  const endFnRef = useRef(() => {});

  const handleDragEnd = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    lastOpeningDragEnd = performance.now();
    // eslint-disable-next-line react-hooks/immutability -- OrbitControls (useThree) is toggled imperatively while dragging
    if (controls) controls.enabled = true;
    // eslint-disable-next-line react-hooks/immutability -- the canvas cursor is managed imperatively while dragging
    gl.domElement.style.cursor = "";
    if (d.pointerId != null) gl.domElement.releasePointerCapture?.(d.pointerId);
  }, [gl, controls]);

  useEffect(() => { moveFnRef.current = handleDragMove; }, [handleDragMove]);
  useEffect(() => { endFnRef.current = handleDragEnd; }, [handleDragEnd]);
  useEffect(() => {
    const move = (e) => moveFnRef.current(e);
    const up = () => endFnRef.current();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const handleDragStart = useCallback((e, item) => {
    cbRef.current.onSelectOpening?.(item.wall, item.srcIdx);
    if (!cbRef.current.onMoveOpening) return;
    e.stopPropagation();
    // The wall's mid-plane — intersecting it with the camera ray yields a
    // stable world position even while the pointer leaves the opening meshes.
    const ow = Math.min(item.wFt * SCALE, wallLen - 0.05);
    const oh = Math.min(item.hFt * SCALE, wallH - 0.02);
    const maxOff = wallLen / 2 - ow / 2 - 0.25 * SCALE;
    dragRef.current = {
      wall: item.wall, srcIdx: item.srcIdx,
      plane, axis,
      maxOff, pointerId: e.pointerId,
      canY: isYmovable(item.type), oh, maxSill: Math.max(0, wallH - 0.02 - oh),
    };
    // eslint-disable-next-line react-hooks/immutability -- OrbitControls (useThree) is toggled imperatively while dragging
    if (controls) controls.enabled = false;
    // eslint-disable-next-line react-hooks/immutability -- the canvas cursor is managed imperatively while dragging
    gl.domElement.style.cursor = "grabbing";
    gl.domElement.setPointerCapture?.(e.pointerId);
  }, [gl, controls, plane, axis, wallLen, wallH]);

  // Callout labels sit just in front of the door face (same extra 0.45 as the
  // center WallOpenings): derive the wall's outward direction from the door's
  // placement relative to the wall mid-plane.
  const outward = useMemo(() => {
    const n = new THREE.Vector3(planeNormal[0], planeNormal[1], planeNormal[2]);
    const sample = place(0, 0).pos;
    const d = n.x * sample[0] + n.y * sample[1] + n.z * sample[2] + planeConst;
    const dir = (d >= 0 ? n : n.clone().negate()).multiplyScalar(0.45);
    return [dir.x, dir.y, dir.z];
  }, [planeNormal, planeConst, place]);

  return (
    <group>
      {allItems.map((item, i) => {
        const ow = Math.min(item.wFt * SCALE, wallLen - 0.05);
        const oh = Math.min(item.hFt * SCALE, wallH - 0.02);
        const sill = isYmovable(item.type)
          ? Math.min(Math.max(0, Number(item.it?.sillFt ?? 0) * SCALE), Math.max(0, wallH - 0.02 - oh))
          : 0;
        const { pos, rot } = place(item.offset, sill + oh / 2);
        const openKey = `storage-${wallKey}:${i}`;
        const isSelected = !!selectedOpening && selectedOpening.wall === item.wall && selectedOpening.idx === item.srcIdx;
        return (
          <group key={`storage-opening-${i}`}>
            <group position={pos} rotation={rot}
              onPointerDown={(e) => handleDragStart(e, item)}
              onDoubleClick={(e) => { e.stopPropagation(); setOpenMap((prev) => ({ ...prev, [openKey]: !prev[openKey] })); }}>
              <Opening3D ow={ow} oh={oh} type={item.type} itemName={item.it?.name} wallColor={wallColor} open={!!openMap[openKey]} />
              {/* Interior face — same assembly rotated 180° (reads as one door
                  from either side of the wall) */}
              <group rotation={[0, Math.PI, 0]}>
                <Opening3D ow={ow} oh={oh} type={item.type} itemName={item.it?.name} wallColor={wallColor} open={!!openMap[openKey]} flip />
              </group>
            </group>
            {isSelected && <StorageOpeningCallouts offset={item.offset} ow={ow} oh={oh} sill={sill} wallLen={wallLen} place={place} outward={outward} />}
          </group>
        );
      })}
    </group>
  );
}

// ─── MONO-SLOPE BUILDING (Free Standing Lean To) ─────────
// Standalone single-slope shelter: one roof plane from the tall "Back" eave
// (x = -halfW) down to the short "Front" eave (x = +halfW) across the width —
// the IdeaRoom reference "Free Standing Lean To (12×20×9×7)".
// Self-contained on purpose: the peaked Frame/Roof/Trim systems stay untouched
// (zero regression risk). Reuses SteelTube / SteelFlatBar /
// createRibPanelGeometry so members and skin match the main engine.
//   ├── Portal frames per bay: tall + short posts, one sloped rafter
//   ├── Knee (haunch) braces at both posts
//   ├── Eave struts + base rails; flat-strap purlins under the skin
//   └── Walls: side walls are rectangles at each eave height; front/back ends
//       are trapezoids (tall -X edge → short +X edge).
// Known limit (documented): attached lean-tos assume a peaked host — this
// style simply won't offer them (no lean-to compat rows needed).

function MonoSlopeBuilding({ grid, roofStyle, roofColor, wallColor, twoToneColor, trimColor = TRIM_COLOR, walls = {}, sidingDirection = "vertical", wallSiding = {}, roofDir = "vertical", roofExtension = 0 }) {
  const { w, l, h, hLow, halfW, bayPositions, ovEX, ovEY, slopeDirX, slopeDirY, roofPeak } = grid;
  const preset = getPreset(roofStyle);
  const color = roofColor || "#cc0000";
  const drop = roofPeak; // eave-to-eave drop (== grid.roofPeak in mono mode)
  const zF = -l / 2, zB = l / 2;
  // Roof extension (scene units). Default: open bay beyond the enclosed back
  // end (+Z) on outer posts (roofExt). Loafing Shed (roofExtensionSide
  // "tall"): an awning off the tall (-X) eave instead (sideExt, see AWNING).
  const extOnTall = preset.roofExtensionSide === "tall";
  const roofExt = extOnTall ? 0 : roofExtension * SCALE;
  const sideExt = extOnTall ? roofExtension * SCALE : 0;

  const hasLeft = !!walls.left;
  const hasRight = !!walls.right;
  const hasFront = !!walls.front;
  const hasBack = !!walls.back;

  // ─── LOAFING SHED LAYOUT ────────────────────────────
  // Reference "Loafing Shed 12×30×12×9": an enclosed storage room at the
  // front end (-Z) closed off by a full-width cross wall. The tall (-X) side
  // is clad only across that room and open over the stall beyond it, carried
  // by a few posts instead of one per bay. Only while the tall side is fully
  // enclosed — any other wall setup keeps the plain shed.
  const loafingSpec = preset.loafing && (walls.left === true || walls.left === "enclosed") ? preset.loafing : null;
  const storageL = loafingSpec ? Math.min(loafingSpec.storageFt * SCALE, l / 2) : 0;
  const zPart = zF + storageL; // cross (partition) wall line
  // Tall-side posts across the open stall: the partition edge plus evenly
  // spaced intermediates (the back-end corner post stays on the bay grid).
  const openPostZs = useMemo(() => {
    if (!loafingSpec) return [];
    const n = Math.max(0, loafingSpec.openSidePosts ?? 1);
    const zs = [zPart];
    for (let i = 1; i <= n; i++) zs.push(zPart + ((zB - zPart) * i) / (n + 1));
    return zs;
  }, [loafingSpec, zPart, zB]);

  // Roof-plane outward normal (up-facing): the slope runs (-X, high) → (+X, low)
  const nX = slopeDirY, nY = slopeDirX;
  const strapsVisible = preset.hasPurlins && !(hasLeft || hasRight || hasFront || hasBack);
  const PURLIN_SIT = MAIN_TUBE / 2 + STRAP_T / 2;
  const ROOF_LIFT = roofStack(preset, strapsVisible) / Math.max(slopeDirX, 0.1);

  // ─── FRAME ──────────────────────────────────────────
  const members = useMemo(() => {
    const m = [];
    for (const z of bayPositions) {
      // Loafing Shed: tall-side bay posts across the open stall (from the
      // partition line up to, not including, the back-end corner) are
      // replaced by the wider-spaced openPostZs posts below. Rafters stay on
      // every bay, carried there by the tall eave strut.
      const skipTall = !!loafingSpec && z > zPart - 1e-3 && z < zB - 1e-3;
      // Posts — tall ("Back") at -X, short ("Front") at +X. Always visible.
      if (!skipTall) m.push({ s: [-halfW, 0, z], e: [-halfW, h, z], t: MAIN_TUBE });
      m.push({ s: [halfW, 0, z], e: [halfW, hLow, z], t: MAIN_TUBE });
      // Rafter — one sloped member across the width
      m.push({ s: [-halfW, h, z], e: [halfW, hLow, z], t: MAIN_TUBE });

      // Knee (haunch) braces at both posts — 10% down the post, 10% up the
      // rafter (same proportions as the peaked frame's corner braces).
      if (preset.kneeBraces) {
        const HAUNCH_DROP = 0.10;
        const HAUNCH_RUN = 0.10;
        // Tall side: post → rafter point 10% down the slope (none where the
        // open-stall post was removed)
        if (!skipTall) {
          m.push({
            s: [-halfW, h * (1 - HAUNCH_DROP), z],
            e: [-halfW + w * HAUNCH_RUN, h - drop * HAUNCH_RUN, z],
            t: SECONDARY_TUBE,
          });
        }
        // Short side: post → rafter point 10% up from the low eave
        m.push({
          s: [halfW, hLow * (1 - HAUNCH_DROP), z],
          e: [halfW - w * HAUNCH_RUN, hLow + drop * HAUNCH_RUN, z],
          t: SECONDARY_TUBE,
        });
      }
    }

    // Loafing Shed: tall-side posts across the open stall (partition edge +
    // intermediates), replacing the skipped bay posts above.
    for (const z of openPostZs) {
      m.push({ s: [-halfW, 0, z], e: [-halfW, h, z], t: MAIN_TUBE });
    }

    // Outer portal frame at the back end + extension (open covered area).
    if (roofExt > 0) {
      const outerZ = zB + roofExt;
      // Outer posts — tall at -X, short at +X.
      m.push({ s: [-halfW, 0, outerZ], e: [-halfW, h, outerZ], t: MAIN_TUBE });
      m.push({ s: [halfW, 0, outerZ], e: [halfW, hLow, outerZ], t: MAIN_TUBE });
      // Outer rafter — sloped member across the width at the extension.
      m.push({ s: [-halfW, h, outerZ], e: [halfW, hLow, outerZ], t: MAIN_TUBE });
      // Knee braces at outer posts.
      if (preset.kneeBraces) {
        const HAUNCH_DROP = 0.10;
        const HAUNCH_RUN = 0.10;
        m.push({
          s: [-halfW, h * (1 - HAUNCH_DROP), outerZ],
          e: [-halfW + w * HAUNCH_RUN, h - drop * HAUNCH_RUN, outerZ],
          t: SECONDARY_TUBE,
        });
        m.push({
          s: [halfW, hLow * (1 - HAUNCH_DROP), outerZ],
          e: [halfW - w * HAUNCH_RUN, hLow + drop * HAUNCH_RUN, outerZ],
          t: SECONDARY_TUBE,
        });
      }
    }

    // Eave struts — define the roof edge silhouette along the length.
    // Extended to the outer posts when a roof extension is present.
    m.push({ s: [-halfW, h, zF], e: [-halfW, h, zB + roofExt], t: SECONDARY_TUBE });
    m.push({ s: [halfW, hLow, zF], e: [halfW, hLow, zB + roofExt], t: SECONDARY_TUBE });

    // Base rails — footer channel at the foot of the side walls (hidden when
    // that side's cladding covers it)
    const railY = BASE_RAIL_TUBE / 2;
    if (!hasLeft) m.push({ s: [-halfW, railY, zF], e: [-halfW, railY, zB + roofExt], t: BASE_RAIL_TUBE });
    if (!hasRight) m.push({ s: [halfW, railY, zF], e: [halfW, railY, zB + roofExt], t: BASE_RAIL_TUBE });

    // Purlins — flat straps against the skin underside, running the length,
    // lifted along the roof normal so the wide face hugs the skin.
    if (strapsVisible) {
      const PURLIN_COUNT = 3;
      for (let pi = 1; pi <= PURLIN_COUNT; pi++) {
        const t = pi / (PURLIN_COUNT + 1);
        const px = -halfW + w * t + nX * PURLIN_SIT;
        const py = h - drop * t + nY * PURLIN_SIT;
        m.push({ s: [px, py, zF], e: [px, py, zB + roofExt], f: { w: STRAP_W, t: STRAP_T, n: [nX, nY, 0] } });
      }
    }
    return m;
  }, [w, h, hLow, halfW, drop, bayPositions, preset, strapsVisible, nX, nY, hasLeft, hasRight, zF, zB, PURLIN_SIT, roofExt, loafingSpec, zPart, openPostZs]);

  // ─── WALL STATE ─────────────────────────────────────
  const wallType = (wall) => {
    const v = walls[wall];
    if (!v) return null;
    return v === true ? "enclosed" : v;
  };

  // Roof overhang past the front end wall (-Z) — Loafing Shed reference look
  // (profile rendering.frontOverhangFt). 0 for every other mono-slope style.
  const frontOv = (preset.frontOverhangFt ?? 0) * SCALE;

  // ─── AWNING (Loafing Shed Roof Extension) ───────────
  // Off the tall (-X) eave, sloping DOWN away from the building at the main
  // roof's pitch, full length (front overhang included), no posts — carried
  // by rafter tails at each bay. The main roof stops at the break line so
  // the two planes meet in a peak at the tall eave.
  const slopeK = drop / w; // rise per unit run of the main roof
  const breakX = -halfW - MAIN_TUBE * 0.5;
  const breakY = h + MAIN_TUBE * 0.5 * slopeK;
  const awnOutX = breakX - sideExt;
  const awnOutY = breakY - sideExt * slopeK;

  // ─── ROOF SKIN — one rib-panel plane (same R-panel as the main roof) ──
  const roofGeo = useMemo(() => {
    // Edge points: extend past the posts (overhang + tube cover) ALONG the
    // rafter slope, then lift the skin above the straps/rafters (ROOF_LIFT).
    // The vertical reach must follow the slope (rise = run × drop / w): with
    // only ovEY of rise for the whole `ext` run, the skin came out flatter
    // than the rafters, dipped below them on the tall half, and the white
    // rafter tops showed through the roof.
    const ext = MAIN_TUBE * 0.8 + ovEX;
    const extY = ext * (drop / w);
    return createRibPanelGeometry({
      zF: zF - ext - frontOv,
      zB: zB + ext + roofExt,
      eave: [halfW + ext, hLow - extY + ROOF_LIFT],   // low ("Front") edge
      // High ("Back") edge — stops at the break line when the awning is on.
      ridge: sideExt > 0
        ? [breakX, breakY + ROOF_LIFT]
        : [-(halfW + ext), h + extY + ROOF_LIFT],
      dir: roofDir,
    });
  }, [halfW, w, h, hLow, drop, ovEX, ROOF_LIFT, zF, zB, roofDir, roofExt, frontOv, sideExt, breakX, breakY]);

  // Dispose rebuilt/unmounted roof geometry
  useEffect(() => () => roofGeo?.dispose(), [roofGeo]);

  // Awning skin — same R-panel, from the break line (high) down to its
  // outer edge (low), same length as the main roof.
  const awningGeo = useMemo(() => {
    if (sideExt <= 0) return null;
    const ext = MAIN_TUBE * 0.8 + ovEX;
    return createRibPanelGeometry({
      zF: zF - ext - frontOv,
      zB: zB + ext,
      eave: [awnOutX, awnOutY + ROOF_LIFT], // outer (low) edge
      ridge: [breakX, breakY + ROOF_LIFT],  // tall eave (break line)
      dir: roofDir,
    });
  }, [sideExt, ovEX, zF, zB, frontOv, awnOutX, awnOutY, breakX, breakY, ROOF_LIFT, roofDir]);

  useEffect(() => () => awningGeo?.dispose(), [awningGeo]);

  // Rafter-tail end (just inside the awning's outer edge), on the line
  // through the tall post tops, parallel to the awning skin.
  const tailEndX = awnOutX + MAIN_TUBE * 0.5;
  const tailEndY = h - (-halfW - tailEndX) * slopeK;

  // ─── TRIM — sloped rakes at both ends + eave lines along the length ──
  // Front rake sits out at the front overhang; the eave trims run to it.
  // With the awning, the tall points sit on the break line (peak) instead.
  const tallF = sideExt > 0 ? [breakX, breakY, zF - frontOv] : [-halfW - ovEX, h + ovEY, zF - frontOv];
  const tallB = sideExt > 0 ? [breakX, breakY, zB] : [-halfW - ovEX, h + ovEY, zB];
  // Awning outer-edge trim points.
  const awnF = [awnOutX, awnOutY, zF - frontOv];
  const awnB = [awnOutX, awnOutY, zB];
  const shortF = [halfW + ovEX, hLow - ovEY, zF - frontOv];
  const shortB = [halfW + ovEX, hLow - ovEY, zB];
  // Outer trim points at the back end + extension.
  const tallOuter = roofExt > 0 ? [-halfW - ovEX, h + ovEY, zB + roofExt] : null;
  const shortOuter = roofExt > 0 ? [halfW + ovEX, hLow - ovEY, zB + roofExt] : null;

  // ─── WALLS ──────────────────────────────────────────
  // Side walls are rectangles at their own eave height (mirrors WallPanels'
  // renderSideWall: partial "top_X" strips + two-tone splits included).
  // Same band semantics as WallPanels: "top_N" and "ext_gable_N" both render
  // an N-ft band at the top (see parsePanelBand).
  const parseTopPanel = parsePanelBand;

  // Per-wall siding direction override (custom walls); falls back to global.
  const wallDir = (wall) => wallSiding[wall] || sidingDirection;

  // `len` (scene units, default full length) lets the Loafing Shed clad only
  // the storage-room part of the tall side; the panel stays centered at z = 0,
  // so callers position a shortened wall with a wrapping <group>.
  const renderMonoSide = (x, wallKey, wallH, len = l) => {
    const wt = wallType(wallKey);
    if (!wt) return null;
    const ribSiding = wt === "enclosed";
    const dir = wallDir(wallKey);
    const topFt = parseTopPanel(wt);
    if (topFt) {
      const panelH = topFt * SCALE;
      return <SideWallPanel key={wallKey} x={x} y={wallH - panelH / 2} h={panelH} l={len} color={wallColor} opacity={1} sidingDirection={dir} ribSiding={ribSiding} />;
    }
    if (!twoToneColor) {
      return <SideWallPanel key={wallKey} x={x} h={wallH} l={len} color={wallColor} opacity={1} sidingDirection={dir} ribSiding={ribSiding} />;
    }
    const split = wainscotSplit(wallH);
    return (
      <group key={wallKey}>
        <SideWallPanel x={x} y={split + (wallH - split) / 2} h={wallH - split} l={len} color={wallColor} opacity={1} sidingDirection={dir} ribSiding={ribSiding} />
        <SideWallPanel x={x} y={split / 2} h={split} l={len} color={twoToneColor} opacity={1} sidingDirection={dir} ribSiding={ribSiding} />
      </group>
    );
  };

  return (
    <group>
      {/* Frame — posts, rafter, knee braces, eave struts, base rails, purlins */}
      {members.map((mem, i) =>
        mem.f ? (
          <SteelFlatBar key={`f${i}`} start={mem.s} end={mem.e} width={mem.f.w} thickness={mem.f.t} normal={mem.f.n} />
        ) : (
          <SteelTube key={`f${i}`} start={mem.s} end={mem.e} size={mem.t} />
        )
      )}

      {/* Roof skin — one rib-panel plane, ribs running down the slope */}
      <mesh geometry={roofGeo} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={0} polygonOffsetUnits={-1} />
      </mesh>

      {/* Awning (Loafing Shed Roof Extension) — skin, rafter tails, trims */}
      {awningGeo && (
        <>
          <mesh geometry={awningGeo} castShadow receiveShadow>
            <meshStandardMaterial color={color} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={0} polygonOffsetUnits={-1} />
          </mesh>
          {bayPositions.map((z, i) => (
            <SteelTube key={`awn-tail-${i}`} start={[-halfW, h, z]} end={[tailEndX, tailEndY, z]} size={SECONDARY_TUBE} />
          ))}
          <SteelTube start={awnF} end={awnB} size={MAIN_TUBE} color={trimColor} />
          <SteelTube start={tallF} end={awnF} size={MAIN_TUBE} color={trimColor} />
          <SteelTube start={tallB} end={awnB} size={MAIN_TUBE} color={trimColor} />
        </>
      )}

      {/* Trim — sloped rakes at both ends + eave lines along the length */}
      <SteelTube start={tallF} end={shortF} size={MAIN_TUBE} color={trimColor} />
      <SteelTube start={tallB} end={shortB} size={MAIN_TUBE} color={trimColor} />
      <SteelTube start={tallF} end={tallB} size={MAIN_TUBE} color={trimColor} />
      <SteelTube start={shortF} end={shortB} size={MAIN_TUBE} color={trimColor} />
      {tallOuter && shortOuter && (
        <>
          <SteelTube start={tallB} end={tallOuter} size={MAIN_TUBE} color={trimColor} />
          <SteelTube start={shortB} end={shortOuter} size={MAIN_TUBE} color={trimColor} />
          <SteelTube start={tallOuter} end={shortOuter} size={MAIN_TUBE} color={trimColor} />
        </>
      )}

      {/* Walls — side rectangles + trapezoid ends. Loafing Shed: the tall
          side is clad only across the storage room (open over the stall). */}
      {loafingSpec ? (
        <group position={[0, 0, zF + storageL / 2]}>
          {renderMonoSide(-halfW, "left", h, storageL)}
        </group>
      ) : (
        renderMonoSide(-halfW, "left", h)
      )}
      {renderMonoSide(halfW, "right", hLow)}
      {hasFront && (
        <MonoEndWall w={w} hTall={h} hShort={hLow} z={-l / 2} type={wallType("front")} color={wallColor} twoToneColor={twoToneColor} splitY={wainscotSplit(hLow)} sidingDirection={wallDir("front")} />
      )}
      {hasBack && (
        <MonoEndWall w={w} hTall={h} hShort={hLow} z={l / 2} type={wallType("back")} color={wallColor} twoToneColor={twoToneColor} splitY={wainscotSplit(hLow)} sidingDirection={wallDir("back")} />
      )}

      {/* Loafing Shed — cross (partition) wall closing off the storage room */}
      {loafingSpec && (
        <MonoEndWall w={w} hTall={h} hShort={hLow} z={zPart} type="enclosed" color={wallColor} twoToneColor={twoToneColor} splitY={wainscotSplit(hLow)} sidingDirection={wallDir("front")} />
      )}

      {/* Loafing Shed — trim-colored corner posts at the front end, the
          partition line and the back end (sized past the siding so the
          trim color shows at each wall edge, as in the reference). */}
      {loafingSpec && [zF, zPart, zB].map((z, i) => (
        <group key={`loafing-trim-${i}`}>
          <SteelTube start={[-halfW, 0, z]} end={[-halfW, h, z]} size={MAIN_TUBE * 1.5} color={trimColor} />
          <SteelTube start={[halfW, 0, z]} end={[halfW, hLow, z]} size={MAIN_TUBE * 1.5} color={trimColor} />
        </group>
      ))}

      {/* Loafing Shed — light-gray inside face of the short wall across the
          open stall (the reference's unpainted interior). Faces inward only;
          sits between the posts and the siding. */}
      {loafingSpec && hasRight && (
        <mesh position={[halfW + MAIN_TUBE * 0.5 + 0.003, hLow / 2, (zPart + zB) / 2]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[zB - zPart, hLow]} />
          <meshStandardMaterial color="#d6d6d6" roughness={0.8} metalness={0.05} />
        </mesh>
      )}
    </group>
  );
}

// ─── MONO-SLOPE END WALL (trapezoid: tall -X edge → short +X edge) ──
// Types: "enclosed" (full trapezoid), "gable" (wedge above the low eave),
// "top_X" (X-ft strip hanging from the sloped top edge), "ext_gable_X"
// (wedge + X-ft strip below the sloped top edge, custom walls). Two-tone
// supported on the full trapezoid (lower band in twoToneColor).

// Siding UVs for mono-slope end walls, anchored to real wall height: u runs
// across the width, v = y / hTall. Siding ridges then stay level and evenly
// spaced on the sloped trapezoid (pinning v = 1 to both top corners squeezed
// the siding toward the low side, so the lines fanned). Module-level so the
// geometry memos below stay self-contained.
function setMonoWallUVs(geometry, w, hTall) {
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    uv[i * 2] = (pos.getX(i) + w / 2) / w;
    uv[i * 2 + 1] = pos.getY(i) / hTall;
  }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
}

function MonoEndWall({ w, hTall, hShort, z, type, color, twoToneColor = null, splitY = 0, sidingDirection = "vertical" }) {
  const sign = z > 0 ? 1 : -1;
  const wallZ = z + sign * (MAIN_TUBE * 0.6);
  const topFt = (typeof type === "string" && type.startsWith("top_")) ? parseFloat(type.replace("top_", "")) : null;
  const isTopPanel = topFt != null && !isNaN(topFt);
  // Extended gable (custom walls): wedge above the low eave PLUS an N-ft strip
  // hanging below the sloped top edge — rendered as two meshes (wedge + strip)
  // reusing the gable/top-panel shapes below.
  const extGableFt = (typeof type === "string" && type.startsWith("ext_gable_")) ? parseFloat(type.replace("ext_gable_", "")) : null;
  const isExtGable = extGableFt != null && !isNaN(extGableFt);
  const isGable = type === "gable" || isExtGable;
  const ribSiding = type === "enclosed";
  // Texture builders are inlined per-memo (not via a shared closure) so the
  // React Compiler can preserve the memoization — same pattern as EndWallMesh.
  // Repeat is sized on the TALL height: every piece's UVs are v = y / hTall
  // (setMonoWallUVs), so ridges keep one real-world pitch from the floor up,
  // level across the slope and lined up with the side walls.
  const upperTex = useMemo(() => {
    if (ribSiding) {
      return createWallSidingTexture(color, sidingDirection, w, hTall);
    }
    const t = createPanelTexture(color, sidingDirection, 28);
    t.repeat.set(w / PANEL_WIDTH, hTall / PANEL_WIDTH);
    return t;
  }, [color, ribSiding, sidingDirection, w, hTall]);
  const lowerTex = useMemo(() => {
    if (!twoToneColor || isTopPanel || isGable) return null;
    if (ribSiding) {
      return createWallSidingTexture(twoToneColor, sidingDirection, w, hTall);
    }
    const t = createPanelTexture(twoToneColor, sidingDirection, 28);
    t.repeat.set(w / PANEL_WIDTH, hTall / PANEL_WIDTH);
    return t;
  }, [twoToneColor, isTopPanel, isGable, ribSiding, sidingDirection, w, hTall]);

  // Panel strip below the low eave (ext_gable_N) — same semantics as
  // EndWallMesh's extended gable: strip from (hShort - N') to hShort across
  // the full width, with the gable wedge above it. Rendered as an extra mesh.
  const extStripGeo = useMemo(() => {
    if (!isExtGable) return null;
    const g = new THREE.BufferGeometry();
    const pH = extGableFt * SCALE;
    const verts = new Float32Array([
      -w / 2, hShort - pH, wallZ, w / 2, hShort - pH, wallZ, w / 2, hShort, wallZ, -w / 2, hShort, wallZ,
    ]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    setMonoWallUVs(g, w, hTall);
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [w, hTall, hShort, wallZ, isExtGable, extGableFt]);

  const upperGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    let verts, idx;
    if (isTopPanel) {
      // Strip hanging from the sloped top edge
      const pH = topFt * SCALE;
      verts = new Float32Array([
        -w / 2, hTall, wallZ, w / 2, hShort, wallZ, w / 2, hShort - pH, wallZ, -w / 2, hTall - pH, wallZ,
      ]);
      idx = [0, 1, 2, 0, 2, 3];
    } else if (isGable) {
      // Wedge above the low eave line
      verts = new Float32Array([-w / 2, hShort, wallZ, w / 2, hShort, wallZ, -w / 2, hTall, wallZ]);
      idx = [0, 1, 2];
    } else if (twoToneColor) {
      const s = Math.min(splitY, hShort * 0.9);
      verts = new Float32Array([
        -w / 2, s, wallZ, w / 2, s, wallZ, w / 2, hShort, wallZ, -w / 2, hTall, wallZ,
      ]);
      idx = [0, 1, 2, 0, 2, 3];
    } else {
      verts = new Float32Array([
        -w / 2, 0, wallZ, w / 2, 0, wallZ, w / 2, hShort, wallZ, -w / 2, hTall, wallZ,
      ]);
      idx = [0, 1, 2, 0, 2, 3];
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    setMonoWallUVs(g, w, hTall);
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [w, hTall, hShort, wallZ, isTopPanel, topFt, isGable, twoToneColor, splitY]);

  const lowerGeo = useMemo(() => {
    if (!twoToneColor || isTopPanel || isGable) return null;
    const s = Math.min(splitY, hShort * 0.9);
    const g = new THREE.BufferGeometry();
    const verts = new Float32Array([-w / 2, 0, wallZ, w / 2, 0, wallZ, w / 2, s, wallZ, -w / 2, s, wallZ]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    setMonoWallUVs(g, w, hTall);
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [w, hTall, wallZ, isTopPanel, isGable, twoToneColor, splitY, hShort]);

  return (
    <group>
      <mesh geometry={upperGeo} castShadow>
        <meshStandardMaterial map={upperTex} normalMap={upperTex.userData.normalMap} {...WALL_MAT} side={2} />
      </mesh>
      {extStripGeo && (
        <mesh geometry={extStripGeo} castShadow>
          <meshStandardMaterial map={upperTex} normalMap={upperTex.userData.normalMap} {...WALL_MAT} side={2} />
        </mesh>
      )}
      {lowerGeo && lowerTex && (
        <mesh geometry={lowerGeo} castShadow>
          <meshStandardMaterial map={lowerTex} normalMap={lowerTex.userData.normalMap} {...WALL_MAT} side={2} />
        </mesh>
      )}
    </group>
  );
}

// ─── WALL OPENINGS (doors, windows, rollup doors) ─────────

// Opening dimension parser
const MAIN_TUBE_SKIN = MAIN_TUBE * 0.6 + 0.005;

// Opening types that may sit above the floor (vertical drag / sillFt).
// Walk-in doors and rollup doors must meet the floor, so their sill is 0.
const Y_MOVABLE_TYPES = new Set(["window", "vent", "frameout"]);
const isYmovable = (type) => Y_MOVABLE_TYPES.has(type);

// ─── STRUCTURAL LEG ADJUSTMENT ─────────────────────────────
// Scene-unit axis spans covered by a wall's openings (auto layout matches the
// WallOpenings / LeanToOpenings spacing; user-dragged items use posFt).
function openingAxisSpans(items, wallLenScene, margin = 0) {
  const parsed = (items || []).map((it) => ({ it, p: parseOpening(it) })).filter((x) => x.p);
  if (parsed.length === 0) return [];
  const spacing = wallLenScene / (parsed.length + 1);
  return parsed.map(({ it, p }, idx) => {
    const c = it.posFt != null ? Number(it.posFt) * SCALE : spacing * (idx + 1) - wallLenScene / 2;
    const half = (p.wFt * SCALE) / 2 + margin;
    return [c - half, c + half];
  });
}

// Legs "adjust" around openings: a leg that would cross an opening hugs the
// nearest opening edge instead of running through it (reference behavior).
function adjustLegAxis(v, spans) {
  let out = v;
  for (const [lo, hi] of spans) {
    if (out > lo && out < hi) out = out <= (lo + hi) / 2 ? lo : hi;
  }
  return out;
}

// ─── WALL OPENING CUTOUTS ─────────────────────────────────
// THREE.Shape from outline points (wall-plane coords) with rectangular holes
// cut for wall openings — so an open door reveals the building interior.
// `uvProfile` reproduces the uncut mesh's normalized UVs. Keeping those UVs
// and the original texture repeat prevents stretched/denser siding when an
// opening is added. Rectangles only need width/bottomY/eaveY; pentagons also
// provide peakY and the uncut mesh's V coordinate at the eave (eaveV).
function makeHoledWallShape(outline, holes = [], uvProfile = null) {
  const shape = new THREE.Shape();
  outline.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  for (const hole of holes) {
    const x0 = hole.cx - hole.w / 2;
    const x1 = hole.cx + hole.w / 2;
    const y0 = hole.y0;
    const y1 = hole.y1;
    if (!(x1 > x0) || !(y1 > y0)) continue;
    const p = new THREE.Path();
    p.moveTo(x0, y0);
    p.lineTo(x1, y0);
    p.lineTo(x1, y1);
    p.lineTo(x0, y1);
    p.closePath();
    shape.holes.push(p);
  }

  const geometry = new THREE.ShapeGeometry(shape);
  if (uvProfile) {
    const { width, bottomY, eaveY, peakY = eaveY, eaveV = 1 } = uvProfile;
    const safeWidth = Math.max(width, 1e-6);
    const lowerSpan = Math.max(eaveY - bottomY, 1e-6);
    const upperSpan = Math.max(peakY - eaveY, 1e-6);
    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const u = (x + width / 2) / safeWidth;
      const v = y <= eaveY
        ? eaveV * ((y - bottomY) / lowerSpan)
        : eaveV + (1 - eaveV) * ((y - eaveY) / upperSpan);
      uvs.setXY(i, Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)));
    }
    uvs.needsUpdate = true;
  }
  return geometry;
}

// Opening hole rects for a wall: cx along the wall (wall-plane x), y0/y1 the
// opening's bottom/top heights (y0 = sill, above the floor for windows/vents/
// frameouts; doors sit at 0). mirrorX flips cx for walls whose local +x maps
// to world -z (the rotated side-wall panels).
function openingHoles(items, wallLenScene, yMax, mirrorX = false) {
  const parsed = (items || []).map((it) => ({ it, p: parseOpening(it) })).filter((x) => x.p);
  const spacing = wallLenScene / (parsed.length + 1);
  return parsed.map(({ it, p }, idx) => {
    const off = it.posFt != null ? Number(it.posFt) * SCALE : spacing * (idx + 1) - wallLenScene / 2;
    const w = Math.min(p.wFt * SCALE, wallLenScene - 0.05);
    const h = Math.min(p.hFt * SCALE, yMax - 0.02);
    const sill = isYmovable(p.type)
      ? Math.min(Math.max(0, Number(it.sillFt ?? 0) * SCALE), Math.max(0, yMax - 0.02 - h))
      : 0;
    return { cx: mirrorX ? -off : off, w, y0: sill, y1: sill + h };
  });
}

// Clip hole rects to a wall piece's vertical range (two-tone splits).
function clipHoles(holes, yMin, yMax) {
  return (holes || [])
    .map((o) => ({ ...o, y0: Math.max(o.y0, yMin), y1: Math.min(o.y1, yMax) }))
    .filter((o) => o.y1 > o.y0 && o.w > 0);
}

// ─── 3D OPENING ROUTER (uses modular /3d/ components) ────
const PREHUNG_EXTERIOR_DOOR_NAME = /\bpre[\s-]?hung\s+exterior\s+door\b/i;
const PREHUNG_LIGHT_DOOR_NAME = /\bpre[\s-]?hung\s+(?:(?:light|lite|9[\s-]?lite)(?:\s+door)?|exterior\s+door\s*[-–—]?\s*9[\s-]?lite)\b/i;
const STEEL_DOOR_NAME = /\bsteel(?:\s+security)?\s+door\b/i;
const MOBILE_HOME_DOOR_NAME = /\bmobile\s+home\s+door\b/i;
const SINGLE_PANE_WHITE_GRID_WINDOW_NAME = /\bsingle\s+pane\b.*\bwhite\b.*\bgrid\b/i;

function Opening3D({ ow, oh, type, itemName = "", wallColor = null, open = false, flip = false }) {
  // Product-specific reference designs; every other walk-in variant keeps the
  // existing renderer. Item names are forwarded for both faces on every wall.
  if (type === "door" && (STEEL_DOOR_NAME.test(itemName) || MOBILE_HOME_DOOR_NAME.test(itemName))) {
    return <SteelDoor ow={ow} oh={oh} open={open} flip={flip} />;
  }
  if (type === "door" && PREHUNG_LIGHT_DOOR_NAME.test(itemName)) {
    return <PrehungLightDoor ow={ow} oh={oh} open={open} flip={flip} />;
  }
  if (type === "door" && PREHUNG_EXTERIOR_DOOR_NAME.test(itemName)) {
    return <PrehungExteriorDoor ow={ow} oh={oh} open={open} flip={flip} />;
  }
  switch (type) {
    case "window":       return SINGLE_PANE_WHITE_GRID_WINDOW_NAME.test(itemName)
      ? <SinglePaneGridWindow ow={ow} oh={oh} />
      : <Window ow={ow} oh={oh} />;
    case "rollup_door":  return <RollupDoor ow={ow} oh={oh} wallColor={wallColor} open={open} />;
    case "frameout":     return <Frameout ow={ow} oh={oh} wallColor={wallColor} />;
    case "vent":         return <Vent ow={ow} oh={oh} />;
    default:             return <WalkInDoor ow={ow} oh={oh} wallColor={wallColor} open={open} flip={flip} />;
  }
}

// Feet-inches callout label like the reference layout (4'10", 15'2", …).
function fmtFtIn(ft) {
  const neg = ft < 0;
  const a = Math.abs(Number(ft) || 0);
  let f = Math.floor(a + 1e-4);
  let inch = Math.round((a - f) * 12);
  if (inch >= 12) { f += 1; inch = 0; }
  // Feet-only when there are no inches (reference look: 7' not 7'0").
  return `${neg ? "-" : ""}${f}'${inch > 0 ? `${inch}"` : ""}`;
}

// Sill (bottom-edge height above the floor, scene units) for a wall opening
// entry. Windows/vents/frameouts carry a dragged sillFt; doors stay on the
// floor. Clamped so the opening always fits under the wall's eave.
function entrySill(item, oh, grid) {
  if (!isYmovable(item.type)) return 0;
  const wallH = grid.monoSlope ? (item.wall === "left" ? grid.h : grid.hLow) : grid.h;
  const maxSill = Math.max(0, wallH - 0.02 - oh);
  return Math.min(Math.max(0, Number(item.it?.sillFt ?? 0) * SCALE), maxSill);
}

// Timestamp of the last opening drag end — Canvas onPointerMissed uses it to
// avoid clearing the selection when a drag ends over empty space.
let lastOpeningDragEnd = 0;

function WallOpenings({ grid, openings, wallColor = null, onMoveOpening, onSelectOpening, selectedOpening }) {
  const { w, l, h, halfW } = grid;
  const { gl, camera, controls } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const dragRef = useRef(null);
  const cbRef = useRef({ onMoveOpening, onSelectOpening });
  useEffect(() => { cbRef.current = { onMoveOpening, onSelectOpening }; }, [onMoveOpening, onSelectOpening]);

  // Open/closed state per opening — double-clicking a door toggles its
  // open/close animation.
  const [openMap, setOpenMap] = useState({});

  const allItems = useMemo(() => {
    const result = [];
    for (const [wall, items] of Object.entries(openings)) {
      if (!items || items.length === 0) continue;
      const isEnd = wall === "front" || wall === "back";
      const wallLen = isEnd ? w : l;
      const entries = [];
      items.forEach((it, srcIdx) => {
        const p = parseOpening(it);
        if (p) entries.push({ ...p, it, srcIdx });
      });
      const count = entries.length;
      if (count === 0) continue;
      const spacing = wallLen / (count + 1);
      entries.forEach((e, idx) => {
        // User-dragged items carry posFt (feet from wall center); the rest keep
        // the classic even auto-spacing.
        const auto = spacing * (idx + 1) - wallLen / 2;
        const offset = e.it.posFt != null ? Number(e.it.posFt) * SCALE : auto;
        result.push({ ...e, wall, offset, wallLen, isEnd });
      });
    }
    return result;
  }, [openings, w, l]);

  // ─── DRAG TO MOVE (slides the item along its wall) ───────
  const handleDragMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    // Building is mirrored on X — bring the ray into building space so the
    // wall planes / offsets below stay in building coordinates.
    raycaster.ray.applyMatrix4(MIRROR_MATRIX);
    const out = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(d.plane, out)) return;
    const raw = d.axis === "z" ? out.z : out.x;
    const clamped = Math.max(-d.maxOff, Math.min(d.maxOff, raw));
    // Vertical: windows/vents/frameouts also follow the pointer's height
    // (center on the pointer), clamped so the opening stays under the eave.
    // Doors pass 0 — they always meet the floor.
    const sillFt = d.canY
      ? Math.max(0, Math.min(d.maxSill, out.y - d.oh / 2)) / SCALE
      : 0;
    cbRef.current.onMoveOpening?.(d.wall, d.srcIdx, clamped / SCALE, sillFt);
  }, [gl, camera, raycaster]);

  // Window pointer listeners are mounted ONCE and forward to the latest drag
  // handlers through refs — drag start/stop only toggles dragRef. Keeping these
  // effects on constant `[]` deps means hook dep arrays never change size or
  // identity between renders (React rejects both).
  const moveFnRef = useRef(() => {});
  const endFnRef = useRef(() => {});

  const handleDragEnd = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    lastOpeningDragEnd = performance.now();
    // eslint-disable-next-line react-hooks/immutability -- OrbitControls (useThree) is toggled imperatively while dragging
    if (controls) controls.enabled = true;
    // eslint-disable-next-line react-hooks/immutability -- the canvas cursor is managed imperatively while dragging
    gl.domElement.style.cursor = "";
    if (d.pointerId != null) gl.domElement.releasePointerCapture?.(d.pointerId);
  }, [gl, controls]);

  useEffect(() => { moveFnRef.current = handleDragMove; }, [handleDragMove]);
  useEffect(() => { endFnRef.current = handleDragEnd; }, [handleDragEnd]);
  useEffect(() => {
    const move = (e) => moveFnRef.current(e);
    const up = () => endFnRef.current();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const handleDragStart = useCallback((e, item) => {
    cbRef.current.onSelectOpening?.(item.wall, item.srcIdx);
    if (!cbRef.current.onMoveOpening) return;
    e.stopPropagation();
    // The wall's mid-plane: intersecting it with the camera ray yields a stable
    // world position even while the pointer leaves the opening meshes.
    const plane = item.isEnd
      ? new THREE.Plane(new THREE.Vector3(0, 0, 1), item.wall === "front" ? l / 2 : -l / 2)
      : new THREE.Plane(new THREE.Vector3(1, 0, 0), item.wall === "left" ? halfW : -halfW);
    const ow = Math.min(item.wFt * SCALE, item.wallLen - 0.05);
    const maxOff = item.wallLen / 2 - ow / 2 - 0.25 * SCALE;
    // Vertical drag (windows/vents/frameouts): clamp so the opening stays
    // under the wall's eave. Doors keep their sill at 0 (canY = false).
    const wallH = grid.monoSlope ? (item.wall === "left" ? grid.h : grid.hLow) : grid.h;
    const oh = Math.min(item.hFt * SCALE, wallH - 0.02);
    dragRef.current = {
      wall: item.wall, srcIdx: item.srcIdx,
      plane, axis: item.isEnd ? "x" : "z",
      maxOff, pointerId: e.pointerId,
      canY: isYmovable(item.type), oh, maxSill: Math.max(0, wallH - 0.02 - oh),
    };
    // eslint-disable-next-line react-hooks/immutability -- OrbitControls (useThree) is toggled imperatively while dragging
    if (controls) controls.enabled = false;
    // eslint-disable-next-line react-hooks/immutability -- the canvas cursor is managed imperatively while dragging
    gl.domElement.style.cursor = "grabbing";
    gl.domElement.setPointerCapture?.(e.pointerId);
  }, [gl, controls, l, halfW, grid]);

  return (
    <group>
      {allItems.map((item, i) => {
        const ow = Math.min(item.wFt * SCALE, item.wallLen - 0.05);
        // Mono-slope: clamp to the wall's own eave — sides are h (tall) / hLow
        // (short); front/back trapezoids clamp to the low eave (documented
        // approximation, since the trapezoid's height varies along X).
        const wallH = grid.monoSlope
          ? (item.wall === "left" ? grid.h : grid.hLow)
          : h;
        const oh = Math.min(item.hFt * SCALE, wallH - 0.02);
        // Vertical placement: windows/vents/frameouts sit at their dragged
        // sill height; doors always meet the floor (sill = 0).
        const sill = entrySill(item, oh, grid);
        const Z_OFFSET = MAIN_TUBE_SKIN;

        // Single assembly on the wall line: the opening renders on BOTH faces
        // (the inner face is the same assembly rotated 180°) so it reads as ONE
        // door from either side — no doubled copy floating off the wall.
        let pos, rot;
        if (item.wall === "left") {
          pos = [-halfW - Z_OFFSET, sill + oh / 2, item.offset];
          rot = [0, -Math.PI / 2, 0];
        } else if (item.wall === "right") {
          pos = [halfW + Z_OFFSET, sill + oh / 2, item.offset];
          rot = [0, Math.PI / 2, 0];
        } else if (item.wall === "front") {
          pos = [item.offset, sill + oh / 2, -l / 2 - Z_OFFSET];
          rot = [0, Math.PI, 0];
        } else {
          pos = [item.offset, sill + oh / 2, l / 2 + Z_OFFSET];
          rot = [0, 0, 0];
        }
        const isSelected = !!selectedOpening && selectedOpening.wall === item.wall && selectedOpening.idx === item.srcIdx;
        const openKey = `${item.wall}:${item.srcIdx}`;

        return (
          <group key={`opening-${i}`}>
            <group position={pos} rotation={rot} onPointerDown={(e) => handleDragStart(e, item)}
              onDoubleClick={(e) => { e.stopPropagation(); setOpenMap((prev) => ({ ...prev, [openKey]: !prev[openKey] })); }}>
              <Opening3D ow={ow} oh={oh} type={item.type} itemName={item.it?.name} wallColor={wallColor} open={!!openMap[openKey]} />
              {/* Interior face — same assembly rotated 180° */}
              <group rotation={[0, Math.PI, 0]}>
                <Opening3D ow={ow} oh={oh} type={item.type} itemName={item.it?.name} wallColor={wallColor} open={!!openMap[openKey]} flip />
              </group>
            </group>
            {isSelected && <OpeningCallouts item={item} ow={ow} oh={oh} sill={sill} grid={grid} />}
          </group>
        );
      })}
    </group>
  );
}

// ─── OPENING CALLOUTS ──────────────────────────────────────
// Dimension labels for the selected/dragged opening, styled after the
// reference layout: gap to each wall edge along the top, opening height on
// the side, and wall-edge-to-center distance along the bottom.
const CALLOUT_STYLE = {
  background: "#223047",
  color: "#fff",
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 7px",
  borderRadius: 4,
  whiteSpace: "nowrap",
  pointerEvents: "none",
  boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
};

function OpeningCallouts({ item, ow, oh, sill = 0, grid }) {
  const { l, halfW } = grid;
  const wallLen = item.wallLen;
  const isSide = !item.isEnd;
  const wallLenFt = wallLen / SCALE;
  const owFt = ow / SCALE;
  const posFt = item.offset / SCALE;
  const leftGap = posFt - owFt / 2 + wallLenFt / 2;
  const rightGap = wallLenFt / 2 - (posFt + owFt / 2);
  const OFF = MAIN_TUBE_SKIN + 0.45;
  const mk = (a, y) =>
    isSide
      ? [(item.wall === "left" ? -1 : 1) * (halfW + OFF), y, a]
      : [a, y, (item.wall === "front" ? -1 : 1) * (l / 2 + OFF)];
  // Reference layout: gap labels hug the door's top corners, height on the
  // left edge at mid-height, and the same gap labels repeat below the floor
  // at the door's bottom corners. Vertical moves shift everything by `sill`
  // and add a sill-height label (floor → bottom of opening) on the right.
  return (
    <group>
      <Html position={mk(item.offset - ow / 2, sill + oh + 0.45)} center>
        <div style={CALLOUT_STYLE}>{fmtFtIn(leftGap)}</div>
      </Html>
      <Html position={mk(item.offset + ow / 2, sill + oh + 0.45)} center>
        <div style={CALLOUT_STYLE}>{fmtFtIn(rightGap)}</div>
      </Html>
      <Html position={mk(item.offset - ow / 2 - 0.55, sill + oh / 2)} center>
        <div style={CALLOUT_STYLE}>{fmtFtIn(oh / SCALE)}</div>
      </Html>
      {sill > 0.001 && (
        <Html position={mk(item.offset + ow / 2 + 0.55, sill / 2)} center>
          <div style={CALLOUT_STYLE}>{fmtFtIn(sill / SCALE)}</div>
        </Html>
      )}
      <Html position={mk(item.offset - ow / 2, sill - 0.55)} center>
        <div style={CALLOUT_STYLE}>{fmtFtIn(leftGap)}</div>
      </Html>
      <Html position={mk(item.offset + ow / 2, sill - 0.55)} center>
        <div style={CALLOUT_STYLE}>{fmtFtIn(rightGap)}</div>
      </Html>
    </group>
  );
}

// Center-storage opening callouts — same measurement labels as the center
// WallOpenings (edge gaps, opening height, sill height), but the anchor math
// goes through the wall's `place(offset, height)` transform plus a small
// `outward` offset so labels sit just in front of the door face.
function StorageOpeningCallouts({ offset, ow, oh, sill = 0, wallLen, place, outward = [0, 0, 0] }) {
  const wallLenFt = wallLen / SCALE;
  const owFt = ow / SCALE;
  const posFt = offset / SCALE;
  const leftGap = posFt - owFt / 2 + wallLenFt / 2;
  const rightGap = wallLenFt / 2 - (posFt + owFt / 2);
  const at = (a, y) => {
    const p = place(a, y).pos;
    return [p[0] + outward[0], p[1] + outward[1], p[2] + outward[2]];
  };
  return (
    <group>
      <Html position={at(offset - ow / 2, sill + oh + 0.45)} center>
        <div style={CALLOUT_STYLE}>{fmtFtIn(leftGap)}</div>
      </Html>
      <Html position={at(offset + ow / 2, sill + oh + 0.45)} center>
        <div style={CALLOUT_STYLE}>{fmtFtIn(rightGap)}</div>
      </Html>
      <Html position={at(offset - ow / 2 - 0.55, sill + oh / 2)} center>
        <div style={CALLOUT_STYLE}>{fmtFtIn(oh / SCALE)}</div>
      </Html>
      {sill > 0.001 && (
        <Html position={at(offset + ow / 2 + 0.55, sill / 2)} center>
          <div style={CALLOUT_STYLE}>{fmtFtIn(sill / SCALE)}</div>
        </Html>
      )}
      <Html position={at(offset - ow / 2, sill - 0.55)} center>
        <div style={CALLOUT_STYLE}>{fmtFtIn(leftGap)}</div>
      </Html>
      <Html position={at(offset + ow / 2, sill - 0.55)} center>
        <div style={CALLOUT_STYLE}>{fmtFtIn(rightGap)}</div>
      </Html>
    </group>
  );
}

// ─── LEAN-TO SYSTEM ────────────────────────────────────────
// Renders a single lean-to attached to one side of the main building.
// leanto: { side_key, width_ft, height_ft, render_key }

function LeanToSystem({ grid, leanto, hostWall = null, roofColor, wallColor, siblingLeantos, trimColor = TRIM_COLOR, roofOverhang = 0, roofDir = "vertical", onWallSelect = null, selectedWall = null }) {
  const { l, h, halfW, w, bayPositions } = grid;
  const side = leanto.side_key;
  const ltWidthFt = leanto.width_ft || 10;
  const ltOpenings = useMemo(
    () => leanto.openings || { outer: [], left_end: [], right_end: [] },
    [leanto.openings]
  );
  const ltHeightFt = leanto.height_ft || (leanto.drop_ft ? ((h / SCALE) - leanto.drop_ft) : 6);

  // Storage lean-tos are always enclosed, including configurations created
  // before this preset was enforced in the UI.
  const storageStyle = isLeanToWithStorage(leanto);
  const ltWalls = leanto.walls || {};
  // A wall is present unless open/false. Custom panels ("top_N",
  // "ext_gable_N", "gable") draw partial walls: a top band on the outer wall,
  // shaped end walls via LeanToEndWall's `type`.
  const ltWallOn = (v) => !!v && v !== "open";
  const hasOuter = storageStyle || ltWallOn(ltWalls.outer);
  const hasLeftEnd = storageStyle || ltWallOn(ltWalls.left_end);
  const hasRightEnd = storageStyle || ltWallOn(ltWalls.right_end);
  const leftEndType = storageStyle ? "enclosed" : ltWalls.left_end;
  const rightEndType = storageStyle ? "enclosed" : ltWalls.right_end;
  // Outer wall: "top_N" / "ext_gable_N" → N-ft band at the top; else full.
  const outerBandFt = storageStyle ? null : parsePanelBand(ltWalls.outer);
  const hasAnyWall = hasOuter || hasLeftEnd || hasRightEnd;

  const ltW = ltWidthFt * SCALE;       // lean-to projection (scene units)
  const ltH = ltHeightFt * SCALE;      // lean-to outer leg height (scene units)
  const isSide = side === "left" || side === "right";

  // Lean-to length along the building wall. Side lean-tos may be shorter than
  // the wall (length_ft). Front/back (end) lean-tos always span the full end
  // wall — their length_ft is the priced frame length, which can be the
  // nearest matrix size below the building width.
  const maxLen = isSide ? l : w;       // full wall length in scene units
  const ltLenFt = isSide ? leanto.length_ft : null;
  const ltLen = ltLenFt ? Math.min(ltLenFt * SCALE, maxLen) : maxLen;

  // "Enclosed Lean with Storage" — interior partition at storageDepth from
  // the lean-to's front end (−z for side lean-tos, −x for end lean-tos). The
  // shared helper applies the same two-foot open-area clamp as the floor plan.
  const storageDepthFt = getLeanToStorageDepthFt(leanto, ltLen / SCALE);
  const hasStorage = storageDepthFt > 0;
  const storageDepth = storageDepthFt * SCALE;
  const needsStorageHostWall = hasStorage && !isEnclosedWall(hostWall);

  // Tuck under main eave for visual hierarchy. A lean-to may pass its own
  // attachDropFt (ft below the center eave) to override the default drop.
  const attachH = h - (leanto.attachDropFt != null ? leanto.attachDropFt * SCALE : LEANTO_DROP);
  const sign = (side === "right" || side === "back") ? 1 : -1;
  const SEAM_OFFSET = 0.01;          // prevent z-fighting at attachment seam

  // For side lean-tos: use ltLen (centered along Z). For end: use ltLen centered on building.
  // End lean-tos span their full length along the host wall — no corner shrinking.
  const halfLtLen = ltLen / 2;
  const adjW = ltLen;  // both sides and ends use their own length
  const adjXCenter = 0;  // centered on building for end lean-tos
  const attachLen = adjW;  // length along the building

  // Roof slope
  const drop = attachH - ltH;
  // Overhang: lean-to outward overhang follows the base roof overhang (convert ft → scene units)
  const ovH = roofOverhang > 0 ? roofOverhang * SCALE : LEANTO_OVERHANG;
  // Side overhang (along the lean-to length) — just a minimal drip edge
  const sideOv = 0.08;
  // Overhang height drop (continues same slope past column)
  const slopeRatio = drop / ltW;   // rise/run
  const ovDrop = ovH * slopeRatio; // how much lower the overhang edge is

  // Perpendicular offsets below the lean-to roof plane (skin → strap → rafter).
  // The post tops lie exactly in the roof plane, so offsets along the plane
  // normal keep the layering tight at any lean-to pitch.
  const slt = Math.hypot(ltW, drop) || 1;
  const nRun = drop / slt; // normal component along the run axis (x for side, z for end)
  const nUp = ltW / slt;   // normal's vertical component
  const STRAP_SIT = STRAP_T / 2 + 0.0025;                 // strap center below the skin
  const RAFTER_SIT = STRAP_T + 0.005 + LEANTO_TUBE * 0.4; // rafter center below the skin
  const EAVE_TRIM_SIT = 0.04; // tuck the outer fascia line below the drip edge
  // At steeper pitches, a normal offset needs extra clearance to keep the
  // eave tube's vertical half-width below the sheet as well.
  const EAVE_BEAM_SIT = Math.max(RAFTER_SIT, (LEANTO_TUBE / 2 + 0.01) / Math.max(nUp, 0.1));

  // Posts along outer edge at bay spacing. Legs "adjust" around openings on the
  // outer wall: a leg that would cross an opening hugs the opening's edge
  // instead (rafters follow their post positions).
  const postPositions = useMemo(() => {
    const base = (() => {
      if (isSide) {
        // Side lean-to: use bay positions that fall within the lean-to length
        if (ltLen >= l) return bayPositions;
        return bayPositions.filter((z) => z >= -halfLtLen && z <= halfLtLen);
      }
      // End lean-to: posts evenly spaced along lean-to length, centered on building
      const eMin = -ltLen / 2;
      const baySpacing = BAY_SPACING_FT * SCALE;
      const count = Math.max(1, Math.round(ltLen / baySpacing));
      const step = ltLen / count;
      const posts = [];
      for (let i = 0; i <= count; i++) posts.push(eMin + step * i);
      return posts;
    })();
    // Outer-wall openings share the posts' centered axis space.
    const spans = openingAxisSpans(ltOpenings.outer, ltLen, LEANTO_TUBE / 2 + 0.1);
    if (spans.length === 0) return base;
    return base.map((v) => adjustLegAxis(v, spans));
  }, [isSide, bayPositions, ltLen, halfLtLen, l, ltOpenings]);

  // Wall texture for enclosed lean-to — horizontal corrugation matching the roof
  const outerWallH = outerBandFt != null ? Math.min(outerBandFt * SCALE, ltH) : ltH;
  const wallTex = useMemo(() => {
    if (!hasOuter) return null;
    const tex = createWallRibTexture(wallColor);
    tex.repeat.set(1, outerWallH / WALL_RIB_TILE);
    return tex;
  }, [hasOuter, wallColor, outerWallH]);

  // End wall texture (end walls + the storage partition — same cladding)
  const endWallTex = useMemo(() => {
    if (!hasLeftEnd && !hasRightEnd && !hasStorage) return null;
    const tex = createWallRibTexture(wallColor);
    const avgH = (attachH + ltH) / 2;
    tex.repeat.set(1, avgH / WALL_RIB_TILE);
    return tex;
  }, [hasLeftEnd, hasRightEnd, hasStorage, wallColor, attachH, ltH]);

  // End-wall opening cutouts — sized to match LeanToOpenings so a framed
  // opening (door / window / frameout) renders as a real hole through the wall.
  const endWallH = ltH; // cap to lean-to height (10% head allowance, matching LeanToOpenings)
  const leftEndHoles = useMemo(
    () => leanToEndWallHoles(ltOpenings.left_end, ltW, endWallH),
    [ltOpenings.left_end, ltW, endWallH]
  );
  const rightEndHoles = useMemo(
    () => leanToEndWallHoles(ltOpenings.right_end, ltW, endWallH),
    [ltOpenings.right_end, ltW, endWallH]
  );

  // Fascia band (lean-to roof → main eave) on every lean-to: the same
  // horizontal ribbed siding as enclosed walls, rib phase anchored at the eave
  // (v = 1) so ribs line up with the gable / wall above. The texture object
  // stays stable; pitch changes only update repeat/offset.
  const fasciaH = h - attachH;
  const ribFasciaTex = useMemo(() => createWallRibTexture(wallColor || "#e0e0e0"), [wallColor]);
  useEffect(() => {
    const r = Math.max(fasciaH, 0.01) / WALL_RIB_TILE;
    ribFasciaTex.repeat.set(1, r);
    ribFasciaTex.offset.set(0, Math.ceil(r) - r);
  }, [ribFasciaTex, fasciaH]);
  useEffect(() => () => { ribFasciaTex.dispose(); }, [ribFasciaTex]);

  // Roof skin — same R-panel rib geometry as the main building roof
  // (3d/roof/ribPanelGeometry.js): major rib every 12", ribs run down the
  // slope, profile repeats along the lean-to length.
  const roofGeo = useMemo(() => {
    const outerY = ltH - ovDrop; // eave edge continues the slope past the columns
    if (isSide) {
      // Side lean-to: slope in X, span along Z — the module's native frame
      const innerX = sign * halfW + sign * SEAM_OFFSET;
      const outerX = sign * (halfW + ltW + ovH); // past columns by overhang
      return createRibPanelGeometry({
        zF: -halfLtLen - sideOv, zB: halfLtLen + sideOv, // minimal side drip
        eave: [outerX, outerY],
        ridge: [innerX, attachH],
        dir: roofDir,
      });
    }
    // End lean-to: slope in Z, span along X (centered on building). Build the
    // strip in the module's native frame (slope along X, span along Z), then
    // rotate -90° about Y onto the end wall: native slope X -> world Z and
    // native span Z -> world X. Ribs then run down the slope and the profile
    // repeats along the lean-to length, matching the main roof.
    const eMin = -ltLen / 2 - sideOv; // minimal side drip
    const eMax = ltLen / 2 + sideOv;
    const innerZ = sign * (l / 2) + sign * SEAM_OFFSET;
    const outerZ = sign * (l / 2 + ltW + ovH); // past columns
    const g = createRibPanelGeometry({
      zF: 0, zB: eMax - eMin,
      eave: [0, 0],
      ridge: [innerZ - outerZ, attachH - outerY],
      dir: roofDir,
    });
    g.rotateY(-Math.PI / 2);
    g.translate(eMax, outerY, outerZ);
    return g;
  }, [isSide, sign, halfW, ltW, ltH, attachH, l, halfLtLen, ltLen, ovH, ovDrop, sideOv, roofDir]);

  // Dispose rebuilt/unmounted roof geometry
  useEffect(() => () => { roofGeo?.dispose(); }, [roofGeo]);

  return (
    <group>
      {/* Wall flashing — L-trim covering the roof-to-wall joint */}
      <LeanToWallFlashing
        isSide={isSide} sign={sign} halfW={halfW} l={l}
        attachH={attachH} ltW={ltW} drop={drop}
        length={ltLen + 2 * sideOv} color={roofColor}
        wallFace={END_WALL_OFF}
      />

      {/* Lean-to roof — same rib-panel skin as the main roof */}
      <mesh geometry={roofGeo} castShadow receiveShadow>
        <meshStandardMaterial color={roofColor} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={0} polygonOffsetUnits={-1} />
      </mesh>

      {/* Fascia band (lean-to roof → main eave) — ribbed siding just behind the
          wall plane (FASCIA_OFF): flush with an open wall, hidden by an
          enclosed one. Trim-colored sleeves wrap the posts at both ends of the
          band (lean-to roof → eave), so the posts read as the corner trim. */}
      <group>
        {isSide ? (
          <mesh position={[sign * (halfW + FASCIA_OFF), (h + attachH) / 2, 0]} rotation={[0, sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0]} castShadow>
            <planeGeometry args={[ltLen, h - attachH]} />
            <meshStandardMaterial key={ribFasciaTex.uuid} map={ribFasciaTex} normalMap={ribFasciaTex.userData.normalMap} {...WALL_MAT} side={2} />
          </mesh>
        ) : (
          <mesh position={[0, (h + attachH) / 2, sign * (l / 2 + FASCIA_OFF)]} rotation={[0, sign > 0 ? 0 : Math.PI, 0]} castShadow>
            <planeGeometry args={[ltLen, h - attachH]} />
            <meshStandardMaterial key={ribFasciaTex.uuid} map={ribFasciaTex} normalMap={ribFasciaTex.userData.normalMap} {...WALL_MAT} side={2} />
          </mesh>
        )}
        {(() => {
          const inner = MAIN_TUBE / 2 + CORNER_POST_PAD;   // from the wall line back past the post
          const outer = END_WALL_OFF + CORNER_POST_PAD;    // from the wall line out past the wall face
          const depth = inner + outer;
          const mid = (outer - inner) / 2;                 // sleeve center, outward from the wall line
          const across = MAIN_TUBE + 2 * CORNER_POST_PAD;
          const y = (h + attachH) / 2;
          return [-1, 1].map((e) => {
            const position = isSide
              ? [sign * (halfW + mid), y, e * halfLtLen]
              : [e * halfW, y, sign * (l / 2 + mid)];
            const size = isSide ? [depth, h - attachH, across] : [across, h - attachH, depth];
            return (
              <mesh key={`ct${e}`} position={position} castShadow receiveShadow>
                <boxGeometry args={size} />
                <meshStandardMaterial color={trimColor} roughness={0.4} metalness={0.3} />
              </mesh>
            );
          });
        })()}
      </group>

      {/* Outer posts */}
      {postPositions.map((p, i) => {
        let start, end;
        if (isSide) {
          const outerX = sign * (halfW + ltW);
          start = [outerX, 0, p];
          end = [outerX, ltH, p];
        } else {
          const outerZ = sign * (l / 2 + ltW);
          start = [p, 0, outerZ];
          end = [p, ltH, outerZ];
        }
        return <SteelTube key={`ltp${i}`} start={start} end={end} size={LEANTO_TUBE} />;
      })}

      {/* Rafters — diagonal from main eave to outer post tops, tucked just
          below the flat purlin straps (perpendicular to the roof plane) */}
      {postPositions.map((p, i) => {
        const off = RAFTER_SIT;
        if (isSide) {
          const start = [sign * halfW - sign * nRun * off, attachH - nUp * off, p];
          const end = [sign * (halfW + ltW) - sign * nRun * off, ltH - nUp * off, p];
          return <SteelTube key={`ltr${i}`} start={start} end={end} size={LEANTO_TUBE * 0.8} />;
        } else {
          const start = [p, attachH - nUp * off, sign * (l / 2) - sign * nRun * off];
          const end = [p, ltH - nUp * off, sign * (l / 2 + ltW) - sign * nRun * off];
          return <SteelTube key={`ltr${i}`} start={start} end={end} size={LEANTO_TUBE * 0.8} />;
        }
      })}

      {/* Purlins — flat straps hugging the lean-to roof skin underside
          (resting on the rafters), matching the main frame's flat straps */}
      {(() => {
        const purlinCount = 3;
        const purlins = [];
        const normal = isSide ? [sign * nRun, nUp, 0] : [0, nUp, sign * nRun];
        for (let pi = 1; pi <= purlinCount; pi++) {
          const t = pi / (purlinCount + 1);
          const pY = attachH + (ltH - attachH) * t - nUp * STRAP_SIT;
          if (isSide) {
            const pX = sign * (halfW + ltW * t) - sign * nRun * STRAP_SIT;
            purlins.push(
              <SteelFlatBar key={`ltp-pur${pi}`}
                start={[pX, pY, -halfLtLen]}
                end={[pX, pY, halfLtLen]}
                width={STRAP_W} thickness={STRAP_T} normal={normal} />
            );
          } else {
            const pZ = sign * (l / 2 + ltW * t) - sign * nRun * STRAP_SIT;
            purlins.push(
              <SteelFlatBar key={`ltp-pur${pi}`}
                start={[adjXCenter - adjW / 2, pY, pZ]}
                end={[adjXCenter + adjW / 2, pY, pZ]}
                width={STRAP_W} thickness={STRAP_T} normal={normal} />
            );
          }
        }
        return purlins;
      })()}

      {/* Outer eave beam — follows the rafters' underside offset, with enough
          clearance to keep its full cross-section below the roof sheet. */}
      {isSide ? (
        <SteelTube
          start={[sign * (halfW + ltW) - sign * nRun * EAVE_BEAM_SIT, ltH - nUp * EAVE_BEAM_SIT, -halfLtLen]}
          end={[sign * (halfW + ltW) - sign * nRun * EAVE_BEAM_SIT, ltH - nUp * EAVE_BEAM_SIT, halfLtLen]}
          size={LEANTO_TUBE}
        />
      ) : (
        <SteelTube
          start={[adjXCenter - adjW / 2, ltH - nUp * EAVE_BEAM_SIT, sign * (l / 2 + ltW) - sign * nRun * EAVE_BEAM_SIT]}
          end={[adjXCenter + adjW / 2, ltH - nUp * EAVE_BEAM_SIT, sign * (l / 2 + ltW) - sign * nRun * EAVE_BEAM_SIT]}
          size={LEANTO_TUBE}
        />
      )}

      {/* Outer wall panel (if enclosed) */}
      {hasOuter && wallTex && (
        isSide ? (
          <mesh position={[sign * (halfW + ltW), ltH - outerWallH / 2, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <planeGeometry args={[ltLen, outerWallH]} />
            <meshStandardMaterial map={wallTex} normalMap={wallTex.userData.normalMap} {...WALL_MAT} side={2} />
          </mesh>
        ) : (
          <mesh position={[adjXCenter, ltH - outerWallH / 2, sign * (l / 2 + ltW)]} castShadow>
            <planeGeometry args={[adjW, outerWallH]} />
            <meshStandardMaterial map={wallTex} normalMap={wallTex.userData.normalMap} {...WALL_MAT} side={2} />
          </mesh>
        )
      )}

      {/* Storage host wall — close only the storage bay's attachment segment
          when the main wall is open. A clad main wall already closes it. */}
      {needsStorageHostWall && (
        isSide ? (
          <StorageWallPanel
            x={sign * (halfW + 0.015)} y={attachH / 2}
            z={-halfLtLen + storageDepth / 2}
            w={storageDepth} h={attachH} rotY={Math.PI / 2}
            color={wallColor}
          />
        ) : (
          <StorageWallPanel
            x={adjXCenter - adjW / 2 + storageDepth / 2} y={attachH / 2}
            z={sign * (l / 2 + 0.015)}
            w={storageDepth} h={attachH}
            color={wallColor}
          />
        )
      )}

      {/* End walls (trapezoid shape: inner edge at attachH, outer at ltH) */}
      {endWallTex && (
        isSide ? (
          <>
            {hasLeftEnd && (
              <LeanToEndWall
                innerX={sign * halfW} outerX={sign * (halfW + ltW)}
                innerH={attachH} outerH={ltH} z={-halfLtLen}
                tex={endWallTex} flip={false} holes={leftEndHoles} type={leftEndType}
              />
            )}
            {hasRightEnd && (
              <LeanToEndWall
                innerX={sign * halfW} outerX={sign * (halfW + ltW)}
                innerH={attachH} outerH={ltH} z={halfLtLen}
                tex={endWallTex} flip={true} holes={rightEndHoles} type={rightEndType}
              />
            )}
          </>
        ) : (
          <>
            {hasLeftEnd && (
              <LeanToEndWall
                innerX={adjXCenter - adjW / 2} outerX={adjXCenter - adjW / 2}
                innerH={attachH} outerH={ltH}
                z={sign * (l / 2)} zOuter={sign * (l / 2 + ltW)}
                isEndType tex={endWallTex} flip={false} type={leftEndType}
              />
            )}
            {hasRightEnd && (
              <LeanToEndWall
                innerX={adjXCenter + adjW / 2} outerX={adjXCenter + adjW / 2}
                innerH={attachH} outerH={ltH}
                z={sign * (l / 2)} zOuter={sign * (l / 2 + ltW)}
                isEndType tex={endWallTex} flip={true} type={rightEndType}
              />
            )}
          </>
        )
      )}

      {/* Storage partition — "Enclosed Lean with Storage": clad interior
          wall at storageDepth from the lean-to's front end (−z for side
          lean-tos, −x for end lean-tos), rising ground → roof underside
          (inner edge attachH, outer edge ltH). */}
      {hasStorage && endWallTex && (
        isSide ? (
          <LeanToEndWall
            innerX={sign * halfW} outerX={sign * (halfW + ltW)}
            innerH={attachH} outerH={ltH}
            z={-halfLtLen + storageDepth}
            tex={endWallTex} flip={false}
          />
        ) : (
          <LeanToEndWall
            innerX={adjXCenter - adjW / 2 + storageDepth} outerX={adjXCenter - adjW / 2 + storageDepth}
            innerH={attachH} outerH={ltH}
            z={sign * (l / 2)} zOuter={sign * (l / 2 + ltW)}
            isEndType tex={endWallTex} flip={false}
          />
        )
      )}

      {/* Roof edge trims — dark strips along all 4 edges of the lean-to roof */}
      {isSide ? (<>
        {/* Outer eave trim (along outer edge) */}
        <Line points={[[sign * (halfW + ltW + ovH) - sign * nRun * EAVE_TRIM_SIT, ltH - ovDrop - nUp * EAVE_TRIM_SIT, -halfLtLen - sideOv], [sign * (halfW + ltW + ovH) - sign * nRun * EAVE_TRIM_SIT, ltH - ovDrop - nUp * EAVE_TRIM_SIT, halfLtLen + sideOv]]}
          color={trimColor} lineWidth={3} />
        {/* Inner eave trim (along building wall) */}
        <Line points={[[sign * halfW + sign * SEAM_OFFSET, attachH + 0.01, -halfLtLen - sideOv], [sign * halfW + sign * SEAM_OFFSET, attachH + 0.01, halfLtLen + sideOv]]}
          color={trimColor} lineWidth={3} />
        {/* Left side edge trim */}
        <Line points={[[sign * halfW + sign * SEAM_OFFSET, attachH + 0.01, -halfLtLen - sideOv], [sign * (halfW + ltW + ovH), ltH - ovDrop + 0.01, -halfLtLen - sideOv]]}
          color={trimColor} lineWidth={3} />
        {/* Right side edge trim */}
        <Line points={[[sign * halfW + sign * SEAM_OFFSET, attachH + 0.01, halfLtLen + sideOv], [sign * (halfW + ltW + ovH), ltH - ovDrop + 0.01, halfLtLen + sideOv]]}
          color={trimColor} lineWidth={3} />
      </>) : (<>
        {/* Outer eave trim */}
        <Line points={[[adjXCenter - adjW / 2 - sideOv, ltH - ovDrop - nUp * EAVE_TRIM_SIT, sign * (l / 2 + ltW + ovH) - sign * nRun * EAVE_TRIM_SIT], [adjXCenter + adjW / 2 + sideOv, ltH - ovDrop - nUp * EAVE_TRIM_SIT, sign * (l / 2 + ltW + ovH) - sign * nRun * EAVE_TRIM_SIT]]}
          color={trimColor} lineWidth={3} />
        {/* Inner eave trim */}
        <Line points={[[adjXCenter - adjW / 2 - sideOv, attachH + 0.01, sign * (l / 2) + sign * SEAM_OFFSET], [adjXCenter + adjW / 2 + sideOv, attachH + 0.01, sign * (l / 2) + sign * SEAM_OFFSET]]}
          color={trimColor} lineWidth={3} />
        {/* Left side edge trim */}
        <Line points={[[adjXCenter - adjW / 2 - sideOv, attachH + 0.01, sign * (l / 2) + sign * SEAM_OFFSET], [adjXCenter - adjW / 2 - sideOv, ltH - ovDrop + 0.01, sign * (l / 2 + ltW + ovH)]]}
          color={trimColor} lineWidth={3} />
        {/* Right side edge trim */}
        <Line points={[[adjXCenter + adjW / 2 + sideOv, attachH + 0.01, sign * (l / 2) + sign * SEAM_OFFSET], [adjXCenter + adjW / 2 + sideOv, ltH - ovDrop + 0.01, sign * (l / 2 + ltW + ovH)]]}
          color={trimColor} lineWidth={3} />
      </>)}

      {/* Base trim along outer edge */}
      {isSide ? (
        <mesh position={[sign * (halfW + ltW), 0.02, 0]} castShadow>
          <boxGeometry args={[0.03, 0.03, ltLen]} />
          <meshStandardMaterial color={trimColor} roughness={0.4} metalness={0.3} />
        </mesh>
      ) : (
        <mesh position={[adjXCenter, 0.02, sign * (l / 2 + ltW)]} castShadow>
          <boxGeometry args={[adjW, 0.03, 0.03]} />
          <meshStandardMaterial color={trimColor} roughness={0.4} metalness={0.3} />
        </mesh>
      )}

      {/* Lean-to wall openings (doors, windows, vents, frameouts, rollup doors) */}
      {hasAnyWall && <LeanToOpenings
        isSide={isSide} sign={sign} halfW={halfW} ltW={ltW} ltH={ltH}
        l={l} adjXCenter={adjXCenter} adjW={adjW}
        halfLtLen={halfLtLen} ltLen={ltLen} openings={ltOpenings} wallColor={wallColor}
        hasStorage={hasStorage} storageDepth={storageDepth}
      />}
      {(onWallSelect || selectedWall) && (
        <LeanToWallSelection
          side={side} isSide={isSide} sign={sign} halfW={halfW} ltW={ltW} ltH={ltH}
          attachH={attachH} l={l} adjXCenter={adjXCenter} adjW={adjW} halfLtLen={halfLtLen}
          ltLen={ltLen} hasStorage={hasStorage} storageDepth={storageDepth}
          selectedWall={selectedWall} onSelect={onWallSelect}
        />
      )}


    </group>
  );
}

// ─── LEAN-TO WALL FLASHING ─────────────────────────────────
// L-shaped transition flashing where a lean-to roof meets the building wall:
// a smooth roof leg lying on the roof just above the rib tops, and a short
// leg turned up the wall face (outside the gable fascia). Side lean-tos slope
// along X (length along Z); end lean-tos slope along Z (length along X).
const FLASH_ROOF_LEG = (6 / 12) * SCALE;   // 6" onto the roof
const FLASH_WALL_LEG = (4 / 12) * SCALE;   // 4" up the wall
const FLASH_T = 0.012;                      // sheet thickness (scene units)
// End walls sit this far outside the frame line (same as EndWallMesh's wallZ).
const END_WALL_OFF = MAIN_TUBE * 0.6;
// Lean-to fascia band: just behind the wall plane so an enclosed host wall
// (same plane) wins without z-fighting, while an open wall shows it flush.
const FASCIA_OFF = END_WALL_OFF - 0.004;
// Corner trim wraps the main corner post (MAIN_TUBE, centered on the corner):
// this much larger on every side so it fully hides the gray post.
const CORNER_POST_PAD = 0.006;

function LeanToWallFlashing({ isSide, sign, halfW, l, attachH, ltW, drop, length, color, wallFace = 0.015 }) {
  const slt = Math.hypot(ltW, drop) || 1;
  const nRun = drop / slt;
  const nUp = ltW / slt;
  const lift = RIB_MAX_HEIGHT + FLASH_T / 2 + 0.004; // sit just above the rib tops
  // Wall leg: a solid cover from the gable fascia face out past the main
  // frame posts (MAIN_TUBE thick, centered on the wall line) so the corner
  // posts don't hide its ends.
  // wallFace = wall plane (prop): END_WALL_OFF for side and end lean-tos.
  const wallDepth = Math.max(FLASH_T, MAIN_TUBE / 2 + 0.006 - wallFace); // → just outside the posts
  const wallOff = wallFace + wallDepth / 2;            // center of the wall leg
  const along = FLASH_ROOF_LEG / 2;                  // roof-leg center, down-slope from the wall

  // Down-slope unit vector and roof-plane normal (world axes).
  const d = isSide ? [sign * ltW / slt, -drop / slt, 0] : [0, -drop / slt, sign * ltW / slt];
  const n = isSide ? [sign * nRun, nUp, 0] : [0, nUp, sign * nRun];
  const p0 = isSide ? [sign * halfW, attachH, 0] : [0, attachH, sign * (l / 2)];
  const roofPos = [0, 1, 2].map((i) => p0[i] + d[i] * along + n[i] * lift);

  const mat = <meshStandardMaterial color={color} roughness={0.42} metalness={0.35} />;

  if (isSide) {
    return (
      <group>
        {/* Roof leg: box x = down-slope, y = thickness, z = length */}
        <mesh position={roofPos} rotation={[0, 0, Math.atan2(-sign * drop, ltW)]} castShadow receiveShadow>
          <boxGeometry args={[FLASH_ROOF_LEG, FLASH_T, length]} />
          {mat}
        </mesh>
        {/* Wall leg */}
        <mesh position={[sign * (halfW + wallOff), attachH + FLASH_WALL_LEG / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[wallDepth, FLASH_WALL_LEG, length]} />
          {mat}
        </mesh>
      </group>
    );
  }
  return (
    <group>
      {/* Roof leg: box x = length, y = thickness, z = down-slope */}
      <mesh position={roofPos} rotation={[Math.atan2(sign * drop, ltW), 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, FLASH_T, FLASH_ROOF_LEG]} />
        {mat}
      </mesh>
      {/* Wall leg */}
      <mesh position={[0, attachH + FLASH_WALL_LEG / 2, sign * (l / 2 + wallOff)]} castShadow receiveShadow>
        <boxGeometry args={[length, FLASH_WALL_LEG, wallDepth]} />
        {mat}
      </mesh>
    </group>
  );
}

function LeanToWallSelection({ side, isSide, sign, halfW, ltW, ltH, attachH, l, adjXCenter, adjW, halfLtLen, ltLen, hasStorage, storageDepth, selectedWall, onSelect }) {
  const sideOutline = [[-ltW / 2, 0], [ltW / 2, 0],
    [ltW / 2, sign > 0 ? ltH : attachH], [-ltW / 2, sign > 0 ? attachH : ltH]];
  const endOutline = [[-ltW / 2, 0], [ltW / 2, 0],
    [ltW / 2, sign > 0 ? attachH : ltH], [-ltW / 2, sign > 0 ? ltH : attachH]];
  const outline = isSide ? sideOutline : endOutline;
  const midRun = isSide ? sign * (halfW + ltW / 2) : sign * (l / 2 + ltW / 2);
  const rotation = isSide ? [0, 0, 0] : [0, Math.PI / 2, 0];
  const target = (wall, label, key) => (
    <WallPickTarget
      key={wall} outline={outline}
      position={isSide ? [midRun, 0, key] : [key, 0, midRun]} rotation={rotation}
      target={{ section: side, wall }} label={label} selectedWall={selectedWall} onSelect={onSelect}
    />
  );

  return (
    <group>
      <WallPickTarget
        outline={wallRectangle(isSide ? ltLen : adjW, ltH)}
        position={isSide ? [sign * (halfW + ltW), 0, 0] : [adjXCenter, 0, sign * (l / 2 + ltW)]}
        rotation={isSide ? [0, Math.PI / 2, 0] : [0, 0, 0]}
        target={{ section: side, wall: "outer" }} label="Outer Wall" selectedWall={selectedWall} onSelect={onSelect}
      />
      {target("left_end", "Left End", isSide ? -halfLtLen : adjXCenter - adjW / 2)}
      {target("right_end", "Right End", isSide ? halfLtLen : adjXCenter + adjW / 2)}
      {hasStorage && target("storage_partition", "Storage Inner Wall", isSide ? -halfLtLen + storageDepth : adjXCenter - adjW / 2 + storageDepth)}
    </group>
  );
}

// ─── LEAN-TO WALL OPENINGS ─────────────────────────────────
// Renders doors, windows, vents, frameouts, rollup doors on lean-to walls.

function LeanToOpenings({ isSide, sign, halfW, ltW, ltH, l, adjXCenter, adjW, halfLtLen, ltLen, openings, wallColor = null, hasStorage = false, storageDepth = 0 }) {
  const allItems = useMemo(() => {
    const result = [];
    for (const [wallKey, items] of Object.entries(openings)) {
      if (!items || items.length === 0 || (wallKey === "storage_partition" && !hasStorage)) continue;
      const parsed = items.map((it) => ({ it, p: parseOpening(it) })).filter((x) => x.p);
      if (parsed.length === 0) continue;

      let wallLen, wallH;
      if (wallKey === "outer") {
        wallLen = isSide ? ltLen : adjW;
        wallH = ltH;
      } else {
        wallLen = ltW;
        // End walls are sloped (taller at the building, shorter at the eave).
        // Cap openings to the lean-to's height (ltH) so a wide frameout never
        // exceeds the roof; the `* 0.9` below leaves a ~10% head allowance.
        wallH = ltH;
      }

      const spacing = wallLen / (parsed.length + 1);
      parsed.forEach(({ it, p }, idx) => {
        const offset = spacing * (idx + 1) - wallLen / 2;
        result.push({ ...p, it, wallKey, offset, wallLen, wallH });
      });
    }
    return result;
  }, [openings, isSide, ltLen, adjW, ltW, ltH, hasStorage]);

  // Open/closed state per opening — double-clicking a door toggles its
  // open/close animation.
  const [openMap, setOpenMap] = useState({});

  const Z_OFFSET = MAIN_TUBE_SKIN;

  return (
    <group>
      {allItems.map((item, i) => {
        const ow = item.wFt * SCALE;
        const oh = Math.min(item.hFt * SCALE, item.wallH * 0.9);
        // Windows/vents/frameouts honor a dragged sillFt; doors meet the floor.
        const sill = isYmovable(item.type)
          ? Math.min(Math.max(0, Number(item.it?.sillFt ?? 0) * SCALE), Math.max(0, item.wallH - oh))
          : 0;

        let pos, rot;
        if (item.wallKey === "outer") {
          if (isSide) {
            pos = [sign * (halfW + ltW) + sign * Z_OFFSET, sill + oh / 2, item.offset];
            rot = [0, sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0];
          } else {
            pos = [adjXCenter + item.offset, sill + oh / 2, sign * (l / 2 + ltW) + sign * Z_OFFSET];
            rot = [0, sign > 0 ? 0 : Math.PI, 0];
          }
        } else if (item.wallKey === "storage_partition") {
          if (isSide) {
            const midX = sign * (halfW + ltW / 2);
            pos = [midX + item.offset, sill + oh / 2, -halfLtLen + storageDepth + Z_OFFSET];
            rot = [0, 0, 0];
          } else {
            const midZ = sign * (l / 2 + ltW / 2);
            pos = [adjXCenter - adjW / 2 + storageDepth + Z_OFFSET, sill + oh / 2, midZ + item.offset];
            rot = [0, Math.PI / 2, 0];
          }
        } else if (item.wallKey === "left_end") {
          if (isSide) {
            const midX = sign * (halfW + ltW / 2);
            pos = [midX + item.offset, sill + oh / 2, -halfLtLen - Z_OFFSET];
            rot = [0, Math.PI, 0];
          } else {
            const midZ = sign * (l / 2 + ltW / 2);
            pos = [adjXCenter - adjW / 2 - Z_OFFSET, sill + oh / 2, midZ + item.offset];
            rot = [0, -Math.PI / 2, 0];
          }
        } else {
          if (isSide) {
            const midX = sign * (halfW + ltW / 2);
            pos = [midX + item.offset, sill + oh / 2, halfLtLen + Z_OFFSET];
            rot = [0, 0, 0];
          } else {
            const midZ = sign * (l / 2 + ltW / 2);
            pos = [adjXCenter + adjW / 2 + Z_OFFSET, sill + oh / 2, midZ + item.offset];
            rot = [0, Math.PI / 2, 0];
          }
        }

        const openKey = `${item.wallKey}:${i}`;
        return (
          <group key={`lt-opening-${i}`} position={pos} rotation={rot}
            onDoubleClick={(e) => { e.stopPropagation(); setOpenMap((prev) => ({ ...prev, [openKey]: !prev[openKey] })); }}>
            <Opening3D ow={ow} oh={oh} type={item.type} itemName={item.it?.name} wallColor={wallColor} open={!!openMap[openKey]} />
            {/* Interior face — same assembly rotated 180° (reads as one door
                from either side of the wall) */}
            <group rotation={[0, Math.PI, 0]}>
              <Opening3D ow={ow} oh={oh} type={item.type} itemName={item.it?.name} wallColor={wallColor} open={!!openMap[openKey]} flip />
            </group>
          </group>
        );
      })}
    </group>
  );
}

// Hole rects for a side lean-to's end wall, sized to match LeanToOpenings
// exactly (centered cx in the wall's local horizontal axis, floor-relative
// y0/y1). wallH is the average end-wall height LeanToOpenings uses for the
// opening height clamp ((attachH + ltH) / 2).
function leanToEndWallHoles(items = [], wallLenScene, wallH) {
  const parsed = (items || []).map((it) => ({ it, p: parseOpening(it) })).filter((x) => x.p);
  if (parsed.length === 0) return [];
  const spacing = wallLenScene / (parsed.length + 1);
  return parsed.map(({ it, p }, idx) => {
    const offset = spacing * (idx + 1) - wallLenScene / 2;
    const w = p.wFt * SCALE;
    const h = Math.min(p.hFt * SCALE, wallH * 0.9);
    const sill = isYmovable(p.type)
      ? Math.min(Math.max(0, Number(it.sillFt ?? 0) * SCALE), Math.max(0, wallH - h))
      : 0;
    return { cx: offset, w, y0: sill, y1: sill + h };
  });
}

// ─── LEAN-TO END WALL (trapezoid) ──────────────────────────

// `type` (custom panels, same meaning as the mono-slope end walls; inner =
// building side at innerH, outer = lean-to eave at outerH):
//   "top_N"       N-ft strip hanging from the sloped top edge
//   "gable"       wedge above the outer eave height
//   "ext_gable_N" wedge + N-ft strip below the outer eave height
//   anything else full wall (openings cut only into full walls)
function LeanToEndWall({ innerX, outerX, innerH, outerH, z, zOuter, isEndType = false, tex, flip, holes = [], type = "enclosed" }) {
  const midX = (innerX + outerX) / 2;
  const run = Math.abs(outerX - innerX) || 1;
  const maxH = Math.max(innerH, outerH);
  const topFt = typeof type === "string" && type.startsWith("top_") ? parseFloat(type.slice(4)) : NaN;
  const extFt = typeof type === "string" && type.startsWith("ext_gable_") ? parseFloat(type.slice(10)) : NaN;
  let botInner = 0;
  let botOuter = 0;
  if (Number.isFinite(topFt)) {
    botInner = Math.max(0, innerH - topFt * SCALE);
    botOuter = Math.max(0, outerH - topFt * SCALE);
  } else if (type === "gable") {
    botInner = outerH;
    botOuter = outerH;
  } else if (Number.isFinite(extFt)) {
    botInner = Math.max(0, outerH - extFt * SCALE);
    botOuter = botInner;
  }
  const isFull = botInner === 0 && botOuter === 0;
  const holed = !isEndType && isFull && (holes?.length > 0);

  const geo = useMemo(() => {
    if (isEndType) {
      // End lean-to: wall perpendicular to X axis (kept simple — no cutouts).
      const g = new THREE.BufferGeometry();
      const x = innerX;
      const verts = new Float32Array([
        x, botInner, z,
        x, botOuter, zOuter,
        x, outerH, zOuter,
        x, innerH, z,
      ]);
      const uvs = new Float32Array([0, 0, 1, 0, 1, 0.8, 0, 1]);
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(flip ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
      g.computeVertexNormals();
      return g;
    }

    if (holed) {
      // Side lean-to end wall with an opening: build the trapezoid as a holed
      // shape in centered local X (0 = wall midpoint) with floor-relative Y,
      // then translate the mesh to the wall's midpoint in world space.
      const innerAtMinus = innerX < outerX; // taller (building) corner at -run/2
      const outline = innerAtMinus
        ? [[-run / 2, 0], [run / 2, 0], [run / 2, outerH], [-run / 2, innerH]]
        : [[-run / 2, 0], [run / 2, 0], [run / 2, innerH], [-run / 2, outerH]];
      return makeHoledWallShape(
        outline,
        holes,
        { width: run, bottomY: 0, eaveY: maxH, peakY: maxH, eaveV: 1 }
      );
    }

    // Side lean-to: wall perpendicular to Z axis
    const g = new THREE.BufferGeometry();
    const verts = new Float32Array([
      innerX, botInner, z,
      outerX, botOuter, z,
      outerX, outerH, z,
      innerX, innerH, z,
    ]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 0.8, 0, 1]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(flip ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    return g;
  }, [innerX, outerX, innerH, outerH, z, zOuter, isEndType, flip, holed, holes, run, maxH, botInner, botOuter]);

  return (
    <mesh geometry={geo} position={holed ? [midX, 0, z] : undefined} castShadow>
      <meshStandardMaterial map={tex} normalMap={tex.userData.normalMap} {...WALL_MAT} side={2} />
    </mesh>
  );
}

// ─── CAMERA CONTROLLER — auto-focus on selected wall ──────
// Smoothly orbits the camera to face the highlighted wall while preserving
// distance and elevation. Only activates when highlightedWall changes.

function CameraController({ highlightedWall, grid, maxDim, storage = null, leantos = [] }) {
  const { camera, gl } = useThree();
  const targetPos = useRef(null);
  const prevWall = useRef(null);

  // Cancel auto-focus when user starts orbiting
  useEffect(() => {
    const canvas = gl.domElement;
    const cancel = () => { targetPos.current = null; };
    canvas.addEventListener("pointerdown", cancel);
    canvas.addEventListener("wheel", cancel, { passive: true });
    return () => {
      canvas.removeEventListener("pointerdown", cancel);
      canvas.removeEventListener("wheel", cancel);
    };
  }, [gl]);

  useEffect(() => {
    if (!highlightedWall) {
      // Focus ended — drop any pending focus move (the home glide takes over)
      // and forget the last wall so it can be focused again later.
      targetPos.current = null;
      prevWall.current = null;
      return;
    }
    if (highlightedWall === prevWall.current) return;
    prevWall.current = highlightedWall;

    const { l, w, halfW } = grid;
    const dist = maxDim * 1.3;
    const elev = dist * 0.5;
    const [sectionKey, selectedWallKey] = highlightedWall.split(":");

    if (sectionKey === "storage" && storage?.location) {
      const loc = storageWorldSide(storage.location);
      const isSide = loc === "left" || loc === "right";
      const sign = loc === "left" || loc === "front" ? -1 : 1;
      const span = isSide ? w : l;
      const depth = Math.min(Number(storage.depthFt) * SCALE, Math.max(span - 2 * SCALE, 0.2));
      const OUT = MAIN_TUBE * 0.6;
      let camTarget;
      if (selectedWallKey === "outer") {
        camTarget = isSide
          ? new THREE.Vector3(sign * (halfW + OUT) + sign * dist, elev, 0)
          : new THREE.Vector3(0, elev, sign * (l / 2 + OUT) + sign * dist);
      } else if (selectedWallKey === "front_end" || selectedWallKey === "back_end") {
        const zCap = (selectedWallKey === "front_end" ? -1 : 1) * (l / 2 - 0.02);
        camTarget = new THREE.Vector3(0, elev, zCap + (selectedWallKey === "front_end" ? -dist : dist));
      } else if (selectedWallKey === "left_end" || selectedWallKey === "right_end") {
        const xCap = (selectedWallKey === "left_end" ? 1 : -1) * (halfW - 0.02);
        camTarget = new THREE.Vector3(xCap + (selectedWallKey === "left_end" ? dist : -dist), elev, 0);
      } else {
        camTarget = isSide
          ? new THREE.Vector3(sign * (halfW - depth) - sign * dist, elev, 0)
          : new THREE.Vector3(0, elev, sign * (l / 2 - depth) - sign * dist);
      }
      targetPos.current = camTarget.setX(MIRROR_X * camTarget.x);
      return;
    }

    if (selectedWallKey === "storage_partition") {
      const lt = leantos.find((entry) => entry.side_key === sectionKey);
      if (lt) {
        const isSide = sectionKey === "left" || sectionKey === "right";
        const sign = sectionKey === "right" || sectionKey === "back" ? 1 : -1;
        const ltW = (lt.width_ft || 10) * SCALE;
        const maxLen = isSide ? l : w;
        // End lean-tos span the full end wall (see LeanToSystem).
        const ltLen = isSide && lt.length_ft ? Math.min(lt.length_ft * SCALE, maxLen) : maxLen;
        const depth = getLeanToStorageDepthFt(lt, ltLen / SCALE) * SCALE;
        const camTarget = isSide
          ? new THREE.Vector3(sign * (halfW + ltW / 2), elev, -ltLen / 2 + depth + dist)
          : new THREE.Vector3(-ltLen / 2 + depth + dist, elev, sign * (l / 2 + ltW / 2));
        targetPos.current = camTarget.setX(MIRROR_X * camTarget.x);
        return;
      }
    }

    // Strip tick suffix if present (e.g. "front:3" → "front")
    const wallKey = highlightedWall.includes(":") ? highlightedWall.split(":")[0] : highlightedWall;
    let camTarget;
    switch (wallKey) {
      case "front":
        camTarget = new THREE.Vector3(dist * 0.3, elev, -dist);
        break;
      case "back":
        camTarget = new THREE.Vector3(-dist * 0.3, elev, dist);
        break;
      case "left":
        camTarget = new THREE.Vector3(-dist, elev, dist * 0.3);
        break;
      case "right":
        camTarget = new THREE.Vector3(dist, elev, -dist * 0.3);
        break;
      default:
        return;
    }
    targetPos.current = camTarget.setX(MIRROR_X * camTarget.x);
  }, [highlightedWall, grid, maxDim, storage, leantos]);

  useFrame(() => {
    if (!targetPos.current) return;
    camera.position.lerp(targetPos.current, 0.06);
    if (camera.position.distanceTo(targetPos.current) < 0.05) {
      targetPos.current = null;
    }
  });

  return null;
}

// ─── VIEWER CONTROL BRIDGE — camera API for the floating toolbar ──
// Lives inside the Canvas. Publishes rotate/zoom/preset/capture operations
// on apiRef so the HTML toolbar overlay can drive the camera. Records a
// camera snapshot after every user navigation (OrbitControls "end" event)
// so the toolbar's undo/redo can walk back and forth through past views.

function ViewerControlBridge({ apiRef, planApiRef, onNavSnapshot, maxDim, grid, center, fitBox = null, autoFit = true }) {
  const { camera, gl, scene, controls } = useThree();
  const anim = useRef(null);        // { pos, tgt } — smooth camera transition
  const baseDist = useRef(null);    // 100% zoom distance (updated by auto-fit)
  const inited = useRef(false);
  const fittedOnce = useRef(false);

  // Distance (100% zoom) that frames the whole building in the current
  // viewport: bounding-sphere radius over the narrower half-FOV (portrait /
  // narrow canvases use the horizontal FOV). Falls back to maxDim * 1.3.
  const fitDistance = () => {
    if (!fitBox) return maxDim * 1.3;
    const radius = 0.5 * Math.hypot(fitBox.sizeX, fitBox.sizeY, fitBox.sizeZ);
    const vHalf = THREE.MathUtils.degToRad(camera.fov ?? 50) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * (camera.aspect || 1));
    return (radius / Math.sin(Math.min(vHalf, hHalf))) * FIT_MARGIN;
  };

  // Smooth animated transitions (presets, reset, history jumps)
  useFrame(() => {
    const a = anim.current;
    if (!a) return;
    camera.position.lerp(a.pos, 0.12);
    if (controls) {
      controls.target.lerp(a.tgt, 0.12);
      controls.update();
    }
    if (camera.position.distanceTo(a.pos) < 0.02) anim.current = null;
  });

  // Build the camera API once OrbitControls is mounted (makeDefault)
  useEffect(() => {
    if (!controls) return;
    const tgt = controls.target;
    if (!baseDist.current) baseDist.current = camera.position.distanceTo(tgt) * DEFAULT_ZOOM;

    const orbitBy = (deg) => {
      anim.current = null;
      const off = camera.position.clone().sub(tgt);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(deg));
      camera.position.copy(tgt).add(off);
      camera.lookAt(tgt);
      controls.update();
    };

    const getAzimuth = () => {
      const off = camera.position.clone().sub(tgt);
      return THREE.MathUtils.radToDeg(Math.atan2(off.x, off.z));
    };

    const setAzimuth = (deg) => {
      const delta = ((deg - getAzimuth() + 540) % 360) - 180;
      orbitBy(delta);
    };

    const zoomBy = (factor) => {
      // Top View: the floor plan owns the zoom (shared zoom UI).
      if (planApiRef?.current) { planApiRef.current.by(factor); return; }
      anim.current = null;
      const off = camera.position.clone().sub(tgt);
      const len = THREE.MathUtils.clamp(
        off.length() / factor,
        controls.minDistance ?? 1,
        controls.maxDistance ?? Infinity
      );
      off.setLength(len);
      camera.position.copy(tgt).add(off);
      camera.lookAt(tgt);
      controls.update();
    };

    const getZoomPercent = () =>
      planApiRef?.current
        ? planApiRef.current.getPercent()
        : Math.round((baseDist.current / camera.position.distanceTo(tgt)) * 100);

    const setZoomPercent = (pct) => {
      // Top View: the floor plan owns the zoom (shared zoom UI).
      if (planApiRef?.current) { planApiRef.current.setPercent(pct); return; }
      anim.current = null;
      const off = camera.position.clone().sub(tgt);
      const len = THREE.MathUtils.clamp(
        baseDist.current / (pct / 100),
        controls.minDistance ?? 1,
        controls.maxDistance ?? Infinity
      );
      off.setLength(len);
      camera.position.copy(tgt).add(off);
      camera.lookAt(tgt);
      controls.update();
    };

    const snapshot = () => ({
      position: camera.position.toArray(),
      target: tgt.toArray(),
    });

    const applyView = (snap) => {
      anim.current = {
        pos: new THREE.Vector3().fromArray(snap.position),
        tgt: new THREE.Vector3().fromArray(snap.target),
      };
    };

    apiRef.current = {
      rotateBy: orbitBy,
      getAzimuth,
      setAzimuth,
      zoomBy,
      getZoomPercent,
      setZoomPercent,
      snapshot,
      applyView,
      resetView: () => apiRef.current?.setView("home"),
      setView: (name, opts = {}) => {
        // 100% = fitted distance; presets sit at DEFAULT_ZOOM (90%) of it.
        const fit = fitDistance();
        baseDist.current = fit;
        const d = fit / DEFAULT_ZOOM;
        const elev = d * 0.5;
        // Offsets from the orbit target (true building center).
        const offsets = {
          home: [-d * 0.64, grid.h * 0.18, -d * 0.77],
          iso: [d * 0.9, d * 0.7, d * 0.8],
          front: [0, elev, -d],
          back: [0, elev, d],
          left: [MIRROR_X * -d, elev, 0],
          right: [MIRROR_X * d, elev, 0],
          top: [0, d * 1.15, 0.01],
        };
        const o = offsets[name];
        if (!o) return;
        const target = [center.x, grid.h / 2, center.z];
        const position = [target[0] + o[0], target[1] + o[1], target[2] + o[2]];
        if (opts.instant) {
          anim.current = null;
          camera.position.fromArray(position);
          controls.target.fromArray(target);
          camera.lookAt(controls.target);
          controls.update();
          return;
        }
        applyView({ position, target });
      },
      capture: () => {
        gl.render(scene, camera);
        return gl.domElement.toDataURL("image/png");
      },
    };

    if (!inited.current) {
      inited.current = true;
      onNavSnapshot?.(snapshot());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fitDistance reads fitBox/camera (listed)
  }, [camera, gl, scene, controls, apiRef, planApiRef, maxDim, grid, center, fitBox, onNavSnapshot]);

  // Auto-fit: when the building's overall size or center changes (style,
  // size, lean-tos, roof extension), re-frame at the home view. First run
  // jumps instantly; later changes glide after a short debounce (typing /
  // slider). Skipped in Top View and while a wall/lean-to focus is active —
  // the focus-end effect returns home with the new fit.
  const fitKey = fitBox
    ? [fitBox.sizeX, fitBox.sizeY, fitBox.sizeZ, center.x, center.z].map((v) => Number(v).toFixed(2)).join("|")
    : "";
  useEffect(() => {
    if (!controls || !autoFit || !fitKey || !apiRef.current?.setView) return;
    if (!fittedOnce.current) {
      fittedOnce.current = true;
      apiRef.current.setView("home", { instant: true });
      return;
    }
    const t = window.setTimeout(() => apiRef.current?.setView("home"), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the size key changes
  }, [fitKey, controls]);

  // Record a view snapshot after each user navigation gesture
  useEffect(() => {
    if (!controls || !onNavSnapshot) return;
    const onEnd = () => onNavSnapshot({
      position: camera.position.toArray(),
      target: controls.target.toArray(),
    });
    controls.addEventListener("end", onEnd);
    return () => controls.removeEventListener("end", onEnd);
  }, [controls, camera, onNavSnapshot]);

  return null;
}

// ─── VIEWER TOOLBAR — floating controls with flowing flyout panels ──
// Bottom-centered pill of camera buttons (matches the reference design).
// Clicking a button runs its quick action and flows a small animated panel
// out above it with finer controls (view presets, sliders, toggles, …).
// Only one panel is open at a time; outside click / Escape closes it.

const VP_BTN = {
  width: 36, height: 36, borderRadius: 10, border: "none",
  background: "transparent", color: "#333",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 15, cursor: "pointer", transition: "background 0.15s",
};

const VP_PANEL = {
  position: "absolute",
  bottom: "calc(100% + 12px)",
  left: "50%",
  transform: "translateX(-50%)",
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
  border: "1px solid #e5e5e5",
  padding: "12px 14px",
  width: 250,
  zIndex: 40,
  animation: "psbVpFlyIn 0.18s ease-out",
};

const VP_CHIP = {
  border: "1px solid #ddd", background: "#fff", color: "#333",
  borderRadius: 8, padding: "4px 10px", fontSize: 12,
  cursor: "pointer", transition: "background 0.15s, border-color 0.15s",
};

const VP_LABEL = {
  fontSize: 11, fontWeight: 600, color: "#666",
  textTransform: "uppercase", letterSpacing: 0.4,
};

function ViewerToolbar({ apiRef, hist, onUndo, onRedo, onJump, display, setDisplay, onViewModeChange }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(null); // { panel, anchorIdx } | null
  const [status, setStatus] = useState("");
  const [azimuth, setAzimuth] = useState(0);
  const [zoomPct, setZoomPct] = useState(Math.round(DEFAULT_ZOOM * 100));

  const canUndo = hist.index > 0;
  const canRedo = hist.index >= 0 && hist.index < hist.stack.length - 1;

  const toggle = (panel, anchorIdx) => {
    setStatus("");
    const cur = open;
    if (cur && cur.panel === panel && cur.anchorIdx === anchorIdx) {
      setOpen(null);
      return;
    }
    // Sync slider readouts from the camera when a panel opens
    if (panel === "rotate") setAzimuth(apiRef.current?.getAzimuth() ?? 0);
    if (panel === "zoom") setZoomPct(apiRef.current?.getZoomPercent() ?? 100);
    setOpen({ panel, anchorIdx });
  };

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(null);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const savePng = () => {
    const url = apiRef.current?.capture();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "building-view.png";
    a.click();
    setStatus("Image saved");
  };

  const copyPng = async () => {
    try {
      const url = apiRef.current?.capture();
      if (!url) return;
      const blob = await (await fetch(url)).blob();
      await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })]);
      setStatus("Copied to clipboard");
    } catch {
      setStatus("Clipboard unavailable — use Save PNG");
    }
  };

  // ── Flyout panel contents (anchored above the button that opened them) ──
  const renderPanel = (panel) => {
    switch (panel) {
      case "views":
        return (
          <div>
            <div style={VP_LABEL} className="mb-2">Camera views</div>
            <div className="d-flex flex-wrap gap-1 mb-2">
              {["iso", "front", "back", "left", "right", "top"].map((v) => (
                <button key={v} style={VP_CHIP}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f2f2f2")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                  onClick={() => { apiRef.current?.setView(v); onViewModeChange?.(v === "top" ? "top" : "3d"); }}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <button style={{ ...VP_CHIP, width: "100%" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f2f2f2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              onClick={() => { apiRef.current?.resetView(); onViewModeChange?.("3d"); }}>
              Reset view
            </button>
          </div>
        );
      case "capture":
        return (
          <div>
            <div style={VP_LABEL} className="mb-2">Save image</div>
            <div className="d-flex gap-1">
              <button style={{ ...VP_CHIP, flex: 1 }} onClick={savePng}>
                <AppIcon icon="image" className="me-1" /> Save PNG
              </button>
              <button style={{ ...VP_CHIP, flex: 1 }} onClick={copyPng}>
                <AppIcon icon="copy" className="me-1" /> Copy
              </button>
            </div>
            {status && <div className="mt-2" style={{ fontSize: 11, color: "#2a7" }}>{status}</div>}
          </div>
        );
      case "rotate":
        return (
          <div>
            <div style={VP_LABEL} className="mb-2">Orbit angle — {Math.round(azimuth)}°</div>
            <input
              type="range" min={-180} max={180} step={1} value={Math.round(azimuth)}
              style={{ width: "100%", accentColor: "#333" }}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAzimuth(v);
                apiRef.current?.setAzimuth(v);
              }}
            />
            <div className="d-flex gap-1 mt-2">
              <button style={{ ...VP_CHIP, flex: 1 }} onClick={() => { apiRef.current?.rotateBy(-90); setAzimuth(apiRef.current?.getAzimuth() ?? 0); }}>−90°</button>
              <button style={{ ...VP_CHIP, flex: 1 }} onClick={() => { apiRef.current?.rotateBy(90); setAzimuth(apiRef.current?.getAzimuth() ?? 0); }}>+90°</button>
              <button style={{ ...VP_CHIP, flex: 1 }} onClick={() => { apiRef.current?.setAzimuth(180); setAzimuth(180); }}>Front</button>
            </div>
          </div>
        );
      case "zoom":
        return (
          <div>
            <div style={VP_LABEL} className="mb-2">Zoom — {zoomPct}%</div>
            <input
              type="range" min={25} max={250} step={5} value={zoomPct}
              style={{ width: "100%", accentColor: "#333" }}
              onChange={(e) => {
                const v = Number(e.target.value);
                setZoomPct(v);
                apiRef.current?.setZoomPercent(v);
              }}
            />
            <div className="d-flex gap-1 mt-2">
              <button style={{ ...VP_CHIP, flex: 1 }} onClick={() => { apiRef.current?.zoomBy(1.2); setZoomPct(apiRef.current?.getZoomPercent() ?? 100); }}>Zoom in</button>
              <button style={{ ...VP_CHIP, flex: 1 }} onClick={() => { apiRef.current?.zoomBy(1 / 1.2); setZoomPct(apiRef.current?.getZoomPercent() ?? 100); }}>Zoom out</button>
              <button style={{ ...VP_CHIP, flex: 1 }} onClick={() => { apiRef.current?.setZoomPercent(100); setZoomPct(100); }}>Fit</button>
            </div>
          </div>
        );
      case "history":
        return (
          <div>
            <div style={VP_LABEL} className="mb-2">View history</div>
            {hist.stack.length === 0 ? (
              <div style={{ fontSize: 12, color: "#999" }}>No views recorded yet.</div>
            ) : (
              <div style={{ maxHeight: 170, overflowY: "auto" }}>
                {hist.stack.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => onJump(i)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      border: "none", borderRadius: 6, padding: "4px 8px",
                      fontSize: 12, cursor: "pointer",
                      background: i === hist.index ? "#333" : "transparent",
                      color: i === hist.index ? "#fff" : "#333",
                    }}
                  >
                    View {i + 1}{i === hist.index ? "  •  current" : ""}
                  </button>
                ))}
              </div>
            )}
            <div className="d-flex gap-1 mt-2">
              <button style={{ ...VP_CHIP, flex: 1, opacity: canUndo ? 1 : 0.4 }} disabled={!canUndo} onClick={onUndo}>
                <AppIcon icon="arrow-rotate-left" className="me-1" /> Undo
              </button>
              <button style={{ ...VP_CHIP, flex: 1, opacity: canRedo ? 1 : 0.4 }} disabled={!canRedo} onClick={onRedo}>
                Redo <AppIcon icon="arrow-rotate-right" className="ms-1" />
              </button>
            </div>
          </div>
        );
      case "background":
        return (
          <div>
            <div style={VP_LABEL} className="mb-2">Change background</div>
            <div className="d-flex flex-column gap-1">
              {BG_PRESETS.map((p) => {
                const active = (display.background || "default") === p.id;
                const isColor = p.thumb.startsWith("#");
                return (
                  <button
                    key={p.id}
                    onClick={() => setDisplay((d) => ({ ...d, background: p.id }))}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      border: active ? "2px solid #333" : "1px solid #e2e2e2",
                      borderRadius: 8, padding: 4, background: active ? "#f4f4f4" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {/* Thumbnail: photo layer (when the asset exists) over the
                        procedural swatch, which shows through until it does. */}
                    <span
                      style={{
                        width: 56, height: 34, borderRadius: 6, flexShrink: 0,
                        border: "1px solid #e2e2e2",
                        backgroundColor: isColor ? p.thumb : undefined,
                        backgroundImage: p.id === "default"
                          ? p.thumb
                          : isColor
                            ? `url(/images/backgrounds/${p.id}.jpg)`
                            : `url(/images/backgrounds/${p.id}.jpg), ${p.thumb}`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                    <span style={{ flex: 1, textAlign: "left", fontSize: 12, fontWeight: active ? 600 : 400, color: "#333" }}>
                      {p.name}
                    </span>
                    {active && <AppIcon icon="check" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      case "display":
        return (
          <div>
            <div style={VP_LABEL} className="mb-2">View options</div>
            {[
              ["shadows", "Shadows"],
              ["labels", "Building labels"],
              ["watermark", "Ground logo"],
              ["autoRotate", "Auto-rotate"],
            ].map(([key, label]) => (
              <label key={key} className="d-flex align-items-center justify-content-between mb-1" style={{ fontSize: 12, cursor: "pointer" }}>
                {label}
                <input
                  type="checkbox"
                  checked={!!display[key]}
                  onChange={(e) => setDisplay((d) => ({ ...d, [key]: e.target.checked }))}
                  style={{ accentColor: "#333" }}
                />
              </label>
            ))}
            {display.autoRotate && (
              <div className="mt-2">
                <div style={VP_LABEL} className="mb-1">Spin speed — {display.autoRotateSpeed.toFixed(1)}</div>
                <input
                  type="range" min={0.5} max={5} step={0.5} value={display.autoRotateSpeed}
                  style={{ width: "100%", accentColor: "#333" }}
                  onChange={(e) => setDisplay((d) => ({ ...d, autoRotateSpeed: Number(e.target.value) }))}
                />
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  // Quick actions run when a toolbar button is pressed (before its panel opens)
  const runQuickAction = (action) => {
    const api = apiRef.current;
    switch (action) {
      case "reset": api?.resetView(); onViewModeChange?.("3d"); break;
      case "rotL": api?.rotateBy(-15); break;
      case "rotR": api?.rotateBy(15); break;
      case "zoomIn": api?.zoomBy(1.2); break;
      case "zoomOut": api?.zoomBy(1 / 1.2); break;
      case "undo": onUndo(); break;
      case "redo": onRedo(); break;
      default: break;
    }
  };

  // Buttons in reference order: reset/views · capture · rotate ⟲ ⟳ ·
  // zoom + − · undo redo · change background · view options (highlighted).
  const buttons = [
    { action: "reset", panel: "views", icon: "rotate", title: "Views & reset" },
    { panel: "capture", icon: "image", title: "Save image" },
    { action: "rotL", panel: "rotate", icon: "rotate-left", title: "Rotate left" },
    { action: "rotR", panel: "rotate", icon: "rotate-right", title: "Rotate right" },
    { action: "zoomIn", panel: "zoom", icon: "magnifying-glass-plus", title: "Zoom in" },
    { action: "zoomOut", panel: "zoom", icon: "magnifying-glass-minus", title: "Zoom out" },
    { action: "undo", panel: "history", icon: "arrow-rotate-left", title: "Undo view", disabled: !canUndo },
    { action: "redo", panel: "history", icon: "arrow-rotate-right", title: "Redo view", disabled: !canRedo },
    { panel: "background", icon: "mountain-sun", title: "Change background", highlight: true },
    { panel: "display", icon: "cube", title: "View options", highlight: true },
  ];

  return (
    <div ref={rootRef} style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 30 }}>
      {/* Flow-in keyframes for the flyout panels */}
      <style>{`
        @keyframes psbVpFlyIn {
          from { opacity: 0; transform: translate(-50%, 8px) scale(0.96); }
          to   { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
      `}</style>

      <div className="d-flex align-items-center gap-1"
        style={{ background: "#fff", borderRadius: 16, padding: 6, boxShadow: "0 6px 24px rgba(0,0,0,0.16)", border: "1px solid #e8e8e8" }}>
        {buttons.map((b, i) => {
          const isOpen = open && open.panel === b.panel && open.anchorIdx === i;
          return (
            <div key={i} style={{ position: "relative" }}>
              <button
                title={b.title}
                disabled={b.disabled}
                style={{
                  ...VP_BTN,
                  background: isOpen || b.highlight ? "#e9e9e9" : "transparent",
                  opacity: b.disabled ? 0.35 : 1,
                  cursor: b.disabled ? "default" : "pointer",
                }}
                onMouseEnter={(e) => { if (!b.disabled && !isOpen && !b.highlight) e.currentTarget.style.background = "#f4f4f4"; }}
                onMouseLeave={(e) => { if (!isOpen && !b.highlight) e.currentTarget.style.background = "transparent"; }}
                onClick={() => { runQuickAction(b.action); toggle(b.panel, i); }}
              >
                <AppIcon icon={b.icon} />
              </button>

              {isOpen && (
                <div style={VP_PANEL}>
                  {renderPanel(b.panel)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── VIEW MODE TOGGLE — 3D / Top View segmented pill ───────
// Top-left of the viewport (reference design). Switches the camera between
// the free 3D perspective and a straight top-down view. Returning to 3D
// always lands on the default (home, front-left) POV, fitted to the
// building's current size, instantly (no glide from overhead).

const VM_PILL = {
  display: "flex", alignItems: "center", gap: 2,
  background: "#fff", borderRadius: 999, padding: 4,
  border: "1px solid #e8e8e8", boxShadow: "0 6px 24px rgba(0,0,0,0.16)",
};

const VM_SEGMENT = {
  border: "none", borderRadius: 999, padding: "7px 18px",
  fontSize: 13, fontWeight: 600, lineHeight: 1.2,
  background: "transparent", color: "#333",
  cursor: "pointer", transition: "background 0.15s, color 0.15s",
};

function ViewModeToggle({ apiRef, mode, onModeChange, topView }) {
  const pick = (m) => {
    if (m === mode) return;
    const api = apiRef.current;
    if (m === "top") {
      api?.applyView(topView());
    } else if (api?.setView) {
      // Back to 3D: default POV, fitted to the current building, no glide.
      api.setView("home", { instant: true });
    } else {
      api?.resetView();
    }
    onModeChange(m);
  };

  const segment = (m, label, title) => (
    <button
      type="button"
      title={title}
      aria-pressed={mode === m}
      style={{ ...VM_SEGMENT, ...(mode === m ? { background: "#2b2f36", color: "#fff" } : null) }}
      onMouseEnter={(e) => { if (mode !== m) e.currentTarget.style.background = "#f4f4f4"; }}
      onMouseLeave={(e) => { if (mode !== m) e.currentTarget.style.background = "transparent"; }}
      onClick={() => pick(m)}
    >
      {label}
    </button>
  );

  return (
    <div style={{ position: "absolute", top: 16, left: 16, zIndex: 30 }} role="group" aria-label="View mode">
      <div style={VM_PILL}>
        {segment("3d", "3D", "3D view")}
        {segment("top", "Top View", "Top view")}
      </div>
    </div>
  );
}

// ─── TOP VIEW FLOOR PLAN ──────────────────────────────────
// Flat 2D floor-plan overlay shown while the Top View toggle is active
// (idea-room mock): installation-surface slab, wall bands with real
// thickness (filled band = enclosed wall; open walls: black dashed line on
// the gable ends, thin white line on the eave sides), openings cut through
// (doors render as hollow rectangles, windows as double lines), and side
// names around the edges.
// Mock orientation: Front at left, Back at right, Left at top, Right at
// bottom — scene z maps to SVG x (front → left), scene x maps to SVG y
// (left side → top). Interactive: the wheel zooms about the view center (down
// to a thumbnail), dragging pans, double-click resets; the viewer's zoom
// toolbar (flyout + magnifier buttons) drives the plan zoom through the
// shared zoom API.

const FP_ZOOM_MAX = 12;  // zoom ceiling (100% = fitted view, like the 3D zoom)
const FP_ZOOM_MIN = 0.2; // zoom-out floor — the plan can shrink to a thumbnail

// Center-anchored zoom step: scales the plan about the viewBox center (the
// drawing is centered in the viewBox, and xMidYMid keeps it screen-centered),
// so the middle of the view stays put while the zoom changes. Shared by the
// wheel handler and the viewer's zoom toolbar so both behave the same.
function zoomPlanView(v, zoom, vb) {
  const z = Math.min(FP_ZOOM_MAX, Math.max(FP_ZOOM_MIN, zoom));
  const k = z / v.zoom;
  // Anchor = viewBox centre (the drafting sheet's viewBox does not start at 0,0).
  const ax = vb?.width ? (vb.x || 0) + vb.width / 2 : 0;
  const ay = vb?.height ? (vb.y || 0) + vb.height / 2 : 0;
  return { zoom: z, tx: ax - (ax - v.tx) * k, ty: ay - (ay - v.ty) * k };
}

function TopViewFloorPlan({ grid, walls, openings, leantos, apiRef, watermark = false }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  // Zoom/pan transform applied to the plan content: translate(pan) scale(zoom).
  // zoom = 1 is the fitted view; the wheel zooms about the view center,
  // dragging pans, and a double-click resets to fit.
  const [view, setView] = useState({ zoom: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  const dragRef = useRef(null);

  // Wheel zoom about the view center (not the cursor). Mounted with
  // { passive: false } so the page behind doesn't scroll (React's synthetic
  // onWheel can't preventDefault).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const vb = svgRef.current?.viewBox?.baseVal;
      setView((v) => zoomPlanView(v, v.zoom * Math.exp(-dy * 0.002), vb));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Drag to pan (pointer capture keeps the drag alive off the element).
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return;
    // ctm.a = screen px per viewBox unit (uniform scale).
    setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.x) / ctm.a, ty: d.ty + (e.clientY - d.y) / ctm.a }));
  };
  const onPointerUp = (e) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // Symbol legend — same entries as the printed Order Form floor plan.
  const legendEntries = useMemo(
    () => buildLegendEntries({ walls, openings, leantos }),
    [walls, openings, leantos]
  );

  useEffect(() => { viewRef.current = view; });

  // Expose the plan zoom through apiRef (same bridge pattern as
  // ViewerControlBridge) so the viewer's zoom toolbar — the "Zoom — %"
  // flyout slider and the magnifier buttons — drives the floor plan while
  // Top View is active. Percent zoom matches the 3D zoom system:
  // 100% = fitted view.
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      getPercent: () => Math.round(viewRef.current.zoom * 100),
      setPercent: (pct) => setView((v) => zoomPlanView(v, pct / 100, svgRef.current?.viewBox?.baseVal)),
      by: (factor) => setView((v) => zoomPlanView(v, v.zoom * factor, svgRef.current?.viewBox?.baseVal)),
    };
    return () => { apiRef.current = null; };
  }, [apiRef]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, zIndex: 20, background: "#ffffff", overflow: "hidden", touchAction: "none", cursor: "grab" }}
      role="img"
      aria-label="Building floor plan"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setView({ zoom: 1, tx: 0, ty: 0 })}
    >
      {/* Shared drawing (FloorPlanSvg) — zoom/pan rides along via
          innerTransform; the order form prints the same component. */}
      <FloorPlanSvg
        svgRef={svgRef}
        widthFt={grid.w / SCALE}
        lengthFt={grid.l / SCALE}
        walls={walls}
        openings={openings}
        leantos={leantos}
        drafting
        fit="xMidYMid meet"
        hideScaleKey
        watermarkUrl={watermark ? WATERMARK_LOGO_URL : null}
        innerTransform={`translate(${view.tx},${view.ty}) scale(${view.zoom})`}
      />
      {/* Symbol legend — bottom-left, same look as the printed floor plan,
          with the grid scale key as its last row. */}
      <div className="pof-legend" style={{ position: "absolute", left: 16, bottom: 72, width: 300, margin: 0, pointerEvents: "none" }}>
        <div className="pof-legend-title">SYMBOL LEGEND</div>
        {legendEntries.map((entry) => (
          <div className="pof-legend-row" key={entry.label}>
            <span className={`pof-legend-swatch pof-legend-swatch--${entry.symbol}`} />
            <span>{entry.label}</span>
          </div>
        ))}
        <div className="pof-legend-row">
          <span style={{ width: 12, height: 12, flex: "0 0 auto", border: "1px solid #8f8f8f", background: "#ffffff" }} />
          <span>{"= 1'-0\""}</span>
        </div>
      </div>
    </div>
  );
}




