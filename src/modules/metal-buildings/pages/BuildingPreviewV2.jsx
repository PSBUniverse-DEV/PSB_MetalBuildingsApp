"use client";
// ═══════════════════════════════════════════════════════════
// BuildingPreviewV2 — Version 2 of the 3D building preview
// Forked from BuildingPreview.jsx for independent iteration.
// ═══════════════════════════════════════════════════════════

import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { createRibPanelGeometry, createRidgeCapGeometry } from "../3d/roof/ribPanelGeometry";
import { WalkInDoor, RollupDoor, Window, Frameout, Vent } from "../3d";
import { getStyleProfile } from "../data/styleProfiles";
import AppIcon from "@/shared/components/ui/AppIcon";

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

// ─── THICKNESS HIERARCHY ──────────────────────────────────
// Main frame (posts, rafters) > secondary (eave struts, base rails) > braces
// At SCALE 0.5: a 4" real tube = 0.167 scene units
const MAIN_TUBE = 0.16;       // columns + rafters — bold, load-bearing
const SECONDARY_TUBE = 0.09;  // eave struts, base rails, ridge beam
const BRACE_TUBE = 0.06;      // knee braces, truss web members
const STEEL_COLOR = "#f5f5f5";
const TRIM_COLOR = "#C89B68";
const PANEL_WIDTH = 1.5 * SCALE; // one texture tile = ~3ft real panel width
// Enclosed-wall siding: fine uniform horizontal ridges. One texture tile
// holds 8 ridges; WALL_RIB_TILE is its world-space height so callers keep
// the ridge pitch at ~5 real inches on any wall.
const WALL_RIB_PITCH_IN = 5;                                        // real inches between ridges
const WALL_RIBS_PER_TILE = 8;                                       // ridges per 256px texture tile
const WALL_RIB_TILE = (WALL_RIBS_PER_TILE * WALL_RIB_PITCH_IN) / 24; // world units (1 unit = 24 in)
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
  return chordHalf + (strapsVisible ? STRAP_T : 0) + 0.005;
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

// ─── WALL RIB TEXTURE (horizontal corrugation) ────────────
// Enclosed-wall siding: fine uniform horizontal ridges (~5in pitch),
// each cell a soft shadow groove + bright crown - plain horizontal
// corrugation look. Ridges run horizontally across the wall; callers
// scale repeat.v with WALL_RIB_TILE to keep the pitch on any wall.

function createWallRibTexture(baseColor, lineSpacing = 32) {
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

// ─── GRID: THE BACKBONE ───────────────────────────────────
// Pure function. Single source of truth. Everything derives from this.

function computeGrid(width, length, height, pitch, overhangFt) {
  const w = width * SCALE;
  const l = length * SCALE;
  const h = height * SCALE;
  const halfW = w / 2;
  const roofPeak = halfW * pitch;
  const overhang = overhangFt * SCALE;

  // Bay grid — posts, rafters, wall panels all snap to this
  const baySpacing = BAY_SPACING_FT * SCALE;
  const bayCount = Math.max(1, Math.round(l / baySpacing));
  const bay = l / bayCount; // actual bay spacing (may differ slightly from target)

  // Bay Z positions (each bay line along the length)
  const bayPositions = [];
  for (let i = 0; i <= bayCount; i++) bayPositions.push(-l / 2 + bay * i);

  // Slope geometry
  const slopeLen = Math.sqrt(halfW * halfW + roofPeak * roofPeak);
  const slopeDirX = halfW / slopeLen;
  const slopeDirY = roofPeak / slopeLen;

  // Overhang extends along slope direction (eave sides only)
  const ovEX = overhang * slopeDirX;
  const ovEY = overhang * slopeDirY;

  // Camera / lights
  const maxDim = Math.max(w, l, h + roofPeak);

  return {
    w, l, h, halfW, roofPeak, overhang,
    ovEX, ovEY, slopeLen, slopeDirX, slopeDirY,
    bayCount, bay, bayPositions,
    maxDim,
  };
}

// ─── MAIN COMPONENT ───────────────────────────────────────

export default function BuildingPreview({
  width = 12, length = 20, height = 6,
  roofStyle = "regular", roofPitch = null, defaultRoofPitch = 0.25,
  roofOverhang = 0, walls = {}, highlightedWall = null,
  sidingDirection = "vertical",
  roofColor = "#cc0000", wallColor = "#e0e0e0", twoToneColor = null,
  leantos = [], openings = {},
  onCaptureReady = null,
}) {
  const pitch = roofPitch != null ? roofPitch : defaultRoofPitch;
  const grid = useMemo(
    () => computeGrid(width, length, height, pitch, roofOverhang),
    [width, length, height, pitch, roofOverhang]
  );

  const { w, l, h } = grid;

  // ─── STEP DOWN BARN — left/right sections are real lean-tos ──
  // They arrive through the regular `leantos` pipeline (the configurator
  // auto-adds them from the style profile's defaultLeantos hints) and render
  // through LeanToSystem like any other lean-to. The stepDown spec is only
  // consulted here for the center-wall siding look.
  const isStepDown = !!getPreset(roofStyle).stepDown;
  const allLeantos = leantos;
  // Total footprint: center width + side lean-tos (camera framing / floor)
  const leantoTotalW = allLeantos
    .filter((lt) => lt.side_key === "left" || lt.side_key === "right")
    .reduce((sum, lt) => sum + (lt.width_ft || 0) * SCALE, 0);
  const maxDim = Math.max(grid.maxDim, w + leantoTotalW);
  const camDist = maxDim * 1.3;
  const shadowSize = maxDim * 1.5;

  // ─── VIEWER TOOLBAR plumbing ──────────────────────────────
  // apiRef: camera operations exposed by ViewerControlBridge (inside Canvas).
  // hist: recorded camera snapshots (after each user navigation) so the
  // toolbar's undo/redo flyout can walk back and forth through views.
  const apiRef = useRef(null);
  const histRef = useRef({ stack: [], index: -1 });
  const [hist, setHist] = useState({ stack: [], index: -1 });
  // Display toggles consumed by the scene (shadows / labels / watermark) and
  // OrbitControls (auto-rotate).
  const [display, setDisplay] = useState({
    shadows: false,
    labels: true,
    watermark: true,
    autoRotate: false,
    autoRotateSpeed: 1.5,
  });

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

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 400, background: "var(--psb-bg)", position: "relative" }}>
      <Canvas camera={{ position: [camDist * 0.9, camDist * 0.7, camDist * 0.8], fov: 50, near: 0.1, far: 2000 }} shadows gl={{ preserveDrawingBuffer: true }}>
        <ambientLight intensity={0.85} />
        <directionalLight
          position={[maxDim * 0.8, maxDim * 1.2, maxDim * 0.6]}
          intensity={1.4} castShadow={display.shadows}
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-left={-shadowSize} shadow-camera-right={shadowSize}
          shadow-camera-top={shadowSize} shadow-camera-bottom={-shadowSize}
          shadow-camera-near={0.1} shadow-camera-far={maxDim * 4}
        />
        <directionalLight position={[-maxDim * 0.5, maxDim * 0.6, -maxDim * 0.4]} intensity={0.6} />
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={Math.max(1, maxDim * 0.15)}
          maxDistance={maxDim * 6}
          zoomToCursor
          zoomSpeed={1.2}
          maxPolarAngle={Math.PI * 0.85} minPolarAngle={0.1}
          target={[0, h / 2, 0]}
          autoRotate={display.autoRotate}
          autoRotateSpeed={display.autoRotateSpeed}
        />
        <CameraController highlightedWall={highlightedWall} grid={grid} maxDim={maxDim} />
        <ViewerControlBridge apiRef={apiRef} onNavSnapshot={handleNavSnapshot} maxDim={maxDim} grid={grid} />

        <FrameSystem grid={grid} roofStyle={roofStyle} walls={walls} />
        <RoofSystem grid={grid} roofColor={roofColor} roofStyle={roofStyle} walls={walls} />
        <WallPanels grid={grid} walls={walls} wallColor={wallColor} twoToneColor={twoToneColor} sidingDirection={sidingDirection} verticalSiding={isStepDown} />
        <TrimSystem grid={grid} roofStyle={roofStyle} />
        <WallOpenings grid={grid} openings={openings} />
        {allLeantos.map((lt, i) => (
          <LeanToSystem key={`lt-${i}`} grid={grid} leanto={lt} roofColor={roofColor} wallColor={wallColor} siblingLeantos={allLeantos} roofOverhang={roofOverhang} />
        ))}
        {display.labels && <WallLabels grid={grid} />}
        {display.watermark && <FloorWatermark grid={grid} expandW={leantoTotalW} />}
        <ViewCaptureBridge onCaptureReady={onCaptureReady} grid={grid} maxDim={maxDim} />
      </Canvas>

      {/* Floating viewer toolbar with flowing flyout panels */}
      <ViewerToolbar
        apiRef={apiRef}
        hist={hist}
        onUndo={undoView}
        onRedo={redoView}
        onJump={jumpToView}
        display={display}
        setDisplay={setDisplay}
      />
    </div>
  );
}

