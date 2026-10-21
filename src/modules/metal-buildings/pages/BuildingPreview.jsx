"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Line, Html } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { createRibPanelGeometry, createRidgeCapGeometry } from "../3d/roof/ribPanelGeometry";

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
//   │   │   ├── Knee Braces   (BRACE_TUBE, optional)
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

// ─── STYLE PRESETS (rules, not geometry) ──────────────────
// Each style = a set of construction rules. Geometry is derived at render time.
// roofPanelDir: "horizontal" | "vertical" — panel seam direction on roof
// hasTruss: true = triangular web members inside each portal frame
// hasPurlins: true = secondary members along roof slope between bays
const STYLE_PRESETS = {
  regular:          { kneeBraces: true,  eaveOverhangFt: 0.5, ridgeCap: false, roofPanelDir: "horizontal", hasTruss: false, hasPurlins: false },
  aframe:           { kneeBraces: false, eaveOverhangFt: 0,   ridgeCap: true,  roofPanelDir: "horizontal", hasTruss: false, hasPurlins: false },
  aframe_vertical:  { kneeBraces: false, eaveOverhangFt: 0,   ridgeCap: true,  roofPanelDir: "vertical",   hasTruss: false, hasPurlins: false },
  rib_type:         { kneeBraces: false, eaveOverhangFt: 0,   ridgeCap: true,  roofPanelDir: "vertical",   hasTruss: false, hasPurlins: false },
  garage:           { kneeBraces: false, eaveOverhangFt: 0,   ridgeCap: true,  roofPanelDir: "vertical",   hasTruss: false, hasPurlins: false },
  barn:             { kneeBraces: false, eaveOverhangFt: 0,   ridgeCap: true,  roofPanelDir: "vertical",   hasTruss: false, hasPurlins: false },
  // Step-down (raised-center) barn: same roof rules as barn plus intrinsic
  // lower wings on both sides (fractions of the CENTER size; attachDropFt =
  // ft below the center eave where the wing roofs attach).
  step_down_barn:   { kneeBraces: false, eaveOverhangFt: 0,   ridgeCap: true,  roofPanelDir: "vertical",   hasTruss: false, hasPurlins: false, stepDown: { wingWidthFrac: 0.5, wingHeightFrac: 0.6, attachDropFt: 1 } },
};
function getPreset(roofStyle) {
  if (!roofStyle) return STYLE_PRESETS.rib_type;
  // Normalize: lowercase, strip hyphens/spaces
  const key = roofStyle.toLowerCase().replace(/[-\s]/g, "_");
  if (STYLE_PRESETS[key]) return STYLE_PRESETS[key];
  // Partial matches for common DB render_key variants
  if (key.includes("rib")) return STYLE_PRESETS.rib_type;
  if (key.includes("vertical")) return STYLE_PRESETS.aframe_vertical;
  if (key.includes("regular") || key.includes("carport") && !key.includes("aframe") && !key.includes("a_frame")) return STYLE_PRESETS.regular;
  if (key.includes("step")) return STYLE_PRESETS.step_down_barn;
  if (key.includes("barn")) return STYLE_PRESETS.barn;
  if (key.includes("garage")) return STYLE_PRESETS.garage;
  if (key.includes("aframe") || key.includes("a_frame")) return STYLE_PRESETS.aframe;
  return STYLE_PRESETS.rib_type;
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

  // Subtle raised-rib effect between seams (alternating slightly lighter/darker strips)
  const ribCount = Math.floor(size / lineSpacing);
  for (let i = 0; i < ribCount; i++) {
    const stripY = i * lineSpacing;
    // Minor rib highlight at center of each panel strip
    ctx.fillStyle = `rgba(255,255,255,0.07)`;
    ctx.fillRect(
      direction === "vertical" ? stripY + lineSpacing * 0.3 : 0,
      direction === "vertical" ? 0 : stripY + lineSpacing * 0.3,
      direction === "vertical" ? lineSpacing * 0.4 : size,
      direction === "vertical" ? size : lineSpacing * 0.4
    );
  }

  // Panel seam lines — bold enough to clearly define panels
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2.5;
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
  width = 24, length = 30, height = 10,
  roofStyle = "regular", roofPitch = null, defaultRoofPitch = 0.25,
  roofOverhang = 0, walls = {}, highlightedWall = null,
  sidingDirection = "vertical",
  roofColor = "#C89B68", wallColor = "#e0e0e0", twoToneColor = null,
  leantos = [], openings = {},
  onCaptureReady = null,
}) {
  const pitch = roofPitch != null ? roofPitch : defaultRoofPitch;
  const grid = useMemo(
    () => computeGrid(width, length, height, pitch, roofOverhang),
    [width, length, height, pitch, roofOverhang]
  );

  const { w, l, h } = grid;

  // ─── STEP DOWN BARN — intrinsic lower wings on both sides ──
  // The configured building size is the raised CENTER section; the wings are
  // fixed-proportion lower sections (styleProfiles stepDown spec) rendered
  // through the regular LeanToSystem so posts, walls and end walls all match.
  const stepSpec = getPreset(roofStyle).stepDown;
  const stepWings = useMemo(() => {
    if (!stepSpec) return [];
    return ["left", "right"].map((side_key) => ({
      side_key,
      intrinsic: true,
      width_ft: width * stepSpec.wingWidthFrac,
      height_ft: height * stepSpec.wingHeightFrac,
      length_ft: length,
      attachDropFt: stepSpec.attachDropFt,
      render_key: walls[side_key] ? "enclosed" : "open",
      walls: {
        outer: walls[side_key] === true ? "enclosed" : walls[side_key] || false,
        left_end: walls.front === true ? "enclosed" : walls.front || false,
        right_end: walls.back === true ? "enclosed" : walls.back || false,
      },
      openings: { outer: [], left_end: [], right_end: [] },
    }));
  }, [stepSpec, width, height, length, walls]);
  const allLeantos = [...stepWings, ...leantos];
  // Total footprint: center width + both wings (camera framing)
  const wingTotalW = stepWings.reduce((sum, lw) => sum + lw.width_ft * SCALE, 0);
  const maxDim = Math.max(grid.maxDim, w + wingTotalW);
  const camDist = maxDim * 1.3;
  const shadowSize = maxDim * 1.5;

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 400, background: "#eaf2fa" }}>
      <Canvas camera={{ position: [camDist * 0.9, camDist * 0.7, camDist * 0.8], fov: 50 }} shadows flat gl={{ preserveDrawingBuffer: true }}>
        <ambientLight intensity={0.85} />
        <directionalLight
          position={[maxDim * 0.8, maxDim * 1.2, maxDim * 0.6]}
          intensity={1.4} castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-left={-shadowSize} shadow-camera-right={shadowSize}
          shadow-camera-top={shadowSize} shadow-camera-bottom={-shadowSize}
          shadow-camera-near={0.1} shadow-camera-far={maxDim * 4}
        />
        <directionalLight position={[-maxDim * 0.5, maxDim * 0.6, -maxDim * 0.4]} intensity={0.6} />
        <OrbitControls enablePan={false} minDistance={maxDim * 0.5} maxDistance={maxDim * 4} maxPolarAngle={Math.PI * 0.85} minPolarAngle={0.1} target={[0, h / 2, 0]} />

        <FrameSystem grid={grid} roofStyle={roofStyle} walls={walls} />
        <RoofSystem grid={grid} roofColor={roofColor} roofStyle={roofStyle} walls={walls} />
        <WallPanels grid={grid} walls={walls} highlightedWall={highlightedWall} wallColor={wallColor} twoToneColor={twoToneColor} sidingDirection={sidingDirection} verticalSiding={!!stepSpec} />
        <TrimSystem grid={grid} roofStyle={roofStyle} />
        {allLeantos.map((lt, i) => (
          <LeanToSystem key={`lt-${i}`} grid={grid} leanto={lt} roofColor={roofColor} wallColor={wallColor} siblingLeantos={allLeantos} />
        ))}
        <WallLabels grid={grid} />
        <Grid args={[80, 80]} position={[0, -0.01, 0]} cellColor="#ddd" sectionColor="#bbb" fadeDistance={maxDim * 3} />
        <ViewCaptureBridge onCaptureReady={onCaptureReady} grid={grid} maxDim={maxDim} />
      </Canvas>
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
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.15} />
    </mesh>
  );
}

