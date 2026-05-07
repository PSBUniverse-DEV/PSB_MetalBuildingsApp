"use client";
// ═══════════════════════════════════════════════════════════
// FrameShell — Reusable 4-piece metal trim frame
// Used by all opening types (doors, windows, frameouts, vents)
// ═══════════════════════════════════════════════════════════

export const FRAME_T = 0.04;
export const FRAME_D = 0.07;

export default function FrameShell({ ow, oh, color, depth }) {
  const d = depth || FRAME_D;
  return (
    <group>
      <mesh position={[0, oh / 2 + FRAME_T / 2, d / 2]}>
        <boxGeometry args={[ow + FRAME_T * 2, FRAME_T, d]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[0, -oh / 2 - FRAME_T / 2, d / 2]}>
        <boxGeometry args={[ow + FRAME_T * 2, FRAME_T, d]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[-ow / 2 - FRAME_T / 2, 0, d / 2]}>
        <boxGeometry args={[FRAME_T, oh, d]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[ow / 2 + FRAME_T / 2, 0, d / 2]}>
        <boxGeometry args={[FRAME_T, oh, d]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
    </group>
  );
}