// ─── VIEW CAPTURE — Order Form building images ──────────────
// Registers captureViews() (via onCaptureReady) that snapshots the 3D model
// from fixed angles for the printed Order Form's Building Images page.
// Wall orientation: front = -z, back = +z, left = -x, right = +x.

function ViewCaptureBridge({ onCaptureReady, grid, maxDim }) {
  const { camera, gl, scene } = useThree();

  useEffect(() => {
    if (!onCaptureReady) return;

    const captureViews = () => {
      const { h } = grid;
      const dist = maxDim * 1.3;
      const elev = dist * 0.5;
      const lookTarget = new THREE.Vector3(0, h * 0.35, 0);
      const views = [
        { caption: "Perspective View", position: [dist * 0.9, dist * 0.7, dist * 0.8] },
        { caption: "Front", position: [0, elev, -dist] },
        { caption: "Left Side", position: [-dist, elev, 0] },
        { caption: "Right Side", position: [dist, elev, 0] },
        { caption: "Back", position: [0, elev, dist] },
      ];

      const originalPosition = camera.position.clone();
      const originalQuaternion = camera.quaternion.clone();
      const captured = [];
      try {
        for (const view of views) {
          camera.position.set(view.position[0], view.position[1], view.position[2]);
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
  }, [onCaptureReady, camera, gl, scene, grid, maxDim]);

  return null;
}

// ─── WALL LABELS (Front / Back / Left / Right indicators) ──

function WallLabels({ grid }) {
  const { l, h, halfW } = grid;
  const labelStyle = {
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: "nowrap",
    userSelect: "none",
    pointerEvents: "none",
  };
  return (
    <group>
      <Html position={[0, 0.05, -l / 2 - 0.3]} center style={labelStyle} distanceFactor={8}>Front</Html>
      <Html position={[0, 0.05, l / 2 + 0.3]} center style={labelStyle} distanceFactor={8}>Back</Html>
      <Html position={[-halfW - 0.3, 0.05, 0]} center style={labelStyle} distanceFactor={8}>Left</Html>
      <Html position={[halfW + 0.3, 0.05, 0]} center style={labelStyle} distanceFactor={8}>Right</Html>
    </group>
  );
}

// ─── FLOOR WATERMARK (PSBUniverse branding on ground) ──────

function FloorWatermark({ grid, expandW = 0 }) {
  const { w, l, maxDim } = grid;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 1024, 128);
    ctx.font = "bold 80px sans-serif";
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PSBUNIVERSE", 512, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const planeW = maxDim * 1.2;
  const planeH = maxDim * 0.15;
  const offset = maxDim * 0.18;
  const y = 0.005;

  return (
    <group>
      {/* Front — readable from front (looking at building from -Z) */}
      <mesh position={[0, y, -l / 2 - offset]} rotation={[-Math.PI / 2, 0, Math.PI]}>
        <planeGeometry args={[planeW, planeH]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} />
      </mesh>
      {/* Back — readable from back (looking at building from +Z) */}
      <mesh position={[0, y, l / 2 + offset]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[planeW, planeH]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} />
      </mesh>
      {/* Left — readable from left (looking at building from -X) */}
      <mesh position={[-w / 2 - expandW - offset, y, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
        <planeGeometry args={[planeW, planeH]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} />
      </mesh>
      {/* Right — readable from right (looking at building from +X) */}
      <mesh position={[w / 2 + expandW + offset, y, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[planeW, planeH]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// ─── FOUNDATION ────────────────────────────────────────────

function ConcreteSlab({ grid }) {
  const { w, l } = grid;
  return (
    <mesh position={[0, -0.04, 0]} receiveShadow>
      <boxGeometry args={[w + 0.3, 0.08, l + 0.3]} />
      <meshStandardMaterial color="#b0b0a8" roughness={0.9} />
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

// ─── COLUMN BASE PLATE (visual anchor at ground level) ──────

function BasePlate({ x, z }) {
  const plateSize = MAIN_TUBE * 2.5;
  return (
    <mesh position={[x, 0.01, z]} castShadow receiveShadow>
      <boxGeometry args={[plateSize, 0.02, plateSize]} />
      <meshStandardMaterial color={STEEL_COLOR} roughness={0.5} metalness={0.5} />
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
//   │   ├── Base Rails      (SECONDARY_TUBE)
//   │   └── Ridge Beam      (SECONDARY_TUBE, peaked styles only)
//   │
//   └── No girts/purlins visible — they live behind panels
// ═══════════════════════════════════════════════════════════

function FrameSystem({ grid, roofStyle, walls = {} }) {
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
          // Truss depth — vertical distance between the parallel chords
          const trussDepth = Math.max(0.5, Math.min(1.8, roofPeak * 0.5));
          const DIVS = 8;

          for (const side of [-1, 1]) {
            const tStart = side === -1 ? leftOuter : rightOuter;
            // Top chord: eave → ridge (continuous with the column outer rail)
            m.push({ s: [tStart, h, z], e: [0, ridgeY, z], t: SECONDARY_TUBE });
            // Bottom chord: parallel to the top chord, trussDepth below it
            m.push({ s: [tStart, h - trussDepth, z], e: [0, ridgeY - trussDepth, z], t: SECONDARY_TUBE });

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

          // King post at the ridge — bottom-chord junction up to the apex
          m.push({ s: [0, ridgeY - trussDepth, z], e: [0, ridgeY, z], t: BRACE_TUBE });
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
          m.push({ s: [-halfW, h, z], e: [0, h + roofPeak, z], t: MAIN_TUBE });
          m.push({ s: [halfW, h, z], e: [0, h + roofPeak, z], t: MAIN_TUBE });
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

    // Base rails — hidden only when that specific side wall covers them
    if (!hasLeft)  m.push({ s: [-halfW, 0, zF], e: [-halfW, 0, zB], t: SECONDARY_TUBE });
    if (!hasRight) m.push({ s: [halfW, 0, zF], e: [halfW, 0, zB], t: SECONDARY_TUBE });

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

    return m;
  }, [l, h, halfW, roofPeak, slopeDirX, slopeDirY, preset, bayPositions, hasLeft, hasRight, hasAnyWall, isFullyEnclosed]);

  // ─── Base plates at ALL column positions (columns never hidden) ──
  const basePlates = useMemo(() => {
    const plates = [];
    for (const z of bayPositions) {
      plates.push({ x: -halfW, z });
      plates.push({ x: halfW, z });
    }
    return plates;
  }, [bayPositions, halfW]);

  return (
    <group>
      {members.map((mem, i) =>
        mem.f ? (
          <SteelFlatBar key={`f${i}`} start={mem.s} end={mem.e} width={mem.f.w} thickness={mem.f.t} normal={mem.f.n} />
        ) : (
          <SteelTube key={`f${i}`} start={mem.s} end={mem.e} size={mem.t} />
        )
      )}
      {basePlates.map((bp, i) => (
        <BasePlate key={`bp${i}`} x={bp.x} z={bp.z} />
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// ROOF SYSTEM — Solid surface following rafter profile
//
// Two ribbed slope planes meeting at the ridge, slight overhang
// past posts, strong surface presence
// ═══════════════════════════════════════════════════════════

function RoofSystem({ grid, roofColor, roofStyle, walls = {} }) {
  const { w, l, h, halfW, roofPeak, ovEX, ovEY, slopeLen, slopeDirX } = grid;
  const preset = getPreset(roofStyle);
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
  const HEM_LIFT = 0.002;

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
    });
  }, [halfW, eaveExt, eaveY, ridgeY, zF, zB]);

  const rightSlopeGeo = useMemo(() => {
    return createRibPanelGeometry({
      zF,
      zB,
      eave: [halfW + eaveExt, eaveY],
      ridge: [0, ridgeY],
    });
  }, [halfW, eaveExt, eaveY, ridgeY, zF, zB]);

  const leftCapGeo = useMemo(() => {
    if (!preset.ridgeCap) return null;
    return createRidgeCapGeometry({
      zF,
      zB,
      eave: [-capOut, ridgeY - capDrop],
      ridge: [capTuck, ridgeY],
      baseLift: CAP_LIFT,
      hemLift: HEM_LIFT,
    });
  }, [preset.ridgeCap, capOut, capDrop, capTuck, CAP_LIFT, HEM_LIFT, ridgeY, zF, zB]);

  const rightCapGeo = useMemo(() => {
    if (!preset.ridgeCap) return null;
    return createRidgeCapGeometry({
      zF,
      zB,
      eave: [capOut, ridgeY - capDrop],
      ridge: [-capTuck, ridgeY],
      baseLift: CAP_LIFT,
      hemLift: HEM_LIFT,
    });
  }, [preset.ridgeCap, capOut, capDrop, capTuck, CAP_LIFT, HEM_LIFT, ridgeY, zF, zB]);

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
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} />
      </mesh>
      {/* Right roof slope */}
      <mesh geometry={rightSlopeGeo} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} />
      </mesh>
      {/* Ridge cap - conforming legs, flush on the ribs */}
      {preset.ridgeCap && leftCapGeo && rightCapGeo && (
        <group>
          <mesh geometry={leftCapGeo} castShadow receiveShadow>
            <meshStandardMaterial color={color} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={rightCapGeo} castShadow receiveShadow>
            <meshStandardMaterial color={color} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} />
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

function TrimSystem({ grid, roofStyle }) {
  const { l, h, halfW, roofPeak, ovEX, ovEY } = grid;
  const preset = getPreset(roofStyle);

  // Roof endpoints
  const leftEaveF = [-halfW - ovEX, h - ovEY, -l / 2];
  const leftEaveB = [-halfW - ovEX, h - ovEY, l / 2];
  const rightEaveF = [halfW + ovEX, h - ovEY, -l / 2];
  const rightEaveB = [halfW + ovEX, h - ovEY, l / 2];
  const ridgeF = [0, h + roofPeak, -l / 2];
  const ridgeB = [0, h + roofPeak, l / 2];

  return (
    <group>
      {/* Gable rake trim */}
      <SteelTube start={leftEaveF} end={ridgeF} size={MAIN_TUBE} color={TRIM_COLOR} />
      <SteelTube start={ridgeF} end={rightEaveF} size={MAIN_TUBE} color={TRIM_COLOR} />
      <SteelTube start={leftEaveB} end={ridgeB} size={MAIN_TUBE} color={TRIM_COLOR} />
      <SteelTube start={ridgeB} end={rightEaveB} size={MAIN_TUBE} color={TRIM_COLOR} />
      {/* Eave edge tubes */}
      <SteelTube start={leftEaveF} end={leftEaveB} size={MAIN_TUBE} color={TRIM_COLOR} />
      <SteelTube start={rightEaveF} end={rightEaveB} size={MAIN_TUBE} color={TRIM_COLOR} />
      {/* Ridge line - hidden when a ridge cap covers it */}
      {!preset.ridgeCap && <SteelTube start={ridgeF} end={ridgeB} size={MAIN_TUBE} color={TRIM_COLOR} />}
    </group>
  );
}

// ─── WALL PANELS ───────────────────────────────────────────

function WallPanels({ grid, walls, wallColor, twoToneColor, sidingDirection = "vertical", verticalSiding = false }) {
  const { w, l, h, halfW, roofPeak, bayCount, bay } = grid;
  const panelColor = wallColor || "#e0e0e0";
  const splitY = h / 2;

  const getColor = (wall) => panelColor;
  const getOpacity = (wall) => 1.0;
  const wallType = (wall) => {
    const v = walls[wall];
    if (!v) return null;
    if (v === true) return "enclosed";
    return v;
  };

  // Parse partial panel height from render_type (e.g. "top_1.5" → 1.5ft, "top_3" → 3ft)
  const parseTopPanel = (wt) => {
    if (typeof wt === "string" && wt.startsWith("top_")) {
      const ft = parseFloat(wt.replace("top_", ""));
      return isNaN(ft) ? null : ft;
    }
    return null;
  };

  // Side wall: single panel with texture-based seams (direction from siding selection)
  const renderSideWall = (x, wall) => {
    const wt = wallType(wall);
    if (!wt) return null;
    const color = getColor(wall);
    const op = getOpacity(wall);
    const ribSiding = wt === "enclosed" && !verticalSiding;

    // Partial top panel (e.g. "top_1.5", "top_3")
    const topFt = parseTopPanel(wt);
    if (topFt) {
      const panelH = topFt * SCALE;
      const panelY = h - panelH / 2;
      return (
        <SideWallPanel x={x} y={panelY} h={panelH} l={l} color={color} opacity={op} sidingDirection={sidingDirection} ribSiding={ribSiding} />
      );
    }

    if (!twoToneColor) {
      return (
        <SideWallPanel x={x} h={h} l={l} color={color} opacity={op} sidingDirection={sidingDirection} ribSiding={ribSiding} />
      );
    }
    return (
      <group>
        <SideWallPanel x={x} y={splitY + (h - splitY) / 2} h={h - splitY} l={l} color={panelColor} opacity={op} sidingDirection={sidingDirection} ribSiding={ribSiding} />
        <SideWallPanel x={x} y={splitY / 2} h={splitY} l={l} color={twoToneColor} opacity={op} sidingDirection={sidingDirection} ribSiding={ribSiding} />
      </group>
    );
  };

  return (
    <group>
      {wallType("front") && (
        <EndWallMesh w={w} h={h} roofPeak={roofPeak} z={-l / 2} type={wallType("front")} color={getColor("front")} opacity={getOpacity("front")} twoToneColor={twoToneColor} splitY={splitY} sidingDirection={sidingDirection} ribSiding={wallType("front") === "enclosed" && !verticalSiding} />
      )}
      {wallType("back") && (
        <EndWallMesh w={w} h={h} roofPeak={roofPeak} z={l / 2} type={wallType("back")} color={getColor("back")} opacity={getOpacity("back")} twoToneColor={twoToneColor} splitY={splitY} sidingDirection={sidingDirection} ribSiding={wallType("back") === "enclosed" && !verticalSiding} />
      )}
      {renderSideWall(-halfW, "left")}
      {renderSideWall(halfW, "right")}
    </group>
  );
}

// ─── SIDE WALL PANEL (textured) ────────────────────────────

function SideWallPanel({ x, y, h, l, color, opacity, sidingDirection = "vertical", ribSiding = false }) {
  const posY = y != null ? y : h / 2;
  // Offset wall slightly outward from column line so it covers the structure
  const sign = x > 0 ? 1 : -1;
  const wallX = x + sign * (MAIN_TUBE * 0.6);
  const tex = useMemo(() => {
    if (ribSiding) {
      // Enclosed walls: fine uniform horizontal ridges (~5in pitch)
      const t = createWallRibTexture(color);
      t.repeat.set(1, h / WALL_RIB_TILE);
      return t;
    }
    const t = createPanelTexture(color, sidingDirection, 28);
    if (sidingDirection === "vertical") {
      // Vertical panels: repeat across wall length, tile height to wall height
      t.repeat.set(l / PANEL_WIDTH, h / PANEL_WIDTH);
    } else {
      // Horizontal panels: repeat along height (ribs), tile across length
      t.repeat.set(l / PANEL_WIDTH, h / PANEL_WIDTH);
    }
    return t;
  }, [color, sidingDirection, ribSiding, l, h]);

  return (
    <mesh position={[wallX, posY, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
      <boxGeometry args={[l, h, 0.02]} />
      <meshStandardMaterial map={tex} transparent={opacity < 1} opacity={opacity} roughness={0.6} metalness={0.2} side={2} />
    </mesh>
  );
}

// ─── END WALL MESH (pentagon / gable / two-tone) ───────────

function EndWallMesh({ w, h, roofPeak, z, type, color, opacity, twoToneColor = null, splitY = 0, sidingDirection = "vertical", ribSiding = false }) {
  // Offset end wall slightly outward so it covers the frame tubes
  const sign = z > 0 ? 1 : -1;
  const wallZ = z + sign * (MAIN_TUBE * 0.6);

  // Partial top panel for end walls (e.g. "top_1.5", "top_3")
  const topFt = (typeof type === "string" && type.startsWith("top_")) ? parseFloat(type.replace("top_", "")) : null;
  const isTopPanel = topFt != null && !isNaN(topFt);

  // Extended gable: gable triangle + panel strip below eave (e.g. "ext_gable_3")
  const extGableFt = (typeof type === "string" && type.startsWith("ext_gable_")) ? parseFloat(type.replace("ext_gable_", "")) : null;
  const isExtGable = extGableFt != null && !isNaN(extGableFt);

  // Textures for end walls (panel lines follow siding direction)
  const upperTex = useMemo(() => {
    const spanH = isTopPanel ? topFt * SCALE : isExtGable ? roofPeak + extGableFt * SCALE : h + roofPeak;
    if (ribSiding) {
      // Enclosed walls: fine uniform horizontal ridges (~5in pitch)
      const t = createWallRibTexture(color);
      t.repeat.set(1, spanH / WALL_RIB_TILE);
      return t;
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
  }, [color, sidingDirection, ribSiding, w, h, roofPeak, isTopPanel, topFt, isExtGable, extGableFt]);

  const lowerTex = useMemo(() => {
    if (isTopPanel || isExtGable) return null;
    if (!twoToneColor || type === "gable") return null;
    if (ribSiding) {
      // Enclosed walls: fine uniform horizontal ridges (~5in pitch)
      const t = createWallRibTexture(twoToneColor);
      t.repeat.set(1, splitY / WALL_RIB_TILE);
      return t;
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
      const verts = new Float32Array([
        -w / 2, splitY, wallZ, w / 2, splitY, wallZ, w / 2, h, wallZ, 0, h + roofPeak, wallZ, -w / 2, h, wallZ,
      ]);
      const uvs = new Float32Array([0, 0, 1, 0, 1, 0.6, 0.5, 1, 0, 0.6]);
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4]);
    } else {
      const verts = new Float32Array([
        -w / 2, 0, wallZ, w / 2, 0, wallZ, w / 2, h, wallZ, 0, h + roofPeak, wallZ, -w / 2, h, wallZ,
      ]);
      const uvs = new Float32Array([0, 0, 1, 0, 1, 0.7, 0.5, 1, 0, 0.7]);
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4]);
    }
    g.computeVertexNormals();
    return g;
  }, [w, h, roofPeak, wallZ, type, twoToneColor, splitY, isTopPanel, topFt, isExtGable, extGableFt]);

  const lowerGeo = useMemo(() => {
    if (!twoToneColor || type === "gable") return null;
    const g = new THREE.BufferGeometry();
    const verts = new Float32Array([-w / 2, 0, wallZ, w / 2, 0, wallZ, w / 2, splitY, wallZ, -w / 2, splitY, wallZ]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [w, wallZ, twoToneColor, type, splitY]);

  return (
    <group>
      <mesh geometry={upperGeo} castShadow>
        <meshStandardMaterial map={upperTex} transparent={opacity < 1} opacity={opacity} roughness={0.6} metalness={0.2} side={2} />
      </mesh>
      {lowerGeo && lowerTex && (
        <mesh geometry={lowerGeo} castShadow>
          <meshStandardMaterial map={lowerTex} transparent={opacity < 1} opacity={opacity} roughness={0.6} metalness={0.2} side={2} />
        </mesh>
      )}
    </group>
  );
}

// ─── WALL OPENINGS (doors, windows, rollup doors) ─────────

// Opening dimension parser
const MAIN_TUBE_SKIN = MAIN_TUBE * 0.6 + 0.005;

const DIM_RE = /(\d+)\s*[×xX]\s*(\d+)/;

function parseOpening(item) {
  const m = DIM_RE.exec(item.name);
  if (!m) return null;
  const wIn = Number(m[1]), hIn = Number(m[2]);
  const wFt = wIn / 12, hFt = hIn / 12;
  const type = item.name.toLowerCase().includes("window") ? "window"
    : item.name.toLowerCase().includes("rollup") ? "rollup_door"
    : item.name.toLowerCase().includes("frameout") ? "frameout"
    : item.name.toLowerCase().includes("vent") ? "vent" : "door";
  return { wFt, hFt, type };
}

// ─── 3D OPENING ROUTER (uses modular /3d/ components) ────
function Opening3D({ ow, oh, type }) {
  switch (type) {
    case "window":       return <Window ow={ow} oh={oh} />;
    case "rollup_door":  return <RollupDoor ow={ow} oh={oh} />;
    case "frameout":     return <Frameout ow={ow} oh={oh} />;
    case "vent":         return <Vent ow={ow} oh={oh} />;
    default:             return <WalkInDoor ow={ow} oh={oh} />;
  }
}

function WallOpenings({ grid, openings }) {
  const { w, l, h, halfW } = grid;
  const allItems = useMemo(() => {
    const result = [];
    for (const [wall, items] of Object.entries(openings)) {
      if (!items || items.length === 0) continue;
      const isEnd = wall === "front" || wall === "back";
      const wallLen = isEnd ? w : l;
      const parsed = items.map((it) => parseOpening(it)).filter(Boolean);
      const count = parsed.length;
      if (count === 0) continue;
      const spacing = wallLen / (count + 1);
      parsed.forEach((p, idx) => {
        const offset = spacing * (idx + 1) - wallLen / 2;
        result.push({ ...p, wall, offset, wallLen });
      });
    }
    return result;
  }, [openings, w, l]);

  return (
    <group>
      {allItems.map((item, i) => {
        const ow = Math.min(item.wFt * SCALE, item.wallLen - 0.05);
        const oh = Math.min(item.hFt * SCALE, h - 0.02);
        const Z_OFFSET = MAIN_TUBE_SKIN;

        let pos, rot;
        if (item.wall === "left") {
          pos = [-halfW - Z_OFFSET, oh / 2, item.offset];
          rot = [0, -Math.PI / 2, 0];
        } else if (item.wall === "right") {
          pos = [halfW + Z_OFFSET, oh / 2, item.offset];
          rot = [0, Math.PI / 2, 0];
        } else if (item.wall === "front") {
          pos = [item.offset, oh / 2, -l / 2 - Z_OFFSET];
          rot = [0, Math.PI, 0];
        } else {
          pos = [item.offset, oh / 2, l / 2 + Z_OFFSET];
          rot = [0, 0, 0];
        }

        return (
          <group key={`opening-${i}`} position={pos} rotation={rot}>
            <Opening3D ow={ow} oh={oh} type={item.type} />
          </group>
        );
      })}
    </group>
  );
}

// ─── LEAN-TO SYSTEM ────────────────────────────────────────
// Renders a single lean-to attached to one side of the main building.
// leanto: { side_key, width_ft, height_ft, render_key }

function LeanToSystem({ grid, leanto, roofColor, wallColor, siblingLeantos, roofOverhang = 0 }) {
  const { l, h, halfW, w, bayPositions } = grid;
  const side = leanto.side_key;
  const ltWidthFt = leanto.width_ft || 10;
  const ltOpenings = leanto.openings || { outer: [], left_end: [], right_end: [] };
  const ltHeightFt = leanto.height_ft || (leanto.drop_ft ? ((h / SCALE) - leanto.drop_ft) : 6);

  // Per-wall rendering state (outer, left_end, right_end)
  const ltWalls = leanto.walls || {};
  const hasOuter = ltWalls.outer === "enclosed" || ltWalls.outer === "gable";
  const hasLeftEnd = ltWalls.left_end === "enclosed" || ltWalls.left_end === "gable";
  const hasRightEnd = ltWalls.right_end === "enclosed" || ltWalls.right_end === "gable";
  const hasAnyWall = hasOuter || hasLeftEnd || hasRightEnd;

  const ltW = ltWidthFt * SCALE;       // lean-to projection (scene units)
  const ltH = ltHeightFt * SCALE;      // lean-to outer leg height (scene units)
  const isSide = side === "left" || side === "right";

  // Lean-to length along the building wall (may be shorter than full wall)
  const maxLen = isSide ? l : w;       // full wall length in scene units
  const ltLenFt = leanto.length_ft;
  const ltLen = ltLenFt ? Math.min(ltLenFt * SCALE, maxLen) : maxLen;

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

  // Posts along outer edge at bay spacing
  const postPositions = useMemo(() => {
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
  }, [isSide, bayPositions, ltLen, halfLtLen, l]);

  // Wall texture for enclosed lean-to
  const wallTex = useMemo(() => {
    if (!hasOuter) return null;
    const tex = createPanelTexture(wallColor, "vertical", 28);
    const along = Math.max(1, Math.round(attachLen / 1.5));
    const up = Math.max(1, Math.round(ltH / 1.5));
    tex.repeat.set(along, up);
    return tex;
  }, [hasOuter, wallColor, attachLen, ltH]);

  // End wall texture
  const endWallTex = useMemo(() => {
    if (!hasLeftEnd && !hasRightEnd) return null;
    const tex = createPanelTexture(wallColor, "vertical", 28);
    const across = Math.max(1, Math.round(ltW / 1.5));
    const up = Math.max(1, Math.round(((attachH + ltH) / 2) / 1.5));
    tex.repeat.set(across, up);
    return tex;
  }, [hasLeftEnd, hasRightEnd, wallColor, ltW, attachH, ltH]);

  // Gable fascia (party wall) texture — uses wall color since it's the main building's wall
  const fasciaH = h - attachH;
  const fasciaTex = useMemo(() => {
    if (fasciaH <= 0) return null;
    const tex = createPanelTexture(wallColor, "vertical", 28);
    const along = Math.max(1, Math.round(attachLen / 1.5));
    const up = Math.max(1, Math.round((fasciaH / SCALE) / 1.5));
    tex.repeat.set(along, up);
    return tex;
  }, [wallColor, attachLen, fasciaH]);

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
    });
    g.rotateY(-Math.PI / 2);
    g.translate(eMax, outerY, outerZ);
    return g;
  }, [isSide, sign, halfW, ltW, ltH, attachH, l, halfLtLen, ltLen, ovH, ovDrop, sideOv]);

  // Dispose rebuilt/unmounted roof geometry
  useEffect(() => () => { roofGeo?.dispose(); }, [roofGeo]);

  return (
    <group>
      {/* Lean-to roof — same rib-panel skin as the main roof */}
      <mesh geometry={roofGeo} castShadow receiveShadow>
        <meshStandardMaterial color={roofColor} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} />
      </mesh>

      {/* Gable fascia — party wall uses main building's wall color */}
      {isSide ? (
        <mesh position={[sign * (halfW + 0.015), (h + attachH) / 2, 0]} rotation={[0, sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0]} castShadow>
          <planeGeometry args={[ltLen, h - attachH]} />
          {fasciaTex ? <meshStandardMaterial map={fasciaTex} roughness={0.6} metalness={0.2} side={2} /> : <meshStandardMaterial color={wallColor} roughness={0.6} metalness={0.2} side={2} />}
        </mesh>
      ) : (
        <mesh position={[0, (h + attachH) / 2, sign * (l / 2 + 0.015)]} rotation={[0, sign > 0 ? 0 : Math.PI, 0]} castShadow>
          <planeGeometry args={[ltLen, h - attachH]} />
          {fasciaTex ? <meshStandardMaterial map={fasciaTex} roughness={0.6} metalness={0.2} side={2} /> : <meshStandardMaterial color={wallColor} roughness={0.6} metalness={0.2} side={2} />}
        </mesh>
      )}

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

      {/* Outer eave beam (along top of outer posts) */}
      {isSide ? (
        <SteelTube
          start={[sign * (halfW + ltW), ltH, -halfLtLen]}
          end={[sign * (halfW + ltW), ltH, halfLtLen]}
          size={LEANTO_TUBE}
        />
      ) : (
        <SteelTube
          start={[adjXCenter - adjW / 2, ltH, sign * (l / 2 + ltW)]}
          end={[adjXCenter + adjW / 2, ltH, sign * (l / 2 + ltW)]}
          size={LEANTO_TUBE}
        />
      )}

      {/* Outer wall panel (if enclosed) */}
      {hasOuter && wallTex && (
        isSide ? (
          <mesh position={[sign * (halfW + ltW), ltH / 2, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <planeGeometry args={[ltLen, ltH]} />
            <meshStandardMaterial map={wallTex} roughness={0.6} metalness={0.2} side={2} />
          </mesh>
        ) : (
          <mesh position={[adjXCenter, ltH / 2, sign * (l / 2 + ltW)]} castShadow>
            <planeGeometry args={[adjW, ltH]} />
            <meshStandardMaterial map={wallTex} roughness={0.6} metalness={0.2} side={2} />
          </mesh>
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
                tex={endWallTex} flip={false}
              />
            )}
            {hasRightEnd && (
              <LeanToEndWall
                innerX={sign * halfW} outerX={sign * (halfW + ltW)}
                innerH={attachH} outerH={ltH} z={halfLtLen}
                tex={endWallTex} flip={true}
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
                isEndType tex={endWallTex} flip={false}
              />
            )}
            {hasRightEnd && (
              <LeanToEndWall
                innerX={adjXCenter + adjW / 2} outerX={adjXCenter + adjW / 2}
                innerH={attachH} outerH={ltH}
                z={sign * (l / 2)} zOuter={sign * (l / 2 + ltW)}
                isEndType tex={endWallTex} flip={true}
              />
            )}
          </>
        )
      )}

      {/* Roof edge trims — dark strips along all 4 edges of the lean-to roof */}
      {isSide ? (<>
        {/* Outer eave trim (along outer edge) */}
        <Line points={[[sign * (halfW + ltW + ovH), ltH - ovDrop + 0.01, -halfLtLen - sideOv], [sign * (halfW + ltW + ovH), ltH - ovDrop + 0.01, halfLtLen + sideOv]]}
          color={TRIM_COLOR} lineWidth={3} />
        {/* Inner eave trim (along building wall) */}
        <Line points={[[sign * halfW + sign * SEAM_OFFSET, attachH + 0.01, -halfLtLen - sideOv], [sign * halfW + sign * SEAM_OFFSET, attachH + 0.01, halfLtLen + sideOv]]}
          color={TRIM_COLOR} lineWidth={3} />
        {/* Left side edge trim */}
        <Line points={[[sign * halfW + sign * SEAM_OFFSET, attachH + 0.01, -halfLtLen - sideOv], [sign * (halfW + ltW + ovH), ltH - ovDrop + 0.01, -halfLtLen - sideOv]]}
          color={TRIM_COLOR} lineWidth={3} />
        {/* Right side edge trim */}
        <Line points={[[sign * halfW + sign * SEAM_OFFSET, attachH + 0.01, halfLtLen + sideOv], [sign * (halfW + ltW + ovH), ltH - ovDrop + 0.01, halfLtLen + sideOv]]}
          color={TRIM_COLOR} lineWidth={3} />
      </>) : (<>
        {/* Outer eave trim */}
        <Line points={[[adjXCenter - adjW / 2 - sideOv, ltH - ovDrop + 0.01, sign * (l / 2 + ltW + ovH)], [adjXCenter + adjW / 2 + sideOv, ltH - ovDrop + 0.01, sign * (l / 2 + ltW + ovH)]]}
          color={TRIM_COLOR} lineWidth={3} />
        {/* Inner eave trim */}
        <Line points={[[adjXCenter - adjW / 2 - sideOv, attachH + 0.01, sign * (l / 2) + sign * SEAM_OFFSET], [adjXCenter + adjW / 2 + sideOv, attachH + 0.01, sign * (l / 2) + sign * SEAM_OFFSET]]}
          color={TRIM_COLOR} lineWidth={3} />
        {/* Left side edge trim */}
        <Line points={[[adjXCenter - adjW / 2 - sideOv, attachH + 0.01, sign * (l / 2) + sign * SEAM_OFFSET], [adjXCenter - adjW / 2 - sideOv, ltH - ovDrop + 0.01, sign * (l / 2 + ltW + ovH)]]}
          color={TRIM_COLOR} lineWidth={3} />
        {/* Right side edge trim */}
        <Line points={[[adjXCenter + adjW / 2 + sideOv, attachH + 0.01, sign * (l / 2) + sign * SEAM_OFFSET], [adjXCenter + adjW / 2 + sideOv, ltH - ovDrop + 0.01, sign * (l / 2 + ltW + ovH)]]}
          color={TRIM_COLOR} lineWidth={3} />
      </>)}

      {/* Base trim along outer edge */}
      {isSide ? (
        <mesh position={[sign * (halfW + ltW), 0.02, 0]} castShadow>
          <boxGeometry args={[0.03, 0.03, ltLen]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.4} metalness={0.3} />
        </mesh>
      ) : (
        <mesh position={[adjXCenter, 0.02, sign * (l / 2 + ltW)]} castShadow>
          <boxGeometry args={[adjW, 0.03, 0.03]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.4} metalness={0.3} />
        </mesh>
      )}

      {/* Lean-to wall openings (doors, windows, vents, frameouts, rollup doors) */}
      {hasAnyWall && <LeanToOpenings
        isSide={isSide} sign={sign} halfW={halfW} ltW={ltW} ltH={ltH}
        attachH={attachH} l={l} adjXCenter={adjXCenter} adjW={adjW}
        halfLtLen={halfLtLen} ltLen={ltLen} openings={ltOpenings}
      />}


    </group>
  );
}

// ─── LEAN-TO WALL OPENINGS ─────────────────────────────────
// Renders doors, windows, vents, frameouts, rollup doors on lean-to walls.

function LeanToOpenings({ isSide, sign, halfW, ltW, ltH, attachH, l, adjXCenter, adjW, halfLtLen, ltLen, openings }) {
  const allItems = useMemo(() => {
    const result = [];
    for (const [wallKey, items] of Object.entries(openings)) {
      if (!items || items.length === 0) continue;
      const parsed = items.map((it) => parseOpening(it)).filter(Boolean);
      if (parsed.length === 0) continue;

      let wallLen, wallH;
      if (wallKey === "outer") {
        wallLen = isSide ? ltLen : adjW;
        wallH = ltH;
      } else {
        wallLen = ltW;
        wallH = (attachH + ltH) / 2;
      }

      const spacing = wallLen / (parsed.length + 1);
      parsed.forEach((p, idx) => {
        const offset = spacing * (idx + 1) - wallLen / 2;
        result.push({ ...p, wallKey, offset, wallLen, wallH });
      });
    }
    return result;
  }, [openings, isSide, ltLen, adjW, ltW, ltH, attachH]);

  const Z_OFFSET = MAIN_TUBE_SKIN;

  return (
    <group>
      {allItems.map((item, i) => {
        const ow = item.wFt * SCALE;
        const oh = Math.min(item.hFt * SCALE, item.wallH * 0.9);

        let pos, rot;
        if (item.wallKey === "outer") {
          if (isSide) {
            pos = [sign * (halfW + ltW) + sign * Z_OFFSET, oh / 2, item.offset];
            rot = [0, sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0];
          } else {
            pos = [adjXCenter + item.offset, oh / 2, sign * (l / 2 + ltW) + sign * Z_OFFSET];
            rot = [0, sign > 0 ? 0 : Math.PI, 0];
          }
        } else if (item.wallKey === "left_end") {
          if (isSide) {
            const midX = sign * (halfW + ltW / 2);
            pos = [midX + item.offset, oh / 2, -halfLtLen - Z_OFFSET];
            rot = [0, Math.PI, 0];
          } else {
            const midZ = sign * (l / 2 + ltW / 2);
            pos = [adjXCenter - adjW / 2 - Z_OFFSET, oh / 2, midZ + item.offset];
            rot = [0, -Math.PI / 2, 0];
          }
        } else {
          if (isSide) {
            const midX = sign * (halfW + ltW / 2);
            pos = [midX + item.offset, oh / 2, halfLtLen + Z_OFFSET];
            rot = [0, 0, 0];
          } else {
            const midZ = sign * (l / 2 + ltW / 2);
            pos = [adjXCenter + adjW / 2 + Z_OFFSET, oh / 2, midZ + item.offset];
            rot = [0, Math.PI / 2, 0];
          }
        }

        return (
          <group key={`lt-opening-${i}`} position={pos} rotation={rot}>
            <Opening3D ow={ow} oh={oh} type={item.type} />
          </group>
        );
      })}
    </group>
  );
}

// ─── LEAN-TO END WALL (trapezoid) ──────────────────────────

function LeanToEndWall({ innerX, outerX, innerH, outerH, z, zOuter, isEndType = false, tex, flip }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    let verts;
    if (isEndType) {
      // End lean-to: wall perpendicular to X axis
      const x = innerX;
      verts = new Float32Array([
        x, 0, z,
        x, 0, zOuter,
        x, outerH, zOuter,
        x, innerH, z,
      ]);
    } else {
      // Side lean-to: wall perpendicular to Z axis
      verts = new Float32Array([
        innerX, 0, z,
        outerX, 0, z,
        outerX, outerH, z,
        innerX, innerH, z,
      ]);
    }
    const uvs = new Float32Array([0, 0, 1, 0, 1, 0.8, 0, 1]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(flip ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    return g;
  }, [innerX, outerX, innerH, outerH, z, zOuter, isEndType, flip]);

  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial map={tex} roughness={0.6} metalness={0.2} side={2} />
    </mesh>
  );
}

// ─── CAMERA CONTROLLER — auto-focus on selected wall ──────
// Smoothly orbits the camera to face the highlighted wall while preserving
// distance and elevation. Only activates when highlightedWall changes.

function CameraController({ highlightedWall, grid, maxDim }) {
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
    if (!highlightedWall || highlightedWall === prevWall.current) return;
    prevWall.current = highlightedWall;

    const { h } = grid;
    const dist = maxDim * 1.3;
    const elev = dist * 0.5;

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
    targetPos.current = camTarget;
  }, [highlightedWall, grid, maxDim]);

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

function ViewerControlBridge({ apiRef, onNavSnapshot, maxDim, grid }) {
  const { camera, gl, scene, controls } = useThree();
  const anim = useRef(null);        // { pos, tgt } — smooth camera transition
  const baseDist = useRef(null);    // initial camera distance (100% zoom)
  const inited = useRef(false);

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
    if (!baseDist.current) baseDist.current = camera.position.distanceTo(tgt);

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

    const getZoomPercent = () => Math.round((baseDist.current / camera.position.distanceTo(tgt)) * 100);

    const setZoomPercent = (pct) => {
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
      resetView: () => apiRef.current?.setView("iso"),
      setView: (name) => {
        const d = maxDim * 1.3;
        const elev = d * 0.5;
        const positions = {
          iso: [d * 0.9, d * 0.7, d * 0.8],
          front: [0, elev, -d],
          back: [0, elev, d],
          left: [-d, elev, 0],
          right: [d, elev, 0],
          top: [0, d * 1.15, 0.01],
        };
        const p = positions[name];
        if (p) applyView({ position: p, target: [0, grid.h / 2, 0] });
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
  }, [camera, gl, scene, controls, apiRef, maxDim, grid, onNavSnapshot]);

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

function ViewerToolbar({ apiRef, hist, onUndo, onRedo, onJump, display, setDisplay }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(null); // { panel, anchorIdx } | null
  const [status, setStatus] = useState("");
  const [azimuth, setAzimuth] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);

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
                  onClick={() => apiRef.current?.setView(v)}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <button style={{ ...VP_CHIP, width: "100%" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f2f2f2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              onClick={() => apiRef.current?.resetView()}>
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
      case "reset": api?.resetView(); break;
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
  // zoom + − · undo redo · view options (highlighted).
  const buttons = [
    { action: "reset", panel: "views", icon: "rotate", title: "Views & reset" },
    { panel: "capture", icon: "image", title: "Save image" },
    { action: "rotL", panel: "rotate", icon: "rotate-left", title: "Rotate left" },
    { action: "rotR", panel: "rotate", icon: "rotate-right", title: "Rotate right" },
    { action: "zoomIn", panel: "zoom", icon: "magnifying-glass-plus", title: "Zoom in" },
    { action: "zoomOut", panel: "zoom", icon: "magnifying-glass-minus", title: "Zoom out" },
    { action: "undo", panel: "history", icon: "arrow-rotate-left", title: "Undo view", disabled: !canUndo },
    { action: "redo", panel: "history", icon: "arrow-rotate-right", title: "Redo view", disabled: !canRedo },
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