// ─── COLUMN BASE PLATE (visual anchor at ground level) ──────

function BasePlate({ x, z }) {
  const plateSize = MAIN_TUBE * 2.5;
  return (
    <mesh position={[x, 0.01, z]} castShadow receiveShadow>
      <boxGeometry args={[plateSize, 0.02, plateSize]} />
      <meshStandardMaterial color={STEEL_COLOR} roughness={0.55} metalness={0.15} />
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
//   │   └── Knee Braces     (BRACE_TUBE, optional per style)
//   │
//   ├── Secondary (along length, connecting portals)
//   │   ├── Eave Struts     (SECONDARY_TUBE)
//   │   ├── Base Rails      (SECONDARY_TUBE)
//   │   └── Ridge Beam      (SECONDARY_TUBE, peaked styles only)
//   │
//   └── No girts/purlins visible — they live behind panels
// ═══════════════════════════════════════════════════════════

function FrameSystem({ grid, roofStyle, walls = {} }) {
  const { l, h, halfW, roofPeak, bayPositions } = grid;
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
      m.push({ s: [-halfW, 0, z], e: [-halfW, h, z], t: MAIN_TUBE });
      m.push({ s: [halfW, 0, z], e: [halfW, h, z], t: MAIN_TUBE });

      // Rafters — always visible at edge bays; interior hidden only when fully enclosed
      if (isEdgeBay || !isFullyEnclosed) {
        m.push({ s: [-halfW, h, z], e: [0, h + roofPeak, z], t: MAIN_TUBE });
        m.push({ s: [halfW, h, z], e: [0, h + roofPeak, z], t: MAIN_TUBE });
      }

      // Knee braces — visible on edge bays always; interior only when open
      if (preset.kneeBraces && (isEdgeBay || !isFullyEnclosed)) {
        const bH = Math.min(h * 0.18, 0.6);
        const bW = Math.min(h * 0.12, 0.4);
        m.push({ s: [-halfW, h - bH, z], e: [-halfW + bW, h, z], t: BRACE_TUBE });
        m.push({ s: [halfW, h - bH, z], e: [halfW - bW, h, z], t: BRACE_TUBE });
      }
    }

    // Eave struts — always present (they define the roof edge silhouette)
    m.push({ s: [-halfW, h, zF], e: [-halfW, h, zB], t: SECONDARY_TUBE });
    m.push({ s: [halfW, h, zF], e: [halfW, h, zB], t: SECONDARY_TUBE });

    // Base rails — hidden only when that specific side wall covers them
    if (!hasLeft)  m.push({ s: [-halfW, 0, zF], e: [-halfW, 0, zB], t: SECONDARY_TUBE });
    if (!hasRight) m.push({ s: [halfW, 0, zF], e: [halfW, 0, zB], t: SECONDARY_TUBE });

    // Ridge beam — always present (defines roofline)
    m.push({ s: [0, h + roofPeak, zF], e: [0, h + roofPeak, zB], t: SECONDARY_TUBE });

    // Purlins — only when open (no walls at all)
    if (preset.hasPurlins && !hasAnyWall) {
      const PURLIN_COUNT = 3;
      for (let bi = 0; bi < bayPositions.length - 1; bi++) {
        const z1 = bayPositions[bi], z2 = bayPositions[bi + 1];
        for (let pi = 1; pi <= PURLIN_COUNT; pi++) {
          const t = pi / (PURLIN_COUNT + 1);
          const px = halfW * (1 - t);
          const py = h + roofPeak * t;
          m.push({ s: [-px, py, z1], e: [-px, py, z2], t: BRACE_TUBE });
          m.push({ s: [px, py, z1], e: [px, py, z2], t: BRACE_TUBE });
        }
      }
    }

    // Truss webbing — edge bays always; interior only when open
    if (preset.hasTruss) {
      for (let bi = 0; bi < bayPositions.length; bi++) {
        const z = bayPositions[bi];
        const isEdge = bi === 0 || bi === bayPositions.length - 1;
        if (!isEdge && isFullyEnclosed) continue;

        m.push({ s: [-halfW, h, z], e: [halfW, h, z], t: SECONDARY_TUBE });
        const DIVISIONS = 4;
        for (let side = -1; side <= 1; side += 2) {
          for (let wi = 0; wi < DIVISIONS; wi++) {
            const t1 = wi / DIVISIONS;
            const t2 = (wi + 1) / DIVISIONS;
            const tMid = (t1 + t2) / 2;
            const topX1 = side * halfW * (1 - t1);
            const topY1 = h + roofPeak * t1;
            const topX2 = side * halfW * (1 - t2);
            const topY2 = h + roofPeak * t2;
            const botX = side * halfW * (1 - tMid);
            const botY = h;
            m.push({ s: [botX, botY, z], e: [topX2, topY2, z], t: BRACE_TUBE });
            if (wi > 0) {
              m.push({ s: [topX1, botY, z], e: [topX1, topY1, z], t: BRACE_TUBE });
            }
          }
        }
      }
    }

    return m;
  }, [l, h, halfW, roofPeak, preset, bayPositions, hasLeft, hasRight, hasAnyWall, isFullyEnclosed]);

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
      {members.map((t, i) => (
        <SteelTube key={`f${i}`} start={t.s} end={t.e} size={t.t} />
      ))}
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
  const { w, l, h, halfW, roofPeak, ovEX, ovEY, slopeLen } = grid;
  const preset = getPreset(roofStyle);
  const color = roofColor || "#C89B68";
  const hasAnyWall = !!(walls.left || walls.right || walls.front || walls.back);
  // Roof sits above rafters — offset = half the main tube so roof clears frame
  const ROOF_OFFSET = MAIN_TUBE * 0.55;
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

