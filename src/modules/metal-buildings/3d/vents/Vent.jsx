"use client";
// ═══════════════════════════════════════════════════════════
// Vent — Procedural louver vent component
// Dark background + angled metal slats + metal frame
// Props: width (ow), height (oh) in scene units
// ═══════════════════════════════════════════════════════════

import FrameShell from "../shared/FrameShell";

export default function Vent({ ow, oh }) {
  const slatCount = Math.max(4, Math.round(oh / 0.06));
  const slatH = oh / slatCount;

  return (
    <group>
      {/* Background — dark behind the louvers */}
      <mesh position={[0, 0, -0.005]}>
        <boxGeometry args={[ow, oh, 0.01]} />
        <meshStandardMaterial color="#333" roughness={0.8} metalness={0} />
      </mesh>
      {/* Louver slats — angled metal strips */}
      {Array.from({ length: slatCount }, (_, i) => {
        const y = -oh / 2 + slatH * (i + 0.5);
        return (
          <mesh key={`slat-${i}`} position={[0, y, 0.015]} rotation={[0.35, 0, 0]}>
            <boxGeometry args={[ow * 0.88, slatH * 0.7, 0.008]} />
            <meshStandardMaterial color="#B0B0B0" roughness={0.35} metalness={0.45} />
          </mesh>
        );
      })}
      {/* Gray metal frame */}
      <FrameShell ow={ow} oh={oh} color="#777" />
    </group>
  );
}
