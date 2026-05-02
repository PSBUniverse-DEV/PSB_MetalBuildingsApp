"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

// ═══════════════════════════════════════════════════════════
// PARAMETRIC METAL BUILDING — RULE-BASED CONSTRUCTION SYSTEM
//
// Every component is derived from a single grid object.
// No freeform geometry. Every mesh answers: "what real part is this?"
//
// Hierarchy:
//   Building
//   ├── Foundation (ConcreteSlab)
//   ├── Frame
//   │   ├── Posts (at each bay line, both sides)
//   │   ├── Eave Beams (top of posts, along length)
//   │   ├── Sill Beams (base perimeter)
//   │   ├── Rafters (at each bay line, eave→ridge, extend with overhang)
//   │   ├── Ridge Beam (along length at peak)
//   │   ├── Purlins (across roof slope, between bays)
//   │   └── Girts (horizontal wall members between posts)
//   ├── Roof
//   │   ├── Panels (uniform strips along length, aligned to structure)
//   │   ├── Seam Lines (joints between panels)
//   │   └── Ridge Cap
//   ├── Trim
//   │   ├── Fascia (3D boards at eave edges)
//   │   ├── Rake (gable slope edges)
//   │   ├── Ridge Trim
//   │   ├── Corner Trim
//   │   └── Base Trim
//   └── Walls
//       ├── Side Wall Panels (one per bay, between posts)
//       └── End Walls (pentagon / gable / two-tone)
// ═══════════════════════════════════════════════════════════

const SCALE = 0.5;            // 1 scene unit = 2 feet
const TUBE = 0.10;            // main steel member cross-section
const STEEL_COLOR = "#3a3a3a";
const TRIM_COLOR = "#1a1a1a";
const BAY_SPACING_FT = 5;     // structural bay spacing (real feet)

// ─── PANEL TEXTURE GENERATOR ──────────────────────────────
// Creates a canvas texture with subtle panel seam lines.
// Direction: "vertical" for walls, "horizontal" for roof panels along length.

function createPanelTexture(baseColor, direction = "vertical", lineSpacing = 24) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Fill base color
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Subtle noise to break the flat plastic look
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.015 + Math.random() * 0.02})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }

  // Panel seam lines
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1.5;
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

        <Frame grid={grid} />
        <RoofSystem grid={grid} roofColor={roofColor} roofStyle={roofStyle} />
        <WallPanels grid={grid} walls={walls} highlightedWall={highlightedWall} wallColor={wallColor} twoToneColor={twoToneColor} />
        <TrimSystem grid={grid} />
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

// ─── STEEL TUBE (reusable structural member) ───────────────

