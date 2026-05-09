// ═══════════════════════════════════════════════════════════
// 3D Components — Barrel export
// Import all modular 3D building components from one place
// ═══════════════════════════════════════════════════════════

export { default as WalkInDoor } from "./doors/WalkInDoor";
export { default as RollupDoor } from "./doors/RollupDoor";
export { default as Window } from "./windows/Window";
export { default as Frameout } from "./openings/Frameout";
export { default as Vent } from "./vents/Vent";
export { default as FrameShell } from "./shared/FrameShell";
export { FRAME_T, FRAME_D } from "./shared/FrameShell";

// Building compositions
export { Carport, CARPORT_DEFAULTS } from "./buildings";
export { Garage, GARAGE_DEFAULTS } from "./buildings";
export { Barn, BARN_DEFAULTS } from "./buildings";
export { Truss, TRUSS_DEFAULTS } from "./buildings";
