"use client";
// ═══════════════════════════════════════════════════════════
// Carport — Open-sided building with roof only
//
// Variants:
//   roofStyle="regular"          → curved/bow roof
//   roofStyle="aframe"           → A-frame peaked roof
//   roofStyle="aframe_vertical"  → A-frame with vertical roof panels
//
// Default walls: all open (no panels)
// Supports: lean-tos, openings on enclosed walls
// ═══════════════════════════════════════════════════════════

export const CARPORT_DEFAULTS = {
  walls: { front: false, back: false, left: false, right: false },
  roofStyle: "regular",
};

export default function Carport({ config, systems }) {
  const { FrameSystem, RoofSystem, WallPanels, TrimSystem, WallOpenings, LeanToSystem } = systems;
  const {
    grid, roofStyle, roofColor, wallColor, twoToneColor,
    walls, highlightedWall, sidingDirection,
    leantos, openings,
  } = config;

  return (
    <group>
      <FrameSystem grid={grid} roofStyle={roofStyle} walls={walls} />
      <RoofSystem grid={grid} roofColor={roofColor} roofStyle={roofStyle} walls={walls} />
      <WallPanels grid={grid} walls={walls} highlightedWall={highlightedWall} wallColor={wallColor} twoToneColor={twoToneColor} sidingDirection={sidingDirection} roofStyle={roofStyle} />
      <TrimSystem grid={grid} roofStyle={roofStyle} />
      <WallOpenings grid={grid} openings={openings} />
      {leantos.map((lt, i) => (
        <LeanToSystem key={`lt-${i}`} grid={grid} leanto={lt} roofColor={roofColor} wallColor={wallColor} siblingLeantos={leantos} />
      ))}
    </group>
  );
}
