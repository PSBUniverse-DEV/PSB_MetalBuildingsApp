"use client";
// ═══════════════════════════════════════════════════════════
// Window — Procedural window component
// Sky blue glass + white mullion cross + reflection highlight
// Props: width (ow), height (oh) in scene units
// ═══════════════════════════════════════════════════════════

import FrameShell from "../shared/FrameShell";

export default function Window({ ow, oh }) {
  const mullionT = 0.025;
  const glassZ = 0.025;

  return (
    <group>
      {/* Glass pane — sky blue, semi-transparent */}
      <mesh position={[0, 0, glassZ]}>
        <boxGeometry args={[ow, oh, 0.015]} />
        <meshStandardMaterial color="#A8DBF0" roughness={0.05} metalness={0.15} transparent opacity={0.85} />
      </mesh>
      {/* Reflection highlight (top-left diagonal) */}
      <mesh position={[-ow * 0.2, oh * 0.2, glassZ + 0.009]}>
        <planeGeometry args={[ow * 0.3, oh * 0.3]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.2} roughness={0} metalness={0} />
      </mesh>
      {/* Horizontal mullion bar */}
      <mesh position={[0, 0, glassZ + 0.01]}>
        <boxGeometry args={[ow * 0.92, mullionT, 0.02]} />
        <meshStandardMaterial color="#E8E8E8" roughness={0.25} metalness={0.4} />
      </mesh>
      {/* Vertical mullion bar */}
      <mesh position={[0, 0, glassZ + 0.01]}>
        <boxGeometry args={[mullionT, oh * 0.92, 0.02]} />
        <meshStandardMaterial color="#E8E8E8" roughness={0.25} metalness={0.4} />
      </mesh>
      {/* White aluminum frame */}
      <FrameShell ow={ow} oh={oh} color="#E0E0E0" />
    </group>
  );
}