function SteelTube({ start, end, size = TUBE, color = STEEL_COLOR }) {
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

// ─── FRAME (visual mode: corner posts + perimeter beams only) ──

function Frame({ grid }) {
  const { l, h, halfW, roofPeak } = grid;

  const members = useMemo(() => {
    const m = [];
    const zF = -l / 2, zB = l / 2;

    // 4 corner posts
    m.push({ s: [-halfW, 0, zF], e: [-halfW, h, zF] });
    m.push({ s: [halfW, 0, zF], e: [halfW, h, zF] });
    m.push({ s: [-halfW, 0, zB], e: [-halfW, h, zB] });
    m.push({ s: [halfW, 0, zB], e: [halfW, h, zB] });

    // Eave beams (top of posts, along length)
    m.push({ s: [-halfW, h, zF], e: [-halfW, h, zB] });
    m.push({ s: [halfW, h, zF], e: [halfW, h, zB] });

    // Ridge beam
    m.push({ s: [0, h + roofPeak, zF], e: [0, h + roofPeak, zB] });

    // Sill beams (base perimeter)
    m.push({ s: [-halfW, 0, zF], e: [-halfW, 0, zB] });
    m.push({ s: [halfW, 0, zF], e: [halfW, 0, zB] });
    m.push({ s: [-halfW, 0, zF], e: [halfW, 0, zF] });
    m.push({ s: [-halfW, 0, zB], e: [halfW, 0, zB] });

    // Front + back gable rafters (visible edges)
    m.push({ s: [-halfW, h, zF], e: [0, h + roofPeak, zF] });
    m.push({ s: [halfW, h, zF], e: [0, h + roofPeak, zF] });
    m.push({ s: [-halfW, h, zB], e: [0, h + roofPeak, zB] });
    m.push({ s: [halfW, h, zB], e: [0, h + roofPeak, zB] });

    return m;
  }, [l, h, halfW, roofPeak]);

  return (
    <group>
      {members.map((t, i) => <SteelTube key={`m${i}`} start={t.s} end={t.e} />)}
    </group>
  );
}

// ─── ROOF SYSTEM (panels + ridge cap) ──────────────────────

function RoofSystem({ grid, roofColor, roofStyle }) {
  const { w, l, h, halfW, roofPeak, ovEX, ovEY, slopeLen } = grid;
  const color = roofColor || (roofStyle === "barn" ? "#8B4513" : "#cc0000");

  // Canvas texture: horizontal lines = panel seams running along the length
  const roofTex = useMemo(() => {
    const tex = createPanelTexture(color, "horizontal", 32);
    // Repeat: panels run along length, ~3ft panel width mapped across slope
    const panelsAcrossSlope = Math.max(1, Math.round(slopeLen / (1.5))); // ~3ft real
    const panelsAlongLength = Math.max(1, Math.round(l / (1.5)));
    tex.repeat.set(panelsAlongLength, panelsAcrossSlope);
    return tex;
  }, [color, slopeLen, l]);

  // Geometry with UVs for texture mapping
  const leftGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array([
      -halfW - ovEX, h - ovEY, -l / 2,
       0, h + roofPeak, -l / 2,
       0, h + roofPeak, l / 2,
      -halfW - ovEX, h - ovEY, l / 2,
    ]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [halfW, l, h, roofPeak, ovEX, ovEY]);

  const rightGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array([
      halfW + ovEX, h - ovEY, -l / 2,
      0, h + roofPeak, -l / 2,
      0, h + roofPeak, l / 2,
      halfW + ovEX, h - ovEY, l / 2,
    ]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    return g;
  }, [halfW, l, h, roofPeak, ovEX, ovEY]);

  return (
    <group>
      <mesh geometry={leftGeo} castShadow>
        <meshStandardMaterial map={roofTex} roughness={0.5} metalness={0.3} side={2} />
      </mesh>
      <mesh geometry={rightGeo} castShadow>
        <meshStandardMaterial map={roofTex} roughness={0.5} metalness={0.3} side={2} />
      </mesh>
      {/* Ridge cap */}
      <mesh position={[0, h + roofPeak + 0.02, 0]} castShadow>
        <boxGeometry args={[0.15, 0.04, l]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.5} />
      </mesh>
    </group>
  );
}

// ─── TRIM SYSTEM (3D trim pieces + edge lines) ────────────

const TRIM_SIZE = 0.06; // cross-section of trim pieces

