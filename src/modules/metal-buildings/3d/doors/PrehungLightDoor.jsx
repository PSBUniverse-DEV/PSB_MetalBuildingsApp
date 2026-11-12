"use client";
// ═══════════════════════════════════════════════════════════
// PrehungLightDoor — White prehung door with a nine-lite upper window
// Reference look: plain lower slab, a 3×3 grid of dark glass panes, brown
// three-sided casing, and a small round metallic knob on the left. The
// glazing and hardware move with the leaf; the hinge edge is concealed.
// Props: width (ow), height (oh) in scene units; optional open/flip.
// ═══════════════════════════════════════════════════════════

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import FrameShell from "../shared/FrameShell";

const SWING_OPEN_RAD = -1.75; // ≈100° outward swing
const SLAB_COLOR = "#FFFFFF";
const FRAME_COLOR = "#9B8260";
const GLASS_COLOR = "#666666";
const KNOB_COLOR = "#E0E0E0";
const ROSETTE_COLOR = "#C8C8C8";

function NineLightGlass({ ow, oh }) {
  const glassWidth = ow * 0.62;
  const glassHeight = oh * 0.43;
  const centerY = oh * 0.185;
  const muntin = ow * 0.025;
  const paneWidth = (glassWidth - muntin * 4) / 3;
  const paneHeight = (glassHeight - muntin * 4) / 3;

  return (
    <group>
      {/* White backing remains visible as the outer sash and eight muntins. */}
      <mesh position={[0, centerY, 0.047]}>
        <boxGeometry args={[glassWidth, glassHeight, 0.014]} />
        <meshStandardMaterial color={SLAB_COLOR} roughness={0.55} metalness={0.15} />
      </mesh>
      {[0, 1, 2].flatMap((row) => (
        [0, 1, 2].map((column) => {
          const x = -glassWidth / 2 + muntin + paneWidth / 2 + column * (paneWidth + muntin);
          const y = centerY + glassHeight / 2 - muntin - paneHeight / 2 - row * (paneHeight + muntin);
          return (
            <mesh key={`glass-${row}-${column}`} position={[x, y, 0.057]}>
              <boxGeometry args={[paneWidth, paneHeight, 0.006]} />
              <meshStandardMaterial color={GLASS_COLOR} roughness={0.24} metalness={0.4} />
            </mesh>
          );
        })
      ))}
    </group>
  );
}

export default function PrehungLightDoor({ ow, oh, open = false, flip = false }) {
  const leafRef = useRef();
  useFrame(() => {
    const leaf = leafRef.current;
    if (!leaf) return;
    const target = open ? SWING_OPEN_RAD : 0;
    leaf.rotation.y += (target - leaf.rotation.y) * 0.15;
  });

  // Exterior: concealed hinge right / knob left. Mirroring these coordinates
  // keeps both faces on the same physical edges after the parent's 180° turn.
  const pivotX = flip ? -ow / 2 : ow / 2;
  const knobX = flip ? ow * 0.41 : -ow * 0.41;
  const knobY = -oh * 0.07;
  const knobRadius = ow * 0.024;

  return (
    <group>
      <FrameShell ow={ow} oh={oh} color={FRAME_COLOR} openBottom />

      <group position={[pivotX, 0, 0]}>
        <group ref={leafRef}>
          <group position={[-pivotX, 0, 0]}>
            {/* Plain slab: no lower panel carving on this variant. */}
            <mesh position={[0, 0, 0.02]}>
              <boxGeometry args={[ow, oh, 0.04]} />
              <meshStandardMaterial color={SLAB_COLOR} roughness={0.55} metalness={0.15} />
            </mesh>
            <NineLightGlass ow={ow} oh={oh} />

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