"use client";
// ═══════════════════════════════════════════════════════════
// Truss — Open structure with king post truss roof + lattice columns
//
// Structural features:
//   - Lattice/webbed columns (two rails + diagonal webbing)
//   - King post truss roof (top chord + bottom chord + web members)
//   - Visible purlins running along roof length
//   - Ridge cap
//   - Vertical roof panels
//
// Default walls: all open (carport-style)
// Supports: lean-tos, openings on enclosed walls
// ═══════════════════════════════════════════════════════════

export const TRUSS_DEFAULTS = {
  walls: { front: false, back: false, left: false, right: false },
  roofStyle: "truss",
};

export default function Truss({ config, systems }) {
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