function WallPanels({ grid, walls, highlightedWall, wallColor, twoToneColor, sidingDirection = "vertical", verticalSiding = false }) {
  const { w, l, h, halfW, roofPeak, bayCount, bay } = grid;
  const panelColor = wallColor || "#e0e0e0";
  const splitY = h / 2;
  const highlightColor = "#00e5ff";

  const getColor = (wall) => highlightedWall === wall ? highlightColor : panelColor;
  const getOpacity = (wall) => highlightedWall === wall ? 0.3 : 1.0;
  const isHighlight = (wall) => highlightedWall === wall;
  const wallType = (wall) => {
    if (highlightedWall === wall && !walls[wall]) return "enclosed";
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
    const hl = isHighlight(wall);
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

    if (!twoToneColor || hl) {
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
        <EndWallMesh w={w} h={h} roofPeak={roofPeak} z={-l / 2} type={wallType("front")} color={getColor("front")} opacity={getOpacity("front")} twoToneColor={isHighlight("front") ? null : twoToneColor} splitY={splitY} sidingDirection={sidingDirection} ribSiding={wallType("front") === "enclosed" && !verticalSiding} />
      )}
      {wallType("back") && (
        <EndWallMesh w={w} h={h} roofPeak={roofPeak} z={l / 2} type={wallType("back")} color={getColor("back")} opacity={getOpacity("back")} twoToneColor={isHighlight("back") ? null : twoToneColor} splitY={splitY} sidingDirection={sidingDirection} ribSiding={wallType("back") === "enclosed" && !verticalSiding} />
      )}
      {renderSideWall(-halfW, "left")}
      {renderSideWall(halfW, "right")}
      {highlightedWall && <WallHighlightEdge w={w} l={l} h={h} roofPeak={roofPeak} wall={highlightedWall} wallType={wallType(highlightedWall)} />}
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

const OPENING_COLORS = { door: "#6b4226", window: "#a8d8ea", frameout: "#555555", rollup_door: "#8a8a8a", vent: "#999999" };
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

function WallOpenings({ grid, openings }) {
  const { w, l, h, halfW } = grid;
  const allItems = useMemo(() => {
    const result = [];
    for (const [wall, items] of Object.entries(openings)) {
      if (!items || items.length === 0) continue;
      const isEnd = wall === "front" || wall === "back";
      const wallLen = isEnd ? w : l;
      // Spread items evenly along the wall
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
        const ow = item.wFt * SCALE;
        const oh = item.hFt * SCALE;
        const color = OPENING_COLORS[item.type] || "#555";
        const isEnd = item.wall === "front" || item.wall === "back";
        const Z_OFFSET = 0.02;

        let pos, rot;
        if (item.wall === "left") {
          pos = [-halfW - Z_OFFSET, oh / 2, item.offset];
          rot = [0, Math.PI / 2, 0];
        } else if (item.wall === "right") {
          pos = [halfW + Z_OFFSET, oh / 2, item.offset];
          rot = [0, Math.PI / 2, 0];
        } else if (item.wall === "front") {
          pos = [item.offset, oh / 2, -l / 2 - Z_OFFSET];
          rot = [0, 0, 0];
        } else {
          pos = [item.offset, oh / 2, l / 2 + Z_OFFSET];
          rot = [0, 0, 0];
        }

        return (
          <mesh key={`opening-${i}`} position={pos} rotation={rot}>
            <planeGeometry args={[ow, oh]} />
            <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} side={2} />
          </mesh>
        );
      })}
    </group>
  );
}

