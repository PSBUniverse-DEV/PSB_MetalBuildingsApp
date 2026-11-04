"use client";
// ═══════════════════════════════════════════════════════════
// FrameShell — Reusable 4-piece metal trim frame
// Used by all opening types (doors, windows, frameouts, vents)
// ═══════════════════════════════════════════════════════════

export const FRAME_T = 0.04;
export const FRAME_D = 0.05;

// `thickness` optionally overrides FRAME_T (e.g. the wider roll-up door
// casing); all other openings keep the default trim width.
export default function FrameShell({ ow, oh, color, depth, thickness, openBottom = false }) {
  const d = depth || FRAME_D;
  const t = thickness || FRAME_T;
  return (
    <group>
      <mesh position={[0, oh / 2 + t / 2, d / 2]}>
        <boxGeometry args={[ow + t * 2, t, d]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
      {!openBottom && (
        <mesh position={[0, -oh / 2 - t / 2, d / 2]}>
          <boxGeometry args={[ow + t * 2, t, d]} />
          <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
        </mesh>
      )}
      <mesh position={[-ow / 2 - t / 2, 0, d / 2]}>
        <boxGeometry args={[t, oh, d]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[ow / 2 + t / 2, 0, d / 2]}>
        <boxGeometry args={[t, oh, d]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
      </mesh>
    </group>
  );
}
