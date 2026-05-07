"use client";
// ═══════════════════════════════════════════════════════════
// RollupDoor — Procedural rollup/garage door component
// Light gray panel + horizontal ribs + guide rails + handle bar
// Props: width (ow), height (oh) in scene units
// ═══════════════════════════════════════════════════════════

import FrameShell from "../shared/FrameShell";

export default function RollupDoor({ ow, oh }) {
  const ribCount = Math.max(6, Math.round(oh / 0.08));
  const ribH = oh / ribCount;
  const railW = ow * 0.06;

  return (
    <group>
      {/* Base panel */}
      <mesh position={[0, 0, 0.015]}>
        <boxGeometry args={[ow, oh, 0.03]} />
        <meshStandardMaterial color="#C0C0C0" roughness={0.4} metalness={0.35} />
      </mesh>
      {/* Horizontal ribs */}
      {Array.from({ length: ribCount + 1 }, (_, i) => {
        const y = -oh / 2 + ribH * i;
        return (
          <mesh key={`rib-${i}`} position={[0, y, 0.035]}>
            <boxGeometry args={[ow * 0.96, 0.012, 0.015]} />
            <meshStandardMaterial color="#888" roughness={0.35} metalness={0.5} />
          </mesh>
        );
      })}
      {/* Guide rails — left and right */}
      <mesh position={[-ow / 2 + railW / 2, 0, 0.04]}>
        <boxGeometry args={[railW, oh, 0.04]} />
        <meshStandardMaterial color="#555" roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh position={[ow / 2 - railW / 2, 0, 0.04]}>
        <boxGeometry args={[railW, oh, 0.04]} />
        <meshStandardMaterial color="#555" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Bottom bar / handle */}
      <mesh position={[0, -oh / 2 + 0.03, 0.045]}>
        <boxGeometry args={[ow * 0.7, 0.025, 0.02]} />
        <meshStandardMaterial color="#666" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Garage door frame */}
      <FrameShell ow={ow} oh={oh} color="#444" />
    </group>
  );
}
