"use client";
// ═══════════════════════════════════════════════════════════
// RollupDoor — Procedural rollup/garage door component
// Classic look: light gray panel + horizontal ribs + guide rails + handle bar.
// Wall-matched look (wallColor set): ribbed slab using the exact wall siding
// texture (the texture carries the ribs, so the synthetic rib bars are
// skipped) — the door reads as part of the wall (reference design).
// The panel rolls up toward the top when `open` (smooth lerp) while the frame
// and guide rails stay fixed.
// Props: width (ow), height (oh) in scene units; optional wallColor/open.
// ═══════════════════════════════════════════════════════════

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import FrameShell from "../shared/FrameShell";
import { createWallRibTexture, WALL_RIB_TILE } from "../shared/wallRibTexture";

export default function RollupDoor({ ow, oh, wallColor = null, open = false }) {
  const ribCount = Math.max(6, Math.round(oh / 0.08));
  const ribH = oh / ribCount;
  const railW = ow * 0.06;

  // Wall-matched mode: ribbed slab with the same texture/pitch as the walls.
  const wallTex = useMemo(() => {
    if (!wallColor) return null;
    const t = createWallRibTexture(wallColor);
    t.repeat.set(1, oh / WALL_RIB_TILE);
    return t;
  }, [wallColor, oh]);

  // Rolling leaf — the panel shrinks toward its top edge as it opens, reading
  // like a roll-up curtain coiling above the opening.
  const leafRef = useRef();
  useFrame(() => {
    const g = leafRef.current;
    if (!g) return;
    const target = open ? 0.03 : 1;
    const nextS = g.scale.y + (target - g.scale.y) * 0.15;
    g.scale.y = nextS;
    g.position.y += ((oh / 2) * (1 - nextS) - g.position.y) * 0.15;
  });

  return (
    <group>
      {/* Guide rails — classic look only (fixed tracks); the wall-matched look
          keeps a clean slab + bronze frame (reference design) */}
      {!wallTex && (
        <>
          <mesh position={[-ow / 2 + railW / 2, 0, 0.04]}>
            <boxGeometry args={[railW, oh, 0.04]} />
            <meshStandardMaterial color="#555" roughness={0.3} metalness={0.6} />
          </mesh>
          <mesh position={[ow / 2 - railW / 2, 0, 0.04]}>
            <boxGeometry args={[railW, oh, 0.04]} />
            <meshStandardMaterial color="#555" roughness={0.3} metalness={0.6} />
          </mesh>
        </>
      )}
      {/* Garage door frame — bronze three-sided trim (top + sides, open at the
          floor) in wall-matched mode, dark classic otherwise (stays fixed) */}
      <FrameShell ow={ow} oh={oh} color={wallTex ? "#C89B68" : "#444"} openBottom={!!wallTex} />
      {/* Rolling leaf — panel + ribs + bottom handle bar */}
      <group ref={leafRef}>
        {/* Base panel */}
        <mesh position={[0, 0, 0.015]}>
          <boxGeometry args={[ow, oh, 0.03]} />
          {wallTex
            ? <meshStandardMaterial map={wallTex} roughness={0.5} metalness={0.25} />
            : <meshStandardMaterial color="#C0C0C0" roughness={0.4} metalness={0.35} />}
        </mesh>
        {/* Horizontal ribs — classic look only (the wall texture carries ribs) */}
        {!wallTex && Array.from({ length: ribCount + 1 }, (_, i) => {
          const y = -oh / 2 + ribH * i;
          return (
            <mesh key={`rib-${i}`} position={[0, y, 0.035]}>
              <boxGeometry args={[ow * 0.96, 0.012, 0.015]} />
              <meshStandardMaterial color="#888" roughness={0.35} metalness={0.5} />
            </mesh>
          );
        })}
        {/* Bottom bar / handle */}
        {!wallTex && (
          <mesh position={[0, -oh / 2 + 0.03, 0.045]}>
            <boxGeometry args={[ow * 0.7, 0.025, 0.02]} />
            <meshStandardMaterial color="#666" roughness={0.3} metalness={0.7} />
          </mesh>
        )}
      </group>
    </group>
  );
}
