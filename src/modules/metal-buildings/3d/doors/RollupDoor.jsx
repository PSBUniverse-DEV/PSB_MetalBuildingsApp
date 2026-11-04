"use client";
// ═══════════════════════════════════════════════════════════
// RollupDoor — Procedural rollup/garage door component
// Fixed "Bright White" reference look on any wall: white slat curtain
// (fine horizontal slats via createRollupSlatTexture — ~4in pitch with
// soft shadow grooves), a light-gray 3-sided casing (header + jambs to
// the floor), slim light guide rails and a light bottom bar. The panel
// rolls up toward the top when `open` (smooth lerp) while the frame and
// guide rails stay fixed. `wallColor` is accepted for API compatibility
// (Opening3D always passes it) but intentionally unused — the roll-up
// door keeps its white look regardless of the wall color.
// Props: width (ow), height (oh) in scene units; optional wallColor/open.
// ═══════════════════════════════════════════════════════════

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import FrameShell from "../shared/FrameShell";
import { createRollupSlatTexture, ROLLUP_SLAT_TILE } from "../shared/wallRibTexture";

// Reference palette (attached design)
const CURTAIN_COLOR = "#F5F5F5";    // Bright White slat curtain
const FRAME_COLOR = "#E9E9E9";      // light-gray casing trim
const RAIL_COLOR = "#D0D0D0";       // slim guide rails
const BOTTOM_BAR_COLOR = "#CFCFCF"; // bottom seal bar
const FRAME_T_ROLLUP = 0.05;        // wider casing (~3.5in) per reference

export default function RollupDoor({ ow, oh, wallColor = null, open = false }) {
  const railW = ow * 0.032;

  // Slat curtain texture — fine horizontal slats at a fixed real-world pitch.
  const slatTex = useMemo(() => {
    const t = createRollupSlatTexture(CURTAIN_COLOR);
    t.repeat.set(1, oh / ROLLUP_SLAT_TILE);
    return t;
  }, [oh]);

  // Rolling leaf — the panel shrinks toward its top edge as it opens, reading
  // like a roll-up curtain coiling above the opening.
  const leafRef = useRef();
  useFrame(() => {
    const g = leafRef.current;
    if (!g) return;
    const target = open ? 0.03 : 1;
    const nextS = g.scale.y + (target - g.scale.y) * 0.10;
    g.scale.y = nextS;
    g.position.y += ((oh / 2) * (1 - nextS) - g.position.y) * 0.15;
  });

  return (
    <group>
      {/* Guide rails — slim light tracks at the jamb lines (stays fixed) */}
      <mesh position={[-ow / 2 + railW / 2, 0, 0.04]}>
        <boxGeometry args={[railW, oh, 0.04]} />
        <meshStandardMaterial color={RAIL_COLOR} roughness={0.4} metalness={0.25} />
      </mesh>
      <mesh position={[ow / 2 - railW / 2, 0, 0.04]}>
        <boxGeometry args={[railW, oh, 0.04]} />
        <meshStandardMaterial color={RAIL_COLOR} roughness={0.4} metalness={0.25} />
      </mesh>
      {/* Door frame — light-gray casing (header + jambs, open at the floor) */}
      <FrameShell ow={ow} oh={oh} color={FRAME_COLOR} thickness={FRAME_T_ROLLUP} openBottom />
      {/* Rolling leaf — slat curtain + bottom bar */}
      <group ref={leafRef}>
        {/* Curtain — white slat texture (rolls up with the leaf) */}
        <mesh position={[0, 0, 0.015]}>
          <boxGeometry args={[ow, oh, 0.03]} />
          <meshStandardMaterial map={slatTex} roughness={0.5} metalness={0.15} />
        </mesh>
        {/* Bottom bar / seal */}
        <mesh position={[0, -oh / 2 + 0.035, 0.045]}>
          <boxGeometry args={[ow * 0.96, 0.045, 0.02]} />
          <meshStandardMaterial color={BOTTOM_BAR_COLOR} roughness={0.4} metalness={0.3} />
        </mesh>
      </group>
    </group>
  );
}
