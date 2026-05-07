"use client";
// ═══════════════════════════════════════════════════════════
// Frameout — Rough opening (no door/window installed yet)
// Dark void + galvanized J-trim frame
// Props: width (ow), height (oh) in scene units
// ═══════════════════════════════════════════════════════════

import FrameShell from "../shared/FrameShell";

export default function Frameout({ ow, oh }) {
  return (
    <group>
      {/* Dark void background */}
      <mesh position={[0, 0, -0.01]}>
        <boxGeometry args={[ow, oh, 0.02]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} metalness={0} />
      </mesh>
      {/* Galvanized metal J-trim frame */}
      <FrameShell ow={ow} oh={oh} color="#999" />
    </group>
  );
}
