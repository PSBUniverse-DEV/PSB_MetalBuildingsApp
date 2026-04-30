"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Line } from "@react-three/drei";
import { useMemo } from "react";

/**
 * 3D Building Preview
 *
 * Props:
 *   width      - building width (ft)
 *   length     - building length (ft)
 *   height     - leg height (ft)
 *   roofStyle  - "regular" | "aframe" | "vertical" | "garage" | "barn"
 *   walls      - { front: bool, back: bool, left: bool, right: bool }
 *   highlightedWall - "front" | "back" | "left" | "right" | null
 *   roofColor  - hex color for roof
 *   wallColor  - hex color for wall panels
 */
export default function BuildingPreview({ width = 12, length = 20, height = 6, roofStyle = "regular", walls = {}, highlightedWall = null, roofColor = "#cc0000", wallColor = "#e0e0e0" }) {
  // Normalize to scene scale (1 unit = 2 feet)
  const scale = 0.5;
  const w = width * scale;
  const l = length * scale;
  const h = height * scale;
  const roofPeak = getRoofPeak(roofStyle, w);

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 400, background: "#f0f2f5" }}>
      <Canvas camera={{ position: [w * 1.2, h * 1.5, l * 1.0], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <OrbitControls enablePan={false} minDistance={5} maxDistance={60} />
        <BuildingFrame w={w} l={l} h={h} roofPeak={roofPeak} roofStyle={roofStyle} />
        <WallPanels w={w} l={l} h={h} walls={walls} highlightedWall={highlightedWall} wallColor={wallColor} />
        <RoofMesh w={w} l={l} h={h} roofPeak={roofPeak} roofStyle={roofStyle} roofColor={roofColor} />
        <Grid args={[60, 60]} position={[0, 0, 0]} cellColor="#ddd" sectionColor="#bbb" fadeDistance={40} />
      </Canvas>
    </div>
  );
}

function getRoofPeak(style, w) {
  switch (style) {
    case "aframe":
    case "vertical":
    case "garage":
    case "barn":
      return w * 0.25; // peaked roof
    default:
      return w * 0.15; // regular (rounded feel approximated as low peak)
  }
}

// ─── FRAME (structural posts + beams) ──────────────────────

function BuildingFrame({ w, l, h, roofPeak, roofStyle }) {
  const posts = useMemo(() => {
    const pts = [];
    const bayCount = Math.max(2, Math.round(l / 3));
    for (let i = 0; i <= bayCount; i++) {
      const z = -l / 2 + (l / bayCount) * i;
      // Left post
      pts.push({ start: [-w / 2, 0, z], end: [-w / 2, h, z] });
      // Right post
      pts.push({ start: [w / 2, 0, z], end: [w / 2, h, z] });
    }
    return pts;
  }, [w, l, h]);

  // Ridge beam
  const ridgeStart = [0, h + roofPeak, -l / 2];
  const ridgeEnd = [0, h + roofPeak, l / 2];

  // Top eave beams
  const eaveLeftStart = [-w / 2, h, -l / 2];
  const eaveLeftEnd = [-w / 2, h, l / 2];
  const eaveRightStart = [w / 2, h, -l / 2];
  const eaveRightEnd = [w / 2, h, l / 2];

  return (
    <group>
      {/* Posts */}
      {posts.map((p, i) => (
        <Line key={i} points={[p.start, p.end]} color="#555" lineWidth={2} />
      ))}
      {/* Eave beams */}
      <Line points={[eaveLeftStart, eaveLeftEnd]} color="#555" lineWidth={2} />
      <Line points={[eaveRightStart, eaveRightEnd]} color="#555" lineWidth={2} />
      {/* Ridge beam */}
      <Line points={[ridgeStart, ridgeEnd]} color="#333" lineWidth={2.5} />
      {/* Rafter lines at each bay */}
      <Rafters w={w} l={l} h={h} roofPeak={roofPeak} />
    </group>
  );
}

function Rafters({ w, l, h, roofPeak }) {
  const bayCount = Math.max(2, Math.round(l / 3));
  const rafters = [];
  for (let i = 0; i <= bayCount; i++) {
    const z = -l / 2 + (l / bayCount) * i;
    // Left slope
    rafters.push({ points: [[-w / 2, h, z], [0, h + roofPeak, z]] });
    // Right slope
    rafters.push({ points: [[w / 2, h, z], [0, h + roofPeak, z]] });
  }
  return (
    <>
      {rafters.map((r, i) => (
        <Line key={i} points={r.points} color="#666" lineWidth={1.5} />
      ))}
    </>
  );
}

// ─── ROOF MESH (semi-transparent) ──────────────────────────

