"use client";
// ═══════════════════════════════════════════════════════════
// PrehungExteriorDoor — White six-panel exterior door
// Fixed reference look: molded/beveled panels, narrow casing and threshold,
// round chrome knob, and three hinges. The leaf swings on its hinge edge;
// `flip` mirrors the interior face so both sides move as one rigid door.
// Props: width (ow), height (oh) in scene units; optional open/flip.
// ═══════════════════════════════════════════════════════════

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import FrameShell from "../shared/FrameShell";

const SWING_OPEN_RAD = -1.75; // ≈100° outward swing
const SLAB_COLOR = "#FFFFFF";
const PANEL_COLOR = "#FFFFFF";
const FRAME_COLOR = "#9B8260";
const KNOB_COLOR = "#D0D0D0";
const ROSETTE_COLOR = "#BDBDBD";
const HINGE_COLOR = "#A8A8A8";

// Panel centers/heights as fractions of the full leaf height. The short top
// pair and two taller pairs below reproduce the six-panel reference layout.
const PANEL_ROWS = [
  { y: 0.34, height: 0.105 },
  { y: 0.10, height: 0.23 },
  { y: -0.22, height: 0.23 },
];

const SLAB_FRONT_Z = 0.04;
const PANEL_DEPTH = 0.01;
const SLAB_FACE_EXTRUDE_SETTINGS = {
  steps: 1,
  depth: PANEL_DEPTH,
  bevelEnabled: false,
  curveSegments: 1,
};

function getPanelLayout(ow, oh) {
  const panelWidth = ow * 0.24;
  const panelX = ow * 0.21;
  return PANEL_ROWS.flatMap((row, rowIndex) => (
    [-1, 1].map((side) => ({
      key: `panel-${rowIndex}-${side}`,
      x: side * panelX,
      y: row.y * oh,
      width: panelWidth,
      height: row.height * oh,
    }))
  ));
}

// Front layer of the leaf with real rectangular cutouts. A solid core sits
// PANEL_DEPTH behind it, so the panel centers are recessed rather than raised.
function CarvedSlabFace({ ow, oh, panels }) {
  const shape = useMemo(() => {
    const slab = new THREE.Shape();
    slab.moveTo(-ow / 2, -oh / 2);
    slab.lineTo(ow / 2, -oh / 2);
    slab.lineTo(ow / 2, oh / 2);
    slab.lineTo(-ow / 2, oh / 2);
    slab.closePath();

    panels.forEach((panel) => {
      const x0 = panel.x - panel.width / 2;
      const x1 = panel.x + panel.width / 2;
      const y0 = panel.y - panel.height / 2;
      const y1 = panel.y + panel.height / 2;
      const hole = new THREE.Path();
      hole.moveTo(x0, y0);
      hole.lineTo(x1, y0);
      hole.lineTo(x1, y1);
      hole.lineTo(x0, y1);
      hole.closePath();
      slab.holes.push(hole);
    });
    return slab;
  }, [ow, oh, panels]);

  return (
    <mesh position={[0, 0, SLAB_FRONT_Z - PANEL_DEPTH]}>
      <extrudeGeometry args={[shape, SLAB_FACE_EXTRUDE_SETTINGS]} />
      <meshStandardMaterial color={SLAB_COLOR} roughness={0.55} metalness={0.15} />
    </mesh>
  );
}

