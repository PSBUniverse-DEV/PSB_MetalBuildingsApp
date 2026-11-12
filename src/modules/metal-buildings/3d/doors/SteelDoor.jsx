"use client";
// ═══════════════════════════════════════════════════════════
// SteelDoor — Flush white steel door with a brown three-sided casing
// Reference look: completely plain slab, small round metallic knob on the
// left, and no visible panel carving or exposed hinges. The concealed hinge
// pivot preserves the same outward swing and mirrored interior behavior as
// the other door renderers. Props: ow/oh in scene units; optional open/flip.
// ═══════════════════════════════════════════════════════════

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { FRAME_T, FRAME_D } from "../shared/FrameShell";

const SWING_OPEN_RAD = -1.75; // ≈100° outward swing
const SLAB_COLOR = "#FFFFFF";
const FRAME_COLOR = "#9B8260";
const KNOB_COLOR = "#E0E0E0";
const ROSETTE_COLOR = "#C8C8C8";

function SteelDoorCasing({ ow, oh }) {
  return (
    <group>
      {/* Matte brown header and jambs; open at the floor like the reference. */}
      <mesh position={[0, oh / 2 + FRAME_T / 2, FRAME_D / 2]}>
        <boxGeometry args={[ow + FRAME_T * 2, FRAME_T, FRAME_D]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.68} metalness={0.05} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (ow / 2 + FRAME_T / 2), 0, FRAME_D / 2]}>
          <boxGeometry args={[FRAME_T, oh, FRAME_D]} />
          <meshStandardMaterial color={FRAME_COLOR} roughness={0.68} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

export default function SteelDoor({ ow, oh, open = false, flip = false }) {
  const leafRef = useRef();
  useFrame(() => {
    const leaf = leafRef.current;
    if (!leaf) return;
    const target = open ? SWING_OPEN_RAD : 0;
    leaf.rotation.y += (target - leaf.rotation.y) * 0.15;
  });

  // Exterior: concealed hinge right / knob left. Mirroring these local
  // coordinates keeps both faces on the same physical edges of the doorway.
  const pivotX = flip ? -ow / 2 : ow / 2;
  const knobX = flip ? ow * 0.41 : -ow * 0.41;
  const knobY = -oh * 0.05;
  const knobRadius = ow * 0.024;

  return (
    <group>
      <SteelDoorCasing ow={ow} oh={oh} />

      {/* The entire flush leaf and its hardware swing as one rigid assembly. */}
      <group position={[pivotX, 0, 0]}>
        <group ref={leafRef}>
          <group position={[-pivotX, 0, 0]}>
            <mesh position={[0, 0, 0.02]}>
              <boxGeometry args={[ow, oh, 0.04]} />
              <meshStandardMaterial color={SLAB_COLOR} roughness={0.55} metalness={0.15} />
            </mesh>

            <mesh position={[knobX, knobY, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[knobRadius * 1.25, knobRadius * 1.25, 0.008, 24]} />
              <meshStandardMaterial color={ROSETTE_COLOR} roughness={0.25} metalness={0.75} />
            </mesh>
            <mesh position={[knobX, knobY, 0.083]} scale={[1, 1, 0.8]}>
              <sphereGeometry args={[knobRadius, 24, 16]} />
              <meshStandardMaterial color={KNOB_COLOR} roughness={0.22} metalness={0.8} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
