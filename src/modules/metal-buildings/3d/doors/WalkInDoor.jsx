"use client";
// ═══════════════════════════════════════════════════════════
// WalkInDoor — Procedural walk-in door component
// Classic look: brown slab + raised panels + chrome handle + hinges.
// Wall-matched look (wallColor set): ribbed slab using the exact wall siding
// texture so the door reads as part of the wall (reference design).
// The leaf swings open on its hinge edge when `open` (smooth lerp). `flip` is
// set on the interior face so both faces swing as one rigid door.
// Props: width (ow), height (oh) in scene units; optional wallColor/open/flip.
// ═══════════════════════════════════════════════════════════

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import FrameShell from "../shared/FrameShell";
import { createWallRibTexture, WALL_RIB_TILE } from "../shared/wallRibTexture";

const SWING_OPEN_RAD = -1.75; // ≈100° — the leaf swings fully outward

export default function WalkInDoor({ ow, oh, wallColor = null, open = false, flip = false }) {
  const panelPad = ow * 0.12;
  const topPanelH = oh * 0.40;
  const botPanelH = oh * 0.40;
  const innerW = ow - panelPad * 2;

  // Wall-matched mode: ribbed slab with the same texture/pitch as the walls.
  const wallTex = useMemo(() => {
    if (!wallColor) return null;
    const t = createWallRibTexture(wallColor);
    t.repeat.set(1, oh / WALL_RIB_TILE);
    return t;
  }, [wallColor, oh]);

  // Swinging leaf — pivots on the hinge edge. The interior face flips the
  // pivot to the mirrored edge with the same angle so both faces rotate as
  // one rigid door.
  const leafRef = useRef();
  useFrame(() => {
    const g = leafRef.current;
    if (!g) return;
    const target = open ? SWING_OPEN_RAD : 0;
    g.rotation.y += (target - g.rotation.y) * 0.15;
  });
  const pivotX = flip ? ow / 2 : -ow / 2;

  return (
    <group>
      {/* Door frame — stays fixed while the leaf swings. Bronze three-sided
          trim (top + sides, open at the floor) in wall-matched mode, brown
          classic otherwise */}
      <FrameShell ow={ow} oh={oh} color={wallTex ? "#C89B68" : "#6B4226"} openBottom={!!wallTex} />
      {/* Hinges (hinge side) — fixed to the jamb */}
      {[-oh * 0.35, 0, oh * 0.35].map((hy, hi) => (
        <mesh key={`hinge-${hi}`} position={[flip ? ow * 0.46 : -ow * 0.46, hy, 0.05]}>
          <boxGeometry args={[0.025, 0.04, 0.015]} />
          <meshStandardMaterial color="#888" roughness={0.3} metalness={0.7} />
        </mesh>
      ))}
      {/* Swinging leaf — slab + panels + handle */}
      <group position={[pivotX, 0, 0]}>
        <group ref={leafRef}>
          <group position={[-pivotX, 0, 0]}>
            {/* Door slab */}
            <mesh position={[0, 0, 0.02]}>
              <boxGeometry args={[ow, oh, 0.04]} />
              {wallTex
                ? <meshStandardMaterial map={wallTex} roughness={0.6} metalness={0.2} />
                : <meshStandardMaterial color="#B8885A" roughness={0.6} metalness={0.05} />}
            </mesh>
            {/* Raised panels — classic brown look only (would break the ribbed match) */}
            {!wallTex && (
              <>
                <mesh position={[0, oh / 2 - panelPad - topPanelH / 2, 0.045]}>
                  <boxGeometry args={[innerW, topPanelH, 0.008]} />
                  <meshStandardMaterial color="#A07848" roughness={0.65} metalness={0.05} />
                </mesh>
                <mesh position={[0, -oh / 2 + panelPad + botPanelH / 2, 0.045]}>
                  <boxGeometry args={[innerW, botPanelH, 0.008]} />
                  <meshStandardMaterial color="#A07848" roughness={0.65} metalness={0.05} />
                </mesh>
              </>
            )}
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
          </group>
        </group>
      </group>
    </group>
  );
}
