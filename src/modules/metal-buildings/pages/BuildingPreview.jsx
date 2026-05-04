"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

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

// ─── STYLE PRESETS (rules, not geometry) ──────────────────
// Each style = a set of construction rules. Geometry is derived at render time.
// rafterType: "curved" | "straight"
// roofPanelDir: "horizontal" | "vertical" — panel seam direction on roof
// hasTruss: true = triangular web members inside each portal frame
// hasPurlins: true = secondary members along roof slope between bays
const STYLE_PRESETS = {
  regular:          { curved: true,  kneeBraces: true,  eaveOverhangFt: 0.5, ridgeCap: false, roofPanelDir: "horizontal", hasTruss: false, hasPurlins: false },
  aframe:           { curved: false, kneeBraces: false, eaveOverhangFt: 0,   ridgeCap: false, roofPanelDir: "horizontal", hasTruss: false, hasPurlins: false },
  aframe_vertical:  { curved: false, kneeBraces: false, eaveOverhangFt: 0,   ridgeCap: true,  roofPanelDir: "vertical",   hasTruss: false, hasPurlins: false },
  garage:           { curved: false, kneeBraces: false, eaveOverhangFt: 0,   ridgeCap: true,  roofPanelDir: "horizontal", hasTruss: false, hasPurlins: false },
  barn:             { curved: false, kneeBraces: false, eaveOverhangFt: 0,   ridgeCap: true,  roofPanelDir: "horizontal", hasTruss: false, hasPurlins: false },
};
function getPreset(roofStyle) {
  return STYLE_PRESETS[roofStyle] || STYLE_PRESETS.aframe;
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

  // Very subtle surface variation (not noise — just slight color shifts)
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.008 + Math.random() * 0.012})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  // Panel seam lines — thin, subtle, just enough to read as panels
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = 1;
  if (direction === "vertical") {
    for (let x = lineSpacing; x < size; x += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
  } else {
    for (let y = lineSpacing; y < size; y += lineSpacing) {
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
        <Grid args={[80, 80]} position={[0, -0.01, 0]} cellColor="#ddd" sectionColor="#bbb" fadeDistance={maxDim * 3} />
      </Canvas>
    </div>
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
// Generates points along a circular arc from left eave to right eave.
// The arc rises `rise` units above eave height.

const ARC_SEGMENTS = 24; // smoothness of the curve

function computeArcPoints(halfW, h, rise, segments = ARC_SEGMENTS) {
  // Fit a circular arc: chord = 2*halfW, rise = sagitta
  // Radius R = (halfW^2 + rise^2) / (2 * rise)
  const R = (halfW * halfW + rise * rise) / (2 * rise);
  const centerY = h + rise - R; // center of the arc circle
  // Angle from center to eave: sin(theta) = halfW / R
  const theta = Math.asin(Math.min(halfW / R, 1));

  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = -theta + t * (2 * theta); // sweep from -theta to +theta
    const x = R * Math.sin(angle);
    const y = centerY + R * Math.cos(angle);
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
      m.push({ s: [-halfW, 0, z], e: [-halfW, h, z], t: MAIN_TUBE });
      m.push({ s: [halfW, 0, z], e: [halfW, h, z], t: MAIN_TUBE });

      // Rafters — always visible at edge bays; interior hidden only when fully enclosed
      if (!preset.curved) {
        if (isEdgeBay || !isFullyEnclosed) {
          m.push({ s: [-halfW, h, z], e: [0, h + roofPeak, z], t: MAIN_TUBE });
          m.push({ s: [halfW, h, z], e: [0, h + roofPeak, z], t: MAIN_TUBE });
        }
      }

      // Knee braces — visible on edge bays always; interior only when open
      if (preset.kneeBraces && (isEdgeBay || !isFullyEnclosed)) {
        const bH = h * 0.3;
        const bW = h * 0.2;
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
    if (preset.hasTruss && !preset.curved) {
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
  const ov = preset.eaveOverhangFt * SCALE;
  const hasAnyWall = !!(walls.left || walls.right || walls.front || walls.back);
  // Roof sits above rafters — offset = half the main tube so roof clears frame
  const ROOF_OFFSET = MAIN_TUBE * 0.55;
  // Roof panel thickness (real sheet metal cladding look)
  const ROOF_THICK = 0.03;

  // ─── CURVED ROOF (Regular Carport) ─────────────────────
  const curvedGeo = useMemo(() => {
    if (!preset.curved) return null;
    // Arc sits above bow tubes: wider + raised by ROOF_OFFSET
    const arcHW = halfW + ov;
    const arcRise = roofPeak + (ov > 0 ? ov * 0.3 : 0);
    const baseH = h - (ov > 0 ? ov * 0.15 : 0);
    const arc = computeArcPoints(arcHW, baseH + ROOF_OFFSET, arcRise, ARC_SEGMENTS);
    const zF = -l / 2, zB = l / 2;
    const segs = arc.length - 1;
    const positions = [];
    const uvs = [];
    for (let i = 0; i <= segs; i++) {
      const [x, y] = arc[i];
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
  }, [preset.curved, halfW, h, roofPeak, l, ov, ROOF_OFFSET]);

  const curvedTex = useMemo(() => {
    if (!preset.curved) return null;
    const tex = createPanelTexture(color, "horizontal", 48);
    tex.repeat.set(1, 1);
    return tex;
  }, [preset.curved, color]);

  // ─── PEAKED ROOF (A-Frame, Vertical, Garage, Barn) ─────
  const roofTex = useMemo(() => {
    if (preset.curved) return null;
    const dir = preset.roofPanelDir || "horizontal";
    const tex = createPanelTexture(color, dir, 48);
    tex.repeat.set(1, 1);
    return tex;
  }, [preset.curved, preset.roofPanelDir, color]);

  if (preset.curved) {
    return (
      <group>
        <mesh geometry={curvedGeo} castShadow receiveShadow>
          <meshStandardMaterial map={curvedTex} roughness={0.45} metalness={0.35} side={THREE.FrontSide} />
        </mesh>
      </group>
    );
  }

  // Peaked roof: compute slope angle + midpoint for thick box panels
  const slopeAngle = Math.atan2(roofPeak, halfW);
  const slopeLen2 = Math.sqrt(halfW * halfW + roofPeak * roofPeak);
  const ro = ROOF_OFFSET;

  // Left slope center position
  const leftMidX = -(halfW / 2);
  const leftMidY = h + roofPeak / 2 + ro;
  const leftMidZ = 0;

  // Right slope center position
  const rightMidX = halfW / 2;
  const rightMidY = h + roofPeak / 2 + ro;
  const rightMidZ = 0;

  return (
    <group>
      {/* Left roof slope — thick box, rotated to slope angle */}
      <mesh
        position={[leftMidX, leftMidY, leftMidZ]}
        rotation={[0, 0, slopeAngle]}
        castShadow receiveShadow
      >
        <boxGeometry args={[slopeLen2, ROOF_THICK, l]} />
        <meshStandardMaterial map={roofTex} roughness={0.45} metalness={0.35} />
      </mesh>
      {/* Right roof slope */}
      <mesh
        position={[rightMidX, rightMidY, rightMidZ]}
        rotation={[0, 0, -slopeAngle]}
        castShadow receiveShadow
      >
        <boxGeometry args={[slopeLen2, ROOF_THICK, l]} />
        <meshStandardMaterial map={roofTex} roughness={0.45} metalness={0.35} />
      </mesh>
      {/* Ridge cap */}
      {preset.ridgeCap && (
        <mesh position={[0, h + roofPeak + ro + ROOF_THICK, 0]} castShadow>
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
  const ov = preset.eaveOverhangFt * SCALE;

  // Front/back arc profile for curved styles
  const arcTrimPoints = useMemo(() => {
    if (!preset.curved) return null;
    const arcHW = halfW + ov;
    const arcRise = roofPeak + (ov > 0 ? ov * 0.3 : 0);
    return computeArcPoints(arcHW, h - (ov > 0 ? ov * 0.15 : 0), arcRise, ARC_SEGMENTS);
  }, [preset.curved, halfW, h, roofPeak, ov]);

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
          {/* Curved arc edges at front and back */}
          <Line points={arcTrimPoints.map(([x, y]) => [x, y, -l / 2])} color={TRIM_COLOR} lineWidth={3} />
          <Line points={arcTrimPoints.map(([x, y]) => [x, y, l / 2])} color={TRIM_COLOR} lineWidth={3} />
          {/* Eave edge lines (sides) */}
          <Line points={[[-halfW - ov, h, -l / 2], [-halfW - ov, h, l / 2]]} color={TRIM_COLOR} lineWidth={2} />
          <Line points={[[halfW + ov, h, -l / 2], [halfW + ov, h, l / 2]]} color={TRIM_COLOR} lineWidth={2} />
        </>
      ) : (
        <>
          {/* Gable rake trim */}
          <Line points={[leftEaveF, ridgeF, rightEaveF]} color={TRIM_COLOR} lineWidth={3} />
          <Line points={[leftEaveB, ridgeB, rightEaveB]} color={TRIM_COLOR} lineWidth={3} />
          {/* Eave edge lines */}
          <Line points={[leftEaveF, leftEaveB]} color={TRIM_COLOR} lineWidth={2} />
          <Line points={[rightEaveF, rightEaveB]} color={TRIM_COLOR} lineWidth={2} />
          {/* Ridge line */}
          <Line points={[ridgeF, ridgeB]} color={TRIM_COLOR} lineWidth={1.5} />
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

  // Side wall: single panel with texture-based seams (direction from siding selection)
  const renderSideWall = (x, wall) => {
    const wt = wallType(wall);
    if (!wt) return null;
    const color = getColor(wall);
    const op = getOpacity(wall);
    const hl = isHighlight(wall);

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
    t.repeat.set(1, 1);
    return t;
  }, [color, sidingDirection]);

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

  // Textures for end walls (panel lines follow siding direction)
  const upperTex = useMemo(() => {
    const t = createPanelTexture(color, sidingDirection, 28);
    t.repeat.set(1, 1);
    return t;
  }, [color, sidingDirection]);

  const lowerTex = useMemo(() => {
    if (!twoToneColor || type === "gable") return null;
    const t = createPanelTexture(twoToneColor, sidingDirection, 28);
    t.repeat.set(1, 1);
    return t;
  }, [twoToneColor, type, sidingDirection]);

  const upperGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();

    if (isCurved) {
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
  }, [w, h, roofPeak, wallZ, type, twoToneColor, splitY, isCurved, halfW]);

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