// Four independent trapezoids form the routed bevel. Their separate vertices
// preserve sharp diagonal miter joints and the distinct light/shadow on each
// side of the carving, matching the reference close-up.
function RecessedPanel({ x, y, width, height }) {
  const profileWidth = Math.min(width, height) * 0.09;
  const innerWidth = width - profileWidth * 2;
  const innerHeight = height - profileWidth * 2;

  const bevelGeometry = useMemo(() => {
    const outer = [
      [-width / 2, -height / 2, 0],
      [width / 2, -height / 2, 0],
      [width / 2, height / 2, 0],
      [-width / 2, height / 2, 0],
    ];
    const inner = [
      [-innerWidth / 2, -innerHeight / 2, -PANEL_DEPTH],
      [innerWidth / 2, -innerHeight / 2, -PANEL_DEPTH],
      [innerWidth / 2, innerHeight / 2, -PANEL_DEPTH],
      [-innerWidth / 2, innerHeight / 2, -PANEL_DEPTH],
    ];
    const positions = [];
    const indices = [];

    for (let side = 0; side < 4; side += 1) {
      const next = (side + 1) % 4;
      const base = positions.length / 3;
      const quad = [outer[side], outer[next], inner[next], inner[side]];
      quad.forEach((vertex) => positions.push(...vertex));
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [width, height, innerWidth, innerHeight]);

  return (
    <group position={[x, y, SLAB_FRONT_Z]}>
      <mesh geometry={bevelGeometry}>
        <meshStandardMaterial color={PANEL_COLOR} roughness={0.55} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0, -PANEL_DEPTH + 0.0002]}>
        <planeGeometry args={[innerWidth, innerHeight]} />
        <meshStandardMaterial color={PANEL_COLOR} roughness={0.55} metalness={0.15} />
      </mesh>
    </group>
  );
}

export default function PrehungExteriorDoor({ ow, oh, open = false, flip = false }) {
  const leafRef = useRef();
  useFrame(() => {
    const leaf = leafRef.current;
    if (!leaf) return;
    const target = open ? SWING_OPEN_RAD : 0;
    leaf.rotation.y += (target - leaf.rotation.y) * 0.15;
  });

  // Exterior: hinges right / knob left. Interior: mirrored local coordinates
  // keep the hardware on the same physical edges after the parent's 180° turn.
  const pivotX = flip ? -ow / 2 : ow / 2;
  const hingeX = flip ? -ow * 0.46 : ow * 0.46;
  const knobX = flip ? ow * 0.40 : -ow * 0.40;
  const knobY = -oh * 0.10;
  const knobRadius = ow * 0.024;
  const panels = useMemo(() => getPanelLayout(ow, oh), [ow, oh]);

  return (
    <group>
      {/* Narrow light casing, including the low threshold in the reference. */}
      <FrameShell ow={ow} oh={oh} color={FRAME_COLOR} />

      {/* Fixed hinge barrels on the jamb side. */}
      {[-oh * 0.34, 0, oh * 0.34].map((hy, index) => (
        <mesh key={`hinge-${index}`} position={[hingeX, hy, 0.052]}>
          <boxGeometry args={[0.026, 0.08, 0.018]} />
          <meshStandardMaterial color={HINGE_COLOR} roughness={0.3} metalness={0.75} />
        </mesh>
      ))}

      {/* Swinging leaf: recessed carvings, rosette, and round knob. */}
      <group position={[pivotX, 0, 0]}>
        <group ref={leafRef}>
          <group position={[-pivotX, 0, 0]}>
            {/* Solid core behind the carved front layer and inset panel fields. */}
            <mesh position={[0, 0, (SLAB_FRONT_Z - PANEL_DEPTH) / 2]}>
              <boxGeometry args={[ow, oh, SLAB_FRONT_Z - PANEL_DEPTH]} />
              <meshStandardMaterial color={SLAB_COLOR} roughness={0.55} metalness={0.15} />
            </mesh>
            <CarvedSlabFace ow={ow} oh={oh} panels={panels} />

            {panels.map((panel) => (
              <RecessedPanel
                key={panel.key}
                x={panel.x}
                y={panel.y}
                width={panel.width}
                height={panel.height}
              />
            ))}

            <mesh position={[knobX, knobY, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[knobRadius * 1.3, knobRadius * 1.3, 0.008, 24]} />
              <meshStandardMaterial color={ROSETTE_COLOR} roughness={0.22} metalness={0.85} />
            </mesh>
            <mesh position={[knobX, knobY, 0.083]} scale={[1, 1, 0.8]}>
              <sphereGeometry args={[knobRadius, 24, 16]} />
              <meshStandardMaterial color={KNOB_COLOR} roughness={0.18} metalness={0.9} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