function RoofMesh({ w, l, h, roofPeak, roofStyle, roofColor }) {
  const color = roofColor || (roofStyle === "barn" ? "#8B4513" : "#cc0000");

  // Explicit vertex positions — no rotation needed
  const leftGeo = useMemo(() => {
    const { BufferGeometry, Float32BufferAttribute } = require("three");
    const geo = new BufferGeometry();
    // 4 corners of left roof panel
    const verts = new Float32Array([
      -w / 2, h, -l / 2,       // 0: left-front eave
      0, h + roofPeak, -l / 2,  // 1: ridge-front
      0, h + roofPeak, l / 2,   // 2: ridge-back
      -w / 2, h, l / 2,        // 3: left-back eave
    ]);
    geo.setAttribute("position", new Float32BufferAttribute(verts, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    return geo;
  }, [w, l, h, roofPeak]);

  const rightGeo = useMemo(() => {
    const { BufferGeometry, Float32BufferAttribute } = require("three");
    const geo = new BufferGeometry();
    const verts = new Float32Array([
      w / 2, h, -l / 2,        // 0: right-front eave
      0, h + roofPeak, -l / 2,  // 1: ridge-front
      0, h + roofPeak, l / 2,   // 2: ridge-back
      w / 2, h, l / 2,         // 3: right-back eave
    ]);
    geo.setAttribute("position", new Float32BufferAttribute(verts, 3));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    geo.computeVertexNormals();
    return geo;
  }, [w, l, h, roofPeak]);

  return (
    <group>
      <mesh geometry={leftGeo}>
        <meshStandardMaterial color={color} transparent opacity={0.7} side={2} />
      </mesh>
      <mesh geometry={rightGeo}>
        <meshStandardMaterial color={color} transparent opacity={0.7} side={2} />
      </mesh>
    </group>
  );
}

// ─── WALL PANELS (shown when enclosed) ─────────────────────

function WallPanels({ w, l, h, walls, highlightedWall, wallColor }) {
  const panelColor = wallColor || "#e0e0e0";
  const opacity = 0.5;
  const highlightColor = "#00e5ff";
  const highlightOpacity = 0.3;

  const getColor = (wall) => highlightedWall === wall ? highlightColor : panelColor;
  const getOpacity = (wall) => highlightedWall === wall ? highlightOpacity : opacity;
  const showWall = (wall) => walls[wall] || highlightedWall === wall;

  return (
    <group>
      {/* Front wall (z = -l/2) */}
      {showWall("front") && (
        <mesh position={[0, h / 2, -l / 2]}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial color={getColor("front")} transparent opacity={getOpacity("front")} side={2} />
        </mesh>
      )}
      {/* Back wall (z = l/2) */}
      {showWall("back") && (
        <mesh position={[0, h / 2, l / 2]}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial color={getColor("back")} transparent opacity={getOpacity("back")} side={2} />
        </mesh>
      )}
      {/* Left wall (x = -w/2) */}
      {showWall("left") && (
        <mesh position={[-w / 2, h / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[l, h]} />
          <meshStandardMaterial color={getColor("left")} transparent opacity={getOpacity("left")} side={2} />
        </mesh>
      )}
      {/* Right wall (x = w/2) */}
      {showWall("right") && (
        <mesh position={[w / 2, h / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[l, h]} />
          <meshStandardMaterial color={getColor("right")} transparent opacity={getOpacity("right")} side={2} />
        </mesh>
      )}
      {/* Highlight outline edges */}
      {highlightedWall && <WallHighlightEdge w={w} l={l} h={h} wall={highlightedWall} />}
    </group>
  );
}

function WallHighlightEdge({ w, l, h, wall }) {
  const points = useMemo(() => {
    switch (wall) {
      case "front":
        return [[-w/2, 0, -l/2], [w/2, 0, -l/2], [w/2, h, -l/2], [-w/2, h, -l/2], [-w/2, 0, -l/2]];
      case "back":
        return [[-w/2, 0, l/2], [w/2, 0, l/2], [w/2, h, l/2], [-w/2, h, l/2], [-w/2, 0, l/2]];
      case "left":
        return [[-w/2, 0, -l/2], [-w/2, 0, l/2], [-w/2, h, l/2], [-w/2, h, -l/2], [-w/2, 0, -l/2]];
      case "right":
        return [[w/2, 0, -l/2], [w/2, 0, l/2], [w/2, h, l/2], [w/2, h, -l/2], [w/2, 0, -l/2]];
      default:
        return [];
    }
  }, [w, l, h, wall]);

  if (points.length === 0) return null;
  return <Line points={points} color="#00e5ff" lineWidth={3} />;
}
