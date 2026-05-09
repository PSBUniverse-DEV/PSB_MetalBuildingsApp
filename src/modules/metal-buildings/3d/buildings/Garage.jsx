"use client";
// ═══════════════════════════════════════════════════════════
// Garage — Fully enclosed building
//
// Default walls: all enclosed
// Supports: rollup doors, walk-in doors, windows, vents
// Future: insulation, interior walls
// ═══════════════════════════════════════════════════════════

export const GARAGE_DEFAULTS = {
  walls: { front: "enclosed", back: "enclosed", left: "enclosed", right: "enclosed" },
  roofStyle: "aframe_vertical",
};

export default function Garage({ config, systems }) {
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
