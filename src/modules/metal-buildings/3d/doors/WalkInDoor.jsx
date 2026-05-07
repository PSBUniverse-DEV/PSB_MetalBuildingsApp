"use client";
// ═══════════════════════════════════════════════════════════
// WalkInDoor — Procedural walk-in door component
// Brown slab + two raised panels + chrome handle + hinges
// Props: width (ow), height (oh) in scene units
// ═══════════════════════════════════════════════════════════

import FrameShell from "../shared/FrameShell";

export default function WalkInDoor({ ow, oh }) {
  const panelPad = ow * 0.12;
  const topPanelH = oh * 0.40;
  const botPanelH = oh * 0.40;
  const innerW = ow - panelPad * 2;

  return (
    <group>
      {/* Door slab */}
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[ow, oh, 0.04]} />
        <meshStandardMaterial color="#B8885A" roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Top raised panel */}
      <mesh position={[0, oh / 2 - panelPad - topPanelH / 2, 0.045]}>
        <boxGeometry args={[innerW, topPanelH, 0.008]} />
        <meshStandardMaterial color="#A07848" roughness={0.65} metalness={0.05} />
      </mesh>
      {/* Bottom raised panel */}
      <mesh position={[0, -oh / 2 + panelPad + botPanelH / 2, 0.045]}>
        <boxGeometry args={[innerW, botPanelH, 0.008]} />
        <meshStandardMaterial color="#A07848" roughness={0.65} metalness={0.05} />
      </mesh>
      {/* Handle — chrome lever */}
      <mesh position={[ow * 0.35, 0, 0.06]}>
        <boxGeometry args={[0.02, 0.08, 0.03]} />
        <meshStandardMaterial color="#D0D0D0" roughness={0.15} metalness={0.9} />
      </mesh>
      {/* Handle plate */}
      <mesh position={[ow * 0.35, 0, 0.05]}>
        <boxGeometry args={[0.04, 0.14, 0.008]} />
        <meshStandardMaterial color="#B8B8B8" roughness={0.2} metalness={0.85} />
      </mesh>
      {/* Hinges (left side) */}
      {[-oh * 0.35, 0, oh * 0.35].map((hy, hi) => (
        <mesh key={`hinge-${hi}`} position={[-ow * 0.46, hy, 0.05]}>
          <boxGeometry args={[0.025, 0.04, 0.015]} />
          <meshStandardMaterial color="#888" roughness={0.3} metalness={0.7} />
        </mesh>
      ))}
      {/* Walk-in door frame */}
      <FrameShell ow={ow} oh={oh} color="#6B4226" />
    </group>
  );
}