// ─── LEAN-TO SYSTEM ────────────────────────────────────────
// Renders a single lean-to attached to one side of the main building.
// leanto: { side_key, width_ft, height_ft, render_key }

function LeanToSystem({ grid, leanto, roofColor, wallColor, siblingLeantos }) {
  const { l, h, halfW, w, bayPositions } = grid;
  const side = leanto.side_key;
  const ltWidthFt = leanto.width_ft || 10;
  const ltHeightFt = leanto.height_ft || (leanto.drop_ft ? ((h / SCALE) - leanto.drop_ft) : 6);
  const isOpen = leanto.render_key === "open" || !leanto.render_key;

  const ltW = ltWidthFt * SCALE;       // lean-to projection (scene units)
  const ltH = ltHeightFt * SCALE;      // lean-to outer leg height (scene units)
  const isSide = side === "left" || side === "right";

  // Lean-to length along the building wall (may be shorter than full wall)
  const maxLen = isSide ? l : w;       // full wall length in scene units
  const ltLenFt = leanto.length_ft;
  const ltLen = ltLenFt ? Math.min(ltLenFt * SCALE, maxLen) : maxLen;

  // Lean-to top edge = main eave height (NOT ridge); intrinsic step-down wings
  // pass attachDropFt (ft below the eave) to create the visible "step".
  const attachH = h - (leanto.attachDropFt != null ? leanto.attachDropFt * SCALE : 0);
  const sign = (side === "right" || side === "back") ? 1 : -1;
  const SEAM_OFFSET = 0.01;          // prevent z-fighting at attachment seam

  // ── CORNER COLLISION: end lean-tos shrink where side lean-tos exist ──
  // Side lean-tos keep their length; end lean-tos yield at corners.
  const { adjXMin, adjXMax } = useMemo(() => {
    let xMin = -w / 2, xMax = w / 2;
    if (!isSide && siblingLeantos) {
      for (const s of siblingLeantos) {
        if (s === leanto) continue;
        if (s.side_key === "left") xMin += (s.width_ft || 0) * SCALE;
        if (s.side_key === "right") xMax -= (s.width_ft || 0) * SCALE;
      }
    }
    return { adjXMin: xMin, adjXMax: xMax };
  }, [isSide, siblingLeantos, leanto, w]);

  // For side lean-tos: use ltLen (centered along Z). For end: use adjusted X range.
  const halfLtLen = ltLen / 2;
  const adjW = isSide ? ltLen : Math.min(adjXMax - adjXMin, ltLen);
  const adjXCenter = (adjXMin + adjXMax) / 2;
  const attachLen = adjW;  // length along the building

  // Posts along outer edge at bay spacing
  const postPositions = useMemo(() => {
    if (isSide) {
      // Side lean-to: use bay positions that fall within the lean-to length
      if (ltLen >= l) return bayPositions;
      return bayPositions.filter((z) => z >= -halfLtLen && z <= halfLtLen);
    }
    // End lean-to: posts along adjusted X range
    const eAdjW = Math.min(adjXMax - adjXMin, ltLen);
    const eCenter = (adjXMin + adjXMax) / 2;
    const eMin = eCenter - eAdjW / 2;
    const baySpacing = BAY_SPACING_FT * SCALE;
    const count = Math.max(1, Math.round(eAdjW / baySpacing));
    const step = eAdjW / count;
    const posts = [];
    for (let i = 0; i <= count; i++) posts.push(eMin + step * i);
    return posts;
  }, [isSide, bayPositions, adjXMax, adjXMin, ltLen, halfLtLen, l]);

  // Wall texture for enclosed lean-to
  const wallTex = useMemo(() => {
    if (isOpen) return null;
    const tex = createPanelTexture(wallColor, "vertical", 28);
    const along = Math.max(1, Math.round(attachLen / 1.5));
    const up = Math.max(1, Math.round(ltH / 1.5));
    tex.repeat.set(along, up);
    return tex;
  }, [isOpen, wallColor, attachLen, ltH]);

  // End wall texture
  const endWallTex = useMemo(() => {
    if (isOpen) return null;
    const tex = createPanelTexture(wallColor, "vertical", 28);
    const across = Math.max(1, Math.round(ltW / 1.5));
    const up = Math.max(1, Math.round(((attachH + ltH) / 2) / 1.5));
    tex.repeat.set(across, up);
    return tex;
  }, [isOpen, wallColor, ltW, attachH, ltH]);

  // Roof skin — same R-panel rib geometry as the main building roof
  // (3d/roof/ribPanelGeometry.js): major rib every 12", ribs run down the
  // slope, profile repeats along the lean-to length.
  const roofGeo = useMemo(() => {
    if (isSide) {
      // Side lean-to: slope in X, span along Z — the module's native frame
      const innerX = sign * halfW + sign * SEAM_OFFSET;
      const outerX = sign * (halfW + ltW);
      return createRibPanelGeometry({
        zF: -halfLtLen, zB: halfLtLen,
        eave: [outerX, ltH],
        ridge: [innerX, attachH],
      });
    }
    // End lean-to: slope in Z, X extent adjusted for corners. Build the strip
    // in the module's native frame (slope along X, span along Z), then rotate
    // -90° about Y onto the end wall: native slope X -> world Z and native
    // span Z -> world X. Ribs then run down the slope and the profile repeats
    // along the lean-to length, matching the main roof.
    const eAdjW = Math.min(adjXMax - adjXMin, ltLen);
    const eCenter = (adjXMin + adjXMax) / 2;
    const eMax = eCenter + eAdjW / 2;
    const innerZ = sign * (l / 2) + sign * SEAM_OFFSET;
    const outerZ = sign * (l / 2 + ltW);
    const g = createRibPanelGeometry({
      zF: 0, zB: eAdjW,
      eave: [0, 0],
      ridge: [innerZ - outerZ, attachH - ltH],
    });
    g.rotateY(-Math.PI / 2);
    g.translate(eMax, ltH, outerZ);
    return g;
  }, [isSide, sign, halfW, ltW, ltH, attachH, l, adjXMin, adjXMax, halfLtLen, ltLen]);

  // Dispose rebuilt/unmounted roof geometry
  useEffect(() => () => { roofGeo?.dispose(); }, [roofGeo]);

  return (
    <group>
      {/* Lean-to roof — same rib-panel skin as the main roof */}
      <mesh geometry={roofGeo} castShadow receiveShadow>
        <meshStandardMaterial color={roofColor} roughness={0.42} metalness={0.35} flatShading side={THREE.DoubleSide} />
      </mesh>

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
        return <SteelTube key={`ltp${i}`} start={start} end={end} size={SECONDARY_TUBE} />;
      })}

      {/* Outer eave beam (along top of outer posts) */}
      {isSide ? (
        <SteelTube
          start={[sign * (halfW + ltW), ltH, -halfLtLen]}
          end={[sign * (halfW + ltW), ltH, halfLtLen]}
          size={SECONDARY_TUBE}
        />
      ) : (
        <SteelTube
          start={[adjXCenter - adjW / 2, ltH, sign * (l / 2 + ltW)]}
          end={[adjXCenter + adjW / 2, ltH, sign * (l / 2 + ltW)]}
          size={SECONDARY_TUBE}
        />
      )}

      {/* Outer wall panel (if enclosed) */}
      {!isOpen && wallTex && (
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
      {!isOpen && endWallTex && (
        isSide ? (
          <>
            <LeanToEndWall
              innerX={sign * halfW} outerX={sign * (halfW + ltW)}
              innerH={attachH} outerH={ltH} z={-halfLtLen}
              tex={endWallTex} flip={false}
            />
            <LeanToEndWall
              innerX={sign * halfW} outerX={sign * (halfW + ltW)}
              innerH={attachH} outerH={ltH} z={halfLtLen}
              tex={endWallTex} flip={true}
            />
          </>
        ) : (
          <>
            <LeanToEndWall
              innerX={adjXCenter - adjW / 2} outerX={adjXCenter - adjW / 2}
              innerH={attachH} outerH={ltH}
              z={sign * (l / 2)} zOuter={sign * (l / 2 + ltW)}
              isEndType tex={endWallTex} flip={false}
            />
            <LeanToEndWall
              innerX={adjXCenter + adjW / 2} outerX={adjXCenter + adjW / 2}
              innerH={attachH} outerH={ltH}
              z={sign * (l / 2)} zOuter={sign * (l / 2 + ltW)}
              isEndType tex={endWallTex} flip={true}
            />
          </>
        )
      )}

      {/* Base trim along outer edge */}
      {isSide ? (
        <mesh position={[sign * (halfW + ltW), 0.02, 0]} castShadow>
          <boxGeometry args={[0.04, 0.04, ltLen]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.4} metalness={0.3} />
        </mesh>
      ) : (
        <mesh position={[adjXCenter, 0.02, sign * (l / 2 + ltW)]} castShadow>
          <boxGeometry args={[adjW, 0.04, 0.04]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.4} metalness={0.3} />
        </mesh>
      )}
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

// ─── WALL HIGHLIGHT EDGE ───────────────────────────────────

function WallHighlightEdge({ w, l, h, roofPeak, wall, wallType: wType }) {
  const points = useMemo(() => {
    const isEnd = wall === "front" || wall === "back";
    const z = wall === "front" ? -l / 2 : l / 2;
    if (isEnd && wType === "gable") return [[-w/2, h, z], [0, h + roofPeak, z], [w/2, h, z], [-w/2, h, z]];
    if (isEnd) return [[-w/2, 0, z], [w/2, 0, z], [w/2, h, z], [0, h + roofPeak, z], [-w/2, h, z], [-w/2, 0, z]];
    if (wall === "left") return [[-w/2, 0, -l/2], [-w/2, 0, l/2], [-w/2, h, l/2], [-w/2, h, -l/2], [-w/2, 0, -l/2]];
    if (wall === "right") return [[w/2, 0, -l/2], [w/2, 0, l/2], [w/2, h, l/2], [w/2, h, -l/2], [w/2, 0, -l/2]];
    return [];
  }, [w, l, h, roofPeak, wall, wType]);

  if (points.length === 0) return null;
  return <Line points={points} color="#00e5ff" lineWidth={5} />;
}