function TrimSystem({ grid }) {
  const { w, l, h, halfW, roofPeak, ovEX, ovEY } = grid;

  // Corner trim: 4 vertical 3D boxes at building corners
  const cornerPositions = [
    [-halfW, h / 2, -l / 2],
    [halfW, h / 2, -l / 2],
    [-halfW, h / 2, l / 2],
    [halfW, h / 2, l / 2],
  ];

  // Base trim: 4 horizontal boxes along the bottom perimeter
  const baseTrims = [
    { pos: [0, TRIM_SIZE / 2, -l / 2], args: [w, TRIM_SIZE, TRIM_SIZE] },         // front
    { pos: [0, TRIM_SIZE / 2, l / 2], args: [w, TRIM_SIZE, TRIM_SIZE] },          // back
    { pos: [-halfW, TRIM_SIZE / 2, 0], args: [TRIM_SIZE, TRIM_SIZE, l] },         // left
    { pos: [halfW, TRIM_SIZE / 2, 0], args: [TRIM_SIZE, TRIM_SIZE, l] },          // right
  ];

  // Fascia: 3D boxes along eave edges
  const fasciaH = 0.08;
  const fasciaD = 0.04;
  const leftFasciaPos = [-halfW - ovEX - fasciaD / 2, h - ovEY - fasciaH / 2, 0];
  const rightFasciaPos = [halfW + ovEX + fasciaD / 2, h - ovEY - fasciaH / 2, 0];

  // Gable rake trim endpoints (for Line — hard to do 3D boxes along a slope cleanly)
  const leftEaveF = [-halfW - ovEX, h - ovEY, -l / 2];
  const leftEaveB = [-halfW - ovEX, h - ovEY, l / 2];
  const rightEaveF = [halfW + ovEX, h - ovEY, -l / 2];
  const rightEaveB = [halfW + ovEX, h - ovEY, l / 2];
  const ridgeF = [0, h + roofPeak, -l / 2];
  const ridgeB = [0, h + roofPeak, l / 2];

  return (
    <group>
      {/* Corner trim (3D boxes) */}
      {cornerPositions.map((pos, i) => (
        <mesh key={`ct${i}`} position={pos} castShadow>
          <boxGeometry args={[TRIM_SIZE, h, TRIM_SIZE]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
      {/* Base trim (3D boxes around perimeter) */}
      {baseTrims.map((bt, i) => (
        <mesh key={`bt${i}`} position={bt.pos} castShadow>
          <boxGeometry args={bt.args} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
      {/* Fascia boards at eave edges */}
      <mesh position={leftFasciaPos} castShadow>
        <boxGeometry args={[fasciaD, fasciaH, l]} />
        <meshStandardMaterial color={TRIM_COLOR} roughness={0.5} />
      </mesh>
      <mesh position={rightFasciaPos} castShadow>
        <boxGeometry args={[fasciaD, fasciaH, l]} />
        <meshStandardMaterial color={TRIM_COLOR} roughness={0.5} />
      </mesh>
      {/* Gable rake trim (Lines — slope angle makes 3D boxes impractical) */}
      <Line points={[leftEaveF, ridgeF, rightEaveF]} color={TRIM_COLOR} lineWidth={3} />
      <Line points={[leftEaveB, ridgeB, rightEaveB]} color={TRIM_COLOR} lineWidth={3} />
      {/* Eave trim lines */}
      <Line points={[leftEaveF, leftEaveB]} color={TRIM_COLOR} lineWidth={2.5} />
      <Line points={[rightEaveF, rightEaveB]} color={TRIM_COLOR} lineWidth={2.5} />
      {/* Ridge trim line */}
      <Line points={[ridgeF, ridgeB]} color={TRIM_COLOR} lineWidth={2} />
    </group>
  );
}

// ─── WALL PANELS ───────────────────────────────────────────

function WallPanels({ grid, walls, highlightedWall, wallColor, twoToneColor }) {
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

  // Side wall: single panel with texture-based vertical seams
  const renderSideWall = (x, wall) => {
    const wt = wallType(wall);
    if (!wt) return null;
    const color = getColor(wall);
    const op = getOpacity(wall);
    const hl = isHighlight(wall);

    if (!twoToneColor || hl) {
      return (
        <SideWallPanel x={x} h={h} l={l} color={color} opacity={op} />
      );
    }
    return (
      <group>
        <SideWallPanel x={x} y={splitY + (h - splitY) / 2} h={h - splitY} l={l} color={panelColor} opacity={op} />
        <SideWallPanel x={x} y={splitY / 2} h={splitY} l={l} color={twoToneColor} opacity={op} />
      </group>
    );
  };

  return (
    <group>
      {wallType("front") && (
        <EndWallMesh w={w} h={h} roofPeak={roofPeak} z={-l / 2} type={wallType("front")} color={getColor("front")} opacity={getOpacity("front")} twoToneColor={isHighlight("front") ? null : twoToneColor} splitY={splitY} />
      )}
      {wallType("back") && (
        <EndWallMesh w={w} h={h} roofPeak={roofPeak} z={l / 2} type={wallType("back")} color={getColor("back")} opacity={getOpacity("back")} twoToneColor={isHighlight("back") ? null : twoToneColor} splitY={splitY} />
      )}
      {renderSideWall(-halfW, "left")}
      {renderSideWall(halfW, "right")}
      {highlightedWall && <WallHighlightEdge w={w} l={l} h={h} roofPeak={roofPeak} wall={highlightedWall} wallType={wallType(highlightedWall)} />}
    </group>
  );
}

// ─── SIDE WALL PANEL (textured) ────────────────────────────

function SideWallPanel({ x, y, h, l, color, opacity }) {
  const posY = y != null ? y : h / 2;
  const tex = useMemo(() => {
    const t = createPanelTexture(color, "vertical", 28);
    const panelsAlong = Math.max(1, Math.round(l / 1.5));
    const panelsUp = Math.max(1, Math.round(h / 1.5));
    t.repeat.set(panelsAlong, panelsUp);
    return t;
  }, [color, l, h]);

  return (
    <mesh position={[x, posY, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
      <planeGeometry args={[l, h]} />
      <meshStandardMaterial map={tex} transparent={opacity < 1} opacity={opacity} roughness={0.6} metalness={0.2} side={2} />
    </mesh>
  );
}

// ─── END WALL MESH (pentagon / gable / two-tone) ───────────

function EndWallMesh({ w, h, roofPeak, z, type, color, opacity, twoToneColor = null, splitY = 0 }) {
  // Textures for end walls (vertical panel lines)
  const upperTex = useMemo(() => {
    const t = createPanelTexture(color, "vertical", 28);
    t.repeat.set(Math.max(1, Math.round(w / 1.5)), Math.max(1, Math.round((h + roofPeak) / 1.5)));
    return t;
  }, [color, w, h, roofPeak]);

  const lowerTex = useMemo(() => {
    if (!twoToneColor || type === "gable") return null;
    const t = createPanelTexture(twoToneColor, "vertical", 28);
    t.repeat.set(Math.max(1, Math.round(w / 1.5)), Math.max(1, Math.round(splitY / 1.5)));
    return t;
  }, [twoToneColor, type, w, splitY]);

  const upperGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    if (type === "gable") {
      const verts = new Float32Array([-w / 2, h, z, 0, h + roofPeak, z, w / 2, h, z]);
      const uvs = new Float32Array([0, 0, 0.5, 1, 1, 0]);
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex([0, 1, 2]);
    } else if (twoToneColor) {
      const verts = new Float32Array([
        -w / 2, splitY, z, w / 2, splitY, z, w / 2, h, z, 0, h + roofPeak, z, -w / 2, h, z,
      ]);
      const uvs = new Float32Array([0, 0, 1, 0, 1, 0.6, 0.5, 1, 0, 0.6]);
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4]);
    } else {
      const verts = new Float32Array([
        -w / 2, 0, z, w / 2, 0, z, w / 2, h, z, 0, h + roofPeak, z, -w / 2, h, z,
      ]);
      const uvs = new Float32Array([0, 0, 1, 0, 1, 0.7, 0.5, 1, 0, 0.7]);
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4]);
    }
    g.computeVertexNormals();
    return g;
  }, [w, h, roofPeak, z, type, twoToneColor, splitY]);

  const lowerGeo = useMemo(() => {
    if (!twoToneColor || type === "gable") return null;
    const g = new THREE.BufferGeometry();
    const verts = new Float32Array([-w / 2, 0, z, w / 2, 0, z, w / 2, splitY, z, -w / 2, splitY, z]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [w, z, twoToneColor, type, splitY]);

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
        return <SteelTube key={`ltp${i}`} start={start} end={end} size={TUBE * 0.8} />;
      })}

      {/* Outer eave beam (along top of outer posts) */}
      {isSide ? (
        <SteelTube
          start={[sign * (halfW + ltW), ltH, -halfLtLen]}
          end={[sign * (halfW + ltW), ltH, halfLtLen]}
          size={TUBE * 0.8}
        />
      ) : (
        <SteelTube
          start={[adjXCenter - adjW / 2, ltH, sign * (l / 2 + ltW)]}
          end={[adjXCenter + adjW / 2, ltH, sign * (l / 2 + ltW)]}
          size={TUBE * 0.8}
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
        <mesh position={[sign * (halfW + ltW), TRIM_SIZE / 2, 0]} castShadow>
          <boxGeometry args={[TRIM_SIZE, TRIM_SIZE, ltLen]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.4} metalness={0.3} />
        </mesh>
      ) : (
        <mesh position={[adjXCenter, TRIM_SIZE / 2, sign * (l / 2 + ltW)]} castShadow>
          <boxGeometry args={[adjW, TRIM_SIZE, TRIM_SIZE]} />
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
