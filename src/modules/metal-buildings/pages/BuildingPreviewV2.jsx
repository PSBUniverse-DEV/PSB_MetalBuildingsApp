"use client";
// ═══════════════════════════════════════════════════════════
// BuildingPreviewV2 — Version 2 of the 3D building preview
// Forked from BuildingPreview.jsx for independent iteration.
// ═══════════════════════════════════════════════════════════

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Line, Html } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { WalkInDoor, RollupDoor, Window, Frameout, Vent } from "../3d";
import { getStyleProfile } from "../data/styleProfiles";

// ═══════════════════════════════════════════════════════════
// PARAMETRIC METAL BUILDING — ONE ENGINE, STYLE RULES
//
// Architecture:
//   Building
//   ├── Structure (FrameSystem)
//   │   ├── Portal Frames (repeated along length)
//   │   │   ├── Left Column   (MAIN_TUBE)
//   │   │   ├── Right Column  (MAIN_TUBE)
//   │   │   ├── Rafters       (MAIN_TUBE, curved or straight)
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
//   │   ├── Gable rake / arc edges
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
const STEEL_COLOR = "#5a5a5a";
const TRIM_COLOR = "#1a1a1a";
const PANEL_WIDTH = 1.5 * SCALE; // one texture tile = ~3ft real panel width

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
}) {
  const pitch = roofPitch != null ? roofPitch : defaultRoofPitch;
  const grid = useMemo(
    () => computeGrid(width, length, height, pitch, roofOverhang),
    [width, length, height, pitch, roofOverhang]
  );

  const { w, l, h, maxDim } = grid;
  const camDist = maxDim * 1.3;
  const shadowSize = maxDim * 1.5;

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 400, background: "var(--psb-bg)" }}>
      <Canvas camera={{ position: [camDist * 0.9, camDist * 0.7, camDist * 0.8], fov: 50 }} shadows>
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[maxDim * 0.8, maxDim * 1.2, maxDim * 0.6]}
          intensity={0.9} castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-left={-shadowSize} shadow-camera-right={shadowSize}
          shadow-camera-top={shadowSize} shadow-camera-bottom={-shadowSize}
          shadow-camera-near={0.1} shadow-camera-far={maxDim * 4}
        />
        <directionalLight position={[-maxDim * 0.5, maxDim * 0.6, -maxDim * 0.4]} intensity={0.3} />
        <OrbitControls enablePan={false} minDistance={maxDim * 0.5} maxDistance={maxDim * 4} maxPolarAngle={Math.PI * 0.85} minPolarAngle={0.1} target={[0, h / 2, 0]} />

        <FrameSystem grid={grid} roofStyle={roofStyle} walls={walls} />
        <RoofSystem grid={grid} roofColor={roofColor} roofStyle={roofStyle} walls={walls} />
        <WallPanels grid={grid} walls={walls} highlightedWall={highlightedWall} wallColor={wallColor} twoToneColor={twoToneColor} sidingDirection={sidingDirection} roofStyle={roofStyle} />
        <TrimSystem grid={grid} roofStyle={roofStyle} />
        <WallOpenings grid={grid} openings={openings} />
        {leantos.map((lt, i) => (
          <LeanToSystem key={`lt-${i}`} grid={grid} leanto={lt} roofColor={roofColor} wallColor={wallColor} siblingLeantos={leantos} />
        ))}
        <WallLabels grid={grid} />
        <Grid args={[80, 80]} position={[0, -0.01, 0]} cellColor="#ddd" sectionColor="#bbb" fadeDistance={maxDim * 3} />
      </Canvas>
    </div>
  );
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

// ─── CURVED ARC HELPERS (for Regular Carport bow roof) ─────
// Generates points for a peaked roof with curved (bowed) slopes.
// The roof has a sharp ridge at center-top, with each side curving
// outward (convex) from ridge down to eave — like the NorthEdge style.

const ARC_SEGMENTS = 24; // smoothness of each side curve

