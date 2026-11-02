"use client";
// ═══════════════════════════════════════════════════════════
// Frameout — Rough opening (no door/window installed yet)
// Open doorway: the wall's cutout reveals the building interior
// (no fill panel). The J-trim frame + jamb liners use the same
// frame color as the walk-in door so all openings match.
// Props: width (ow), height (oh) in scene units; optional wallColor.
// ═══════════════════════════════════════════════════════════

import FrameShell, { FRAME_D } from "../shared/FrameShell";

const LINER_T = 0.02;        // jamb liner sheet thickness (scene units)

export default function Frameout({ ow, oh, wallColor = null }) {
  // Same frame-color selection as WalkInDoor so the frameout frame always
  // matches the door frames (bronze wall-matched / brown classic).
  const frameColor = wallColor ? "#C89B68" : "#6B4226";
  return (
    <group>
      {/* J-trim frame — top + jambs, open at the floor
          (walk-through rough opening: no threshold bar) */}
      <FrameShell ow={ow} oh={oh} color={frameColor} openBottom />
      {/* Jamb liners — thin returns lining the rough opening so it reads as a
          real doorway with wall depth. Each liner spans z ∈ [0, FRAME_D]; the
          interior copy (rotated 180° by WallOpenings) covers the mirrored
          half, so the two faces never overlap (no z-fighting). */}
      <mesh position={[-ow / 2 + LINER_T / 2, 0, FRAME_D / 2]}>
        <boxGeometry args={[LINER_T, oh, FRAME_D]} />
        <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[ow / 2 - LINER_T / 2, 0, FRAME_D / 2]}>
        <boxGeometry args={[LINER_T, oh, FRAME_D]} />
        <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.5} />
      </mesh>
      <mesh position={[0, oh / 2 - LINER_T / 2, FRAME_D / 2]}>
        <boxGeometry args={[ow - LINER_T * 2, LINER_T, FRAME_D]} />
        <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.5} />
      </mesh>
    </group>
  );
}