function computeArcPoints(halfW, h, rise, segments = ARC_SEGMENTS) {
  // Generate a peaked shape: two convex curves meeting at a sharp ridge.
  // Each side is a quadratic bezier: eave → control point (bowed out) → ridge
  const ridgeX = 0, ridgeY = h + rise;
  const points = [];
  const halfSegs = Math.floor(segments / 2);

  // Left side: from (-halfW, h) curving up to (0, h + rise)
  // Control point bows upward: midpoint lifted by a fraction of the rise
  const bowFraction = 0.35; // how much the curve bows out (upward from straight line)
  for (let i = 0; i <= halfSegs; i++) {
    const t = i / halfSegs;
    // Quadratic bezier: P = (1-t)^2 * P0 + 2*(1-t)*t * P1 + t^2 * P2
    const p0x = -halfW, p0y = h;
    const p2x = ridgeX, p2y = ridgeY;
    // Control point: midpoint of straight line, lifted upward
    const p1x = (p0x + p2x) / 2;
    const p1y = (p0y + p2y) / 2 + rise * bowFraction;
    const x = (1 - t) * (1 - t) * p0x + 2 * (1 - t) * t * p1x + t * t * p2x;
    const y = (1 - t) * (1 - t) * p0y + 2 * (1 - t) * t * p1y + t * t * p2y;
    points.push([x, y]);
  }

  // Right side: from (0, h + rise) curving down to (halfW, h)
  // Skip i=0 (that's the ridge, already added as the last left point)
  for (let i = 1; i <= halfSegs; i++) {
    const t = i / halfSegs;
    const p0x = ridgeX, p0y = ridgeY;
    const p2x = halfW, p2y = h;
    const p1x = (p0x + p2x) / 2;
    const p1y = (p0y + p2y) / 2 + rise * bowFraction;
    const x = (1 - t) * (1 - t) * p0x + 2 * (1 - t) * t * p1x + t * t * p2x;
    const y = (1 - t) * (1 - t) * p0y + 2 * (1 - t) * t * p1y + t * t * p2y;
    points.push([x, y]);
  }

  return points;
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
//   │   ├── Rafter           curved tube OR straight tubes (MAIN_TUBE)
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
      if (preset.hasLatticeColumns) {
        // ─── UNIFIED TRUSS PORTAL FRAME ──────────────────────────
        // One continuous structural skeleton: columns → top chord → bottom chord → web
        // Outer column rail flows into sloped top chord
        // Inner column rail flows into horizontal bottom chord
        const railGap = MAIN_TUBE * 1.8;
        const webSegs = Math.max(3, Math.round(h / (MAIN_TUBE * 6)));

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
        if (isEdgeBay || !isFullyEnclosed) {
          const leftOuter  = -halfW - railGap / 2;
          const rightOuter =  halfW + railGap / 2;
          const leftInner  = -halfW + railGap / 2;
          const rightInner =  halfW - railGap / 2;
          const ridgeY = h + roofPeak;

          // Top chord: left outer rail → ridge → right outer rail (continuous slope)
          m.push({ s: [leftOuter, h, z], e: [0, ridgeY, z], t: SECONDARY_TUBE });
          m.push({ s: [rightOuter, h, z], e: [0, ridgeY, z], t: SECONDARY_TUBE });

          // Bottom chord: horizontal at eave, connecting inner rails across full span
          m.push({ s: [leftInner, h, z], e: [rightInner, h, z], t: SECONDARY_TUBE });

          // King post: vertical at center
          m.push({ s: [0, h, z], e: [0, ridgeY, z], t: BRACE_TUBE });

          // Web members between top chord (sloped) and bottom chord (horizontal)
          for (const side of [-1, 1]) {
            const tStart = side === -1 ? leftOuter : rightOuter;
            const bStart = side === -1 ? leftInner : rightInner;
            const DIVS = 4;
            for (let di = 0; di < DIVS; di++) {
              const t1 = di / DIVS;
              const t2 = (di + 1) / DIVS;
              // Top chord points (sloped)
              const tx1 = tStart + (0 - tStart) * t1;
              const ty1 = h + roofPeak * t1;
              const tx2 = tStart + (0 - tStart) * t2;
              const ty2 = h + roofPeak * t2;
              // Bottom chord points (horizontal at h)
              const bx1 = bStart + (0 - bStart) * t1;
              // Vertical web member (skip first — that's the column eave tie)
              if (di > 0) {
                m.push({ s: [bx1, h, z], e: [tx1, ty1, z], t: BRACE_TUBE });
              }
              // Diagonal web member
              m.push({ s: [bx1, h, z], e: [tx2, ty2, z], t: BRACE_TUBE });
            }
          }
        }
      } else {
        // Solid tube columns
        m.push({ s: [-halfW, 0, z], e: [-halfW, h, z], t: MAIN_TUBE });
        m.push({ s: [halfW, 0, z], e: [halfW, h, z], t: MAIN_TUBE });
      }

      // Rafters — always visible at edge bays; interior hidden only when fully enclosed
      // Skip if lattice columns (lattice rafters already rendered above)
      if (!preset.curved && !preset.hasLatticeColumns) {
        if (isEdgeBay || !isFullyEnclosed) {
          m.push({ s: [-halfW, h, z], e: [0, h + roofPeak, z], t: MAIN_TUBE });
          m.push({ s: [halfW, h, z], e: [0, h + roofPeak, z], t: MAIN_TUBE });
        }
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
    // Outer rail eave struts for lattice buildings (top chord continuity in Z)
    if (preset.hasLatticeColumns) {
      const rg = MAIN_TUBE * 1.8;
      m.push({ s: [-halfW - rg / 2, h, zF], e: [-halfW - rg / 2, h, zB], t: BRACE_TUBE });
      m.push({ s: [halfW + rg / 2, h, zF], e: [halfW + rg / 2, h, zB], t: BRACE_TUBE });
    }

    // Base rails — hidden only when that specific side wall covers them
    if (!hasLeft)  m.push({ s: [-halfW, 0, zF], e: [-halfW, 0, zB], t: SECONDARY_TUBE });
    if (!hasRight) m.push({ s: [halfW, 0, zF], e: [halfW, 0, zB], t: SECONDARY_TUBE });

    // Ridge beam — always present (defines roofline)
    if (!preset.curved) {
      m.push({ s: [0, h + roofPeak, zF], e: [0, h + roofPeak, zB], t: SECONDARY_TUBE });
    }

    // Purlins — only when open (no walls at all)
    if (preset.hasPurlins && !preset.curved && !hasAnyWall) {
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
    // Skip when hasLatticeColumns (unified truss frame handles it)
    if (preset.hasTruss && !preset.curved && !preset.hasLatticeColumns) {
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
  }, [l, h, halfW, roofPeak, preset, bayPositions, hasLeft, hasRight, hasFront, hasBack, hasAnyWall, isFullyEnclosed]);

  // ─── Curved rafters — always at edge bays; interior hidden when enclosed ──
  const bowTubes = useMemo(() => {
    if (!preset.curved) return null;
    const arc = computeArcPoints(halfW, h, roofPeak, ARC_SEGMENTS);
    const positions = isFullyEnclosed
      ? [bayPositions[0], bayPositions[bayPositions.length - 1]]
      : bayPositions;
    return positions.map((z) => {
      const path = new THREE.CatmullRomCurve3(
        arc.map(([x, y]) => new THREE.Vector3(x, y, z)),
        false, "centripetal"
      );
      return new THREE.TubeGeometry(path, ARC_SEGMENTS * 2, MAIN_TUBE * 0.5, 8, false);
    });
  }, [preset.curved, halfW, h, roofPeak, bayPositions, isFullyEnclosed]);

  // ─── Hat Channels (purlins along roof slope, connecting bows) ──
  // Only for curved roofs when structure is visible (not fully enclosed)
  const hatChannels = useMemo(() => {
    if (!preset.curved || isFullyEnclosed) return [];
    const arc = computeArcPoints(halfW, h, roofPeak, ARC_SEGMENTS);
    const HAT_COUNT = 5; // number of hat channels per side (evenly spaced along arc)
    const halfLen = arc.length - 1;
    const midIdx = Math.floor(halfLen / 2); // approximate ridge index
    const channels = [];

    // Place hat channels at evenly spaced positions along the arc
    for (let ci = 1; ci <= HAT_COUNT; ci++) {
      const idx = Math.round((ci / (HAT_COUNT + 1)) * (arc.length - 1));
      const [x, y] = arc[idx];
      // Run along length (Z axis) between consecutive bays
      for (let bi = 0; bi < bayPositions.length - 1; bi++) {
        channels.push({ s: [x, y, bayPositions[bi]], e: [x, y, bayPositions[bi + 1]], t: BRACE_TUBE });
      }
    }
    return channels;
  }, [preset.curved, isFullyEnclosed, halfW, h, roofPeak, bayPositions]);

  // ─── Ridge beam for curved style ──
  const ridgeBeamCurved = useMemo(() => {
    if (!preset.curved) return null;
    const arc = computeArcPoints(halfW, h, roofPeak, ARC_SEGMENTS);
    // Ridge is the highest point (middle of the arc)
    const midIdx = Math.floor((arc.length - 1) / 2);
    const [rx, ry] = arc[midIdx];
    return { s: [rx, ry, -l / 2], e: [rx, ry, l / 2], t: SECONDARY_TUBE };
  }, [preset.curved, halfW, h, roofPeak, l]);

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
      {bowTubes && bowTubes.map((geo, i) => (
        <mesh key={`bow${i}`} geometry={geo} castShadow>
          <meshStandardMaterial color={STEEL_COLOR} roughness={0.4} metalness={0.6} />
        </mesh>
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
// Regular: curved cylindrical surface from arc
// Peaked:  two flat slope planes meeting at ridge
// Both:    slight overhang past posts, strong surface presence
// ═══════════════════════════════════════════════════════════

function RoofSystem({ grid, roofColor, roofStyle, walls = {} }) {
  const { w, l, h, halfW, roofPeak, ovEX, ovEY, slopeLen } = grid;
  const preset = getPreset(roofStyle);
  const color = roofColor || "#cc0000";
  const ov = preset.eaveOverhangFt * SCALE + grid.overhang;
  const hasAnyWall = !!(walls.left || walls.right || walls.front || walls.back);
  // Roof sits above rafters — offset = half the main tube so roof clears frame
  const ROOF_OFFSET = MAIN_TUBE * 0.55;
  // Roof panel thickness (real sheet metal cladding look)
  const ROOF_THICK = 0.03;

  // ─── CURVED ROOF (Regular Carport) ─────────────────────
  const curvedGeo = useMemo(() => {
    if (!preset.curved) return null;
    const arcHW = halfW + ov;
    const arcRise = roofPeak;
    const arc = computeArcPoints(arcHW, h, arcRise, ARC_SEGMENTS);
    // Offset each point along the curve's outward normal so roof sits ON TOP of bows
    const SKIN_OFFSET = MAIN_TUBE * 0.6;
    const roofArc = arc.map(([x, y], i) => {
      // Compute normal by finite differences of neighbors
      const prev = arc[Math.max(0, i - 1)];
      const next = arc[Math.min(arc.length - 1, i + 1)];
      const tx = next[0] - prev[0]; // tangent x
      const ty = next[1] - prev[1]; // tangent y
      const tLen = Math.sqrt(tx * tx + ty * ty) || 1;
      // Normal is perpendicular to tangent, pointing outward (up/away from center)
      const nx = -ty / tLen;
      const ny = tx / tLen;
      return [x + nx * SKIN_OFFSET, y + ny * SKIN_OFFSET];
    });
    const zF = -l / 2 - ov, zB = l / 2 + ov;
    const segs = roofArc.length - 1;
    const positions = [];
    const uvs = [];
    for (let i = 0; i <= segs; i++) {
      const [x, y] = roofArc[i];
      const u = i / segs;
      positions.push(x, y, zF);
      uvs.push(u, 0);
      positions.push(x, y, zB);
      uvs.push(u, 1);
    }
    const indices = [];
    for (let i = 0; i < segs; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }, [preset.curved, halfW, h, roofPeak, l, ov]);

  const curvedTex = useMemo(() => {
    if (!preset.curved) return null;
    // Regular carport: smooth horizontal panels (subtle, not prominent)
    const tex = createPanelTexture(color, "horizontal", 64);
    tex.repeat.set(1, Math.max(1, Math.round((halfW * 2 + roofPeak) / PANEL_WIDTH / 4)));
    return tex;
  }, [preset.curved, color, halfW, roofPeak]);

  // ─── PEAKED ROOF (A-Frame, Vertical, Garage, Barn) ─────
  const roofTex = useMemo(() => {
    if (preset.curved) return null;
    const dir = preset.roofPanelDir || "horizontal";
    // Create texture with visible panel seam lines (4 seams per tile)
    const tex = createPanelTexture(color, dir, 64);
    // UV mapping: U = along building length, V = along roof slope
    // Each tile at repeat=1 covers the whole surface. Scale so seams appear at ~3ft intervals.
    const slopeApprox = Math.sqrt((halfW + ovEX) * (halfW + ovEX) + roofPeak * roofPeak);
    // 4 seam lines per tile × repeat = total seam count in each direction
    const uRepeat = Math.max(1, Math.round(l / (PANEL_WIDTH * 4)));
    const vRepeat = Math.max(1, Math.round(slopeApprox / (PANEL_WIDTH * 4)));
    tex.repeat.set(uRepeat, vRepeat);
    return tex;
  }, [preset.curved, preset.roofPanelDir, color, halfW, ovEX, roofPeak, l]);

  // Peaked roof: build two slope quads as BufferGeometry (reliable from all angles)
  const ro = ROOF_OFFSET;
  // Extend roof past wall surfaces: base gap cover + actual overhang
  const eaveExt = MAIN_TUBE * 0.8 + ovEX;
  const eaveExtY = ovEY; // vertical drop at eave due to overhang slope
  const zF = -l / 2 - eaveExt, zB = l / 2 + eaveExt;
  const ridgeY = h + roofPeak + ro;
  const eaveY = h + ro - eaveExtY;

  const leftSlopeGeo = useMemo(() => {
    if (preset.curved) return null;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array([
      -(halfW + eaveExt), eaveY, zF,
      -(halfW + eaveExt), eaveY, zB,
       0,                 ridgeY, zB,
       0,                 ridgeY, zF,
    ]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    return g;
  }, [preset.curved, halfW, eaveExt, eaveY, ridgeY, zF, zB]);

  const rightSlopeGeo = useMemo(() => {
    if (preset.curved) return null;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array([
      halfW + eaveExt, eaveY, zF,
      halfW + eaveExt, eaveY, zB,
      0,               ridgeY, zB,
      0,               ridgeY, zF,
    ]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [preset.curved, halfW, eaveExt, eaveY, ridgeY, zF, zB]);

  if (preset.curved) {
    return (
      <group>
        <mesh geometry={curvedGeo} castShadow receiveShadow>
          <meshStandardMaterial map={curvedTex} roughness={0.45} metalness={0.35} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      {/* Left roof slope */}
      <mesh geometry={leftSlopeGeo} castShadow receiveShadow>
        <meshStandardMaterial map={roofTex} roughness={0.45} metalness={0.35} side={THREE.DoubleSide} />
      </mesh>
      {/* Right roof slope */}
      <mesh geometry={rightSlopeGeo} castShadow receiveShadow>
        <meshStandardMaterial map={roofTex} roughness={0.45} metalness={0.35} side={THREE.DoubleSide} />
      </mesh>
      {/* Ridge cap */}
      {preset.ridgeCap && (
        <mesh position={[0, ridgeY + ROOF_THICK, 0]} castShadow>
          <boxGeometry args={[0.14, 0.04, l]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.3} metalness={0.5} />
        </mesh>
      )}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// TRIM SYSTEM — Minimal, clean edge definition
//
// Only renders what's structurally visible:
//   Curved: arc trim at front/back, eave lines
//   Peaked: gable rake, eave lines, ridge line
// No corner trim or base trim boxes (handled by frame)
// ═══════════════════════════════════════════════════════════

function TrimSystem({ grid, roofStyle }) {
  const { l, h, halfW, roofPeak, ovEX, ovEY } = grid;
  const preset = getPreset(roofStyle);
  const ov = preset.eaveOverhangFt * SCALE + grid.overhang;

  // Curved arc trim tubes at front/back
  const arcTrimGeos = useMemo(() => {
    if (!preset.curved) return null;
    const arcHW = halfW + ov;
    const arcRise = roofPeak;
    const arc = computeArcPoints(arcHW, h, arcRise, ARC_SEGMENTS);
    const zF = -l / 2, zB = l / 2;
    const pathF = new THREE.CatmullRomCurve3(
      arc.map(([x, y]) => new THREE.Vector3(x, y, zF)), false, "centripetal"
    );
    const pathB = new THREE.CatmullRomCurve3(
      arc.map(([x, y]) => new THREE.Vector3(x, y, zB)), false, "centripetal"
    );
    return {
      front: new THREE.TubeGeometry(pathF, ARC_SEGMENTS * 2, MAIN_TUBE * 0.5, 8, false),
      back: new THREE.TubeGeometry(pathB, ARC_SEGMENTS * 2, MAIN_TUBE * 0.5, 8, false),
    };
  }, [preset.curved, halfW, h, roofPeak, ov, l]);

  // Peaked roof endpoints
  const leftEaveF = [-halfW - ovEX, h - ovEY, -l / 2];
  const leftEaveB = [-halfW - ovEX, h - ovEY, l / 2];
  const rightEaveF = [halfW + ovEX, h - ovEY, -l / 2];
  const rightEaveB = [halfW + ovEX, h - ovEY, l / 2];
  const ridgeF = [0, h + roofPeak, -l / 2];
  const ridgeB = [0, h + roofPeak, l / 2];

  return (
    <group>
      {preset.curved ? (
        <>
          {/* Curved arc trim at front and back */}
          {arcTrimGeos && (
            <>
              <mesh geometry={arcTrimGeos.front} castShadow>
                <meshStandardMaterial color={TRIM_COLOR} roughness={0.4} metalness={0.6} />
              </mesh>
              <mesh geometry={arcTrimGeos.back} castShadow>
                <meshStandardMaterial color={TRIM_COLOR} roughness={0.4} metalness={0.6} />
              </mesh>
            </>
          )}
          {/* Eave edge tubes (sides) */}
          <SteelTube start={[-halfW - ov, h, -l / 2]} end={[-halfW - ov, h, l / 2]} size={MAIN_TUBE} color={TRIM_COLOR} />
          <SteelTube start={[halfW + ov, h, -l / 2]} end={[halfW + ov, h, l / 2]} size={MAIN_TUBE} color={TRIM_COLOR} />
        </>
      ) : (
        <>
          {/* Gable rake trim */}
          <SteelTube start={leftEaveF} end={ridgeF} size={MAIN_TUBE} color={TRIM_COLOR} />
          <SteelTube start={ridgeF} end={rightEaveF} size={MAIN_TUBE} color={TRIM_COLOR} />
          <SteelTube start={leftEaveB} end={ridgeB} size={MAIN_TUBE} color={TRIM_COLOR} />
          <SteelTube start={ridgeB} end={rightEaveB} size={MAIN_TUBE} color={TRIM_COLOR} />
          {/* Eave edge tubes */}
          <SteelTube start={leftEaveF} end={leftEaveB} size={MAIN_TUBE} color={TRIM_COLOR} />
          <SteelTube start={rightEaveF} end={rightEaveB} size={MAIN_TUBE} color={TRIM_COLOR} />
          {/* Ridge tube */}
          <SteelTube start={ridgeF} end={ridgeB} size={MAIN_TUBE} color={TRIM_COLOR} />
        </>
      )}
    </group>
  );
}

// ─── WALL PANELS ───────────────────────────────────────────

function WallPanels({ grid, walls, highlightedWall, wallColor, twoToneColor, sidingDirection = "vertical", roofStyle = "regular" }) {
  const { w, l, h, halfW, roofPeak, bayCount, bay } = grid;
  const panelColor = wallColor || "#e0e0e0";
  const splitY = h / 2;

  const getColor = (wall) => panelColor;
  const getOpacity = (wall) => 1.0;
  const isHighlight = (wall) => highlightedWall === wall;
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
    const hl = isHighlight(wall);

    // Partial top panel (e.g. "top_1.5", "top_3")
    const topFt = parseTopPanel(wt);
    if (topFt) {
      const panelH = topFt * SCALE;
      const panelY = h - panelH / 2;
      return (
        <SideWallPanel x={x} y={panelY} h={panelH} l={l} color={color} opacity={op} sidingDirection={sidingDirection} />
      );
    }

    if (!twoToneColor || hl) {
      return (
        <SideWallPanel x={x} h={h} l={l} color={color} opacity={op} sidingDirection={sidingDirection} />
      );
    }
    return (
      <group>
        <SideWallPanel x={x} y={splitY + (h - splitY) / 2} h={h - splitY} l={l} color={panelColor} opacity={op} sidingDirection={sidingDirection} />
        <SideWallPanel x={x} y={splitY / 2} h={splitY} l={l} color={twoToneColor} opacity={op} sidingDirection={sidingDirection} />
      </group>
    );
  };

  return (
    <group>
      {wallType("front") && (
        <EndWallMesh w={w} h={h} roofPeak={roofPeak} z={-l / 2} type={wallType("front")} color={getColor("front")} opacity={getOpacity("front")} twoToneColor={isHighlight("front") ? null : twoToneColor} splitY={splitY} sidingDirection={sidingDirection} roofStyle={roofStyle} />
      )}
      {wallType("back") && (
        <EndWallMesh w={w} h={h} roofPeak={roofPeak} z={l / 2} type={wallType("back")} color={getColor("back")} opacity={getOpacity("back")} twoToneColor={isHighlight("back") ? null : twoToneColor} splitY={splitY} sidingDirection={sidingDirection} roofStyle={roofStyle} />
      )}
      {renderSideWall(-halfW, "left")}
      {renderSideWall(halfW, "right")}
      {highlightedWall && <WallHighlightEdge w={w} l={l} h={h} roofPeak={roofPeak} wall={highlightedWall} wallType={wallType(highlightedWall)} />}
    </group>
  );
}

// ─── SIDE WALL PANEL (textured) ────────────────────────────

function SideWallPanel({ x, y, h, l, color, opacity, sidingDirection = "vertical" }) {
  const posY = y != null ? y : h / 2;
  // Offset wall slightly outward from column line so it covers the structure
  const sign = x > 0 ? 1 : -1;
  const wallX = x + sign * (MAIN_TUBE * 0.6);
  const tex = useMemo(() => {
    const t = createPanelTexture(color, sidingDirection, 28);
    if (sidingDirection === "vertical") {
      // Vertical panels: repeat across wall length, tile height to wall height
      t.repeat.set(l / PANEL_WIDTH, h / PANEL_WIDTH);
    } else {
      // Horizontal panels: repeat along height (ribs), tile across length
      t.repeat.set(l / PANEL_WIDTH, h / PANEL_WIDTH);
    }
    return t;
  }, [color, sidingDirection, l, h]);

  return (
    <mesh position={[wallX, posY, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
      <boxGeometry args={[l, h, 0.02]} />
      <meshStandardMaterial map={tex} transparent={opacity < 1} opacity={opacity} roughness={0.6} metalness={0.2} side={2} />
    </mesh>
  );
}

// ─── END WALL MESH (pentagon / gable / two-tone) ───────────

function EndWallMesh({ w, h, roofPeak, z, type, color, opacity, twoToneColor = null, splitY = 0, sidingDirection = "vertical", roofStyle = "regular" }) {
  const isCurved = roofStyle === "regular";
  const halfW = w / 2;
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
  }, [color, sidingDirection, w, h, roofPeak, isTopPanel, topFt, isExtGable, extGableFt]);

  const lowerTex = useMemo(() => {
    if (isTopPanel || isExtGable) return null;
    if (!twoToneColor || type === "gable") return null;
    const t = createPanelTexture(twoToneColor, sidingDirection, 28);
    t.repeat.set(w / PANEL_WIDTH, splitY / PANEL_WIDTH);
    return t;
  }, [twoToneColor, type, sidingDirection, w, splitY, isTopPanel, isExtGable]);

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
    } else if (isCurved) {
      // Curved end wall: rectangle base + arc top (fan triangulation)
      const arc = computeArcPoints(halfW, h, roofPeak, ARC_SEGMENTS);
      const baseY = (type === "gable") ? h : (twoToneColor ? splitY : 0);

      const verts = [];
      const uvArr = [];
      verts.push(-halfW, baseY, wallZ);
      uvArr.push(0, 0);
      verts.push(halfW, baseY, wallZ);
      uvArr.push(1, 0);
      for (let i = 0; i < arc.length; i++) {
        const [ax, ay] = arc[i];
        verts.push(ax, ay, wallZ);
        uvArr.push((ax + halfW) / w, (ay - baseY) / (h + roofPeak - baseY));
      }
      const idx = [];
      const arcStart = 2;
      const arcEnd = arcStart + arc.length - 1;
      for (let i = 0; i < arc.length - 1; i++) {
        idx.push(0, arcStart + i, arcStart + i + 1);
      }
      idx.push(0, arcEnd, 1);

      g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(verts), 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(uvArr), 2));
      g.setIndex(idx);
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
  }, [w, h, roofPeak, wallZ, type, twoToneColor, splitY, isCurved, halfW, isTopPanel, topFt, isExtGable, extGableFt]);

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

function LeanToSystem({ grid, leanto, roofColor, wallColor, siblingLeantos }) {
  const { l, h, halfW, w, bayPositions } = grid;
  const side = leanto.side_key;
  const ltWidthFt = leanto.width_ft || 10;
  const ltOpenings = leanto.openings || { outer: [], left_end: [], right_end: [] };
  const ltHeightFt = leanto.height_ft || (leanto.drop_ft ? ((h / SCALE) - leanto.drop_ft) : 6);
  const isOpen = leanto.render_key !== "enclosed";

  const ltW = ltWidthFt * SCALE;       // lean-to projection (scene units)
  const ltH = ltHeightFt * SCALE;      // lean-to outer leg height (scene units)
  const isSide = side === "left" || side === "right";

  // Lean-to length along the building wall (may be shorter than full wall)
  const maxLen = isSide ? l : w;       // full wall length in scene units
  const ltLenFt = leanto.length_ft;
  const ltLen = ltLenFt ? Math.min(ltLenFt * SCALE, maxLen) : maxLen;

  const attachH = h;                 // lean-to top edge = main eave height (NOT ridge)
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

  // Roof slope
  const drop = attachH - ltH;
  const slopeHyp = Math.sqrt(ltW * ltW + drop * drop);

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

  // Roof texture
  const roofTex = useMemo(() => {
    const tex = createPanelTexture(roofColor, "horizontal", 32);
    const across = Math.max(1, Math.round(attachLen / 1.5));
    const up = Math.max(1, Math.round(slopeHyp / 1.5));
    tex.repeat.set(across, up);
    return tex;
  }, [roofColor, attachLen, slopeHyp]);

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

  // Build roof geometry (single slope quad)
  const roofGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    let pos;
    if (isSide) {
      // Side lean-to: roof slopes in X direction, extends along Z (centered)
      const innerX = sign * halfW + sign * SEAM_OFFSET;
      const outerX = sign * (halfW + ltW);
      const zF = -halfLtLen, zB = halfLtLen;
      pos = new Float32Array([
        innerX, attachH, zF,
        outerX, ltH, zF,
        outerX, ltH, zB,
        innerX, attachH, zB,
      ]);
    } else {
      // End lean-to: roof slopes in Z direction, X extent adjusted for corners
      const eAdjW = Math.min(adjXMax - adjXMin, ltLen);
      const eCenter = (adjXMin + adjXMax) / 2;
      const eMin = eCenter - eAdjW / 2;
      const eMax = eCenter + eAdjW / 2;
      const innerZ = sign * (l / 2) + sign * SEAM_OFFSET;
      const outerZ = sign * (l / 2 + ltW);
      pos = new Float32Array([
        eMin, attachH, innerZ,
        eMin, ltH, outerZ,
        eMax, ltH, outerZ,
        eMax, attachH, innerZ,
      ]);
    }
    const uvs = new Float32Array([0, 1, 0, 0, 1, 0, 1, 1]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    // Winding order for correct normals (facing up/out)
    g.setIndex(sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    return g;
  }, [isSide, sign, halfW, ltW, ltH, attachH, l, adjXMin, adjXMax, halfLtLen, ltLen]);

  return (
    <group>
      {/* Lean-to roof */}
      <mesh geometry={roofGeo} castShadow>
        <meshStandardMaterial map={roofTex} roughness={0.5} metalness={0.3} side={2} />
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

      {/* Lean-to wall openings (doors, windows, vents, frameouts, rollup doors) */}
      {!isOpen && <LeanToOpenings
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
  return <Line points={points} color="#00e5ff" lineWidth={4} depthTest={false} />;
}
