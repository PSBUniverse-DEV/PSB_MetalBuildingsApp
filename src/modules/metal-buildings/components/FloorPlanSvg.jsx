// ═══════════════════════════════════════════════════════════
// FloorPlanSvg — shared 2D floor-plan drawing (pure SVG).
//
// Used by the Top View overlay (TopViewFloorPlan, screen theme with a
// textured slab) and by the printed Order Form page 3 (print theme with a
// flat slab) so the printed plan always matches the interactive one.
//
// Orientation (idea-room mock): Front at left, Back at right, Left at top,
// Right at bottom — building z maps to SVG x (front → left), building x maps
// to SVG y (left side → top). Wall convention: filled dark band = enclosed
// wall; open walls are thin lines — black dashed on the gable ends
// (Front/Back), white solid on the eave sides (Left/Right). Openings cut
// through the wall: prehung/roll-up doors render as hollow rectangles
// (prehung = short, roll-up = its full wide opening), windows as double
// lines, vents/frame-outs as a single line.
// ═══════════════════════════════════════════════════════════

import { parseOpening } from "../data/openings";

const FP_U = 12;             // SVG units per foot
const FP_ALLOWANCE_FT = 1.5; // slab overhang past the footprint, each side
const FP_WALL_T = 5;         // wall band thickness (~5" at this scale)
const FP_DOOR_T = 4;         // door-rectangle depth on the wall centerline
const FP_FONT = '"Segoe UI", Arial, sans-serif';

// Enclosed = fully clad wall → filled band. Matches the configurators' wall
// values (true / "enclosed"); "gable", "top_N", "ext_gable_N", "open" and
// false draw as open.
export const isEnclosedWall = (v) => v === true || v === "enclosed";

// Wall segments with the opening gaps cut out of [from, to].
function fpSegmentsWithGaps(from, to, gaps) {
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  const segs = [];
  let cursor = from;
  for (const [g0, g1] of sorted) {
    const a = Math.max(from, Math.min(to, g0));
    const b = Math.max(from, Math.min(to, g1));
    if (a > cursor) segs.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < to) segs.push([cursor, to]);
  return segs;
}

/**
 * Pure SVG floor plan of the main building.
 *
 * @param {number} widthFt   building width (feet, x span)
 * @param {number} lengthFt  building length (feet, z span)
 * @param {object} walls     { front, back, left, right } — true / "enclosed"
 *                           draws a filled band, anything else draws open
 * @param {object} openings  wall key → [items] (doorWindowSelections shape)
 * @param {object} [slabBounds] optional { minX, maxX, minZ, maxZ } footprint
 *                           (feet) the slab covers instead of the plain rect
 * @param {string} [slabFill] flat slab fill (print theme)
 * @param {string} [slabTextureUrl] procedural slab texture (screen theme)
 * @param {boolean} [showLabels] render the Front/Back/Left/Right side names
 * @param {string} [innerTransform] transform for the content group (zoom/pan)
 * @param {object} [svgRef] forwarded to the <svg> element
 */
export default function FloorPlanSvg({
  widthFt,
  lengthFt,
  walls = {},
  openings = {},
  slabBounds = null,
  slabFill = "#c4c4be",
  slabTextureUrl = null,
  showLabels = false,
  innerTransform = null,
  svgRef = null,
  className = null,
}) {
  // Feet bounds → SVG units. SVG x = building z (front at left),
  // SVG y = building x (left side at top).
  const z0 = (slabBounds?.minZ ?? -lengthFt / 2) - FP_ALLOWANCE_FT;
  const x0 = (slabBounds?.minX ?? -widthFt / 2) - FP_ALLOWANCE_FT;
  const z1 = (slabBounds?.maxZ ?? lengthFt / 2) + FP_ALLOWANCE_FT;
  const x1 = (slabBounds?.maxX ?? widthFt / 2) + FP_ALLOWANCE_FT;
  const slabW = (z1 - z0) * FP_U;
  const slabH = (x1 - x0) * FP_U;
  // Label margin around the slab — scales with the plan so the composition
  // (slab : margin ratio) always matches the mock.
  const m = Math.max(Math.min(slabW, slabH) * 0.32, 70);
  const mapZ = (v) => (v - z0) * FP_U + m;
  const mapX = (v) => (v - x0) * FP_U + m;
  const vbW = slabW + 2 * m;
  const vbH = slabH + 2 * m;
  const cx = m + slabW / 2;
  const cy = m + slabH / 2;

  // Wall bands of the main building. Local frame per wall: the band runs
  // along +x from its start corner at y = 0 (rotated into place below).
  const wallDefs = [
    { key: "front", x: mapZ(-lengthFt / 2), y: mapX(-widthFt / 2), rot: 90, len: widthFt * FP_U, wallLen: widthFt, mapAlong: mapX, origin: mapX(-widthFt / 2), enclosed: isEnclosedWall(walls.front) },
    { key: "back", x: mapZ(lengthFt / 2), y: mapX(-widthFt / 2), rot: 90, len: widthFt * FP_U, wallLen: widthFt, mapAlong: mapX, origin: mapX(-widthFt / 2), enclosed: isEnclosedWall(walls.back) },
    { key: "left", x: mapZ(-lengthFt / 2), y: mapX(-widthFt / 2), rot: 0, len: lengthFt * FP_U, wallLen: lengthFt, mapAlong: mapZ, origin: mapZ(-lengthFt / 2), enclosed: isEnclosedWall(walls.left) },
    { key: "right", x: mapZ(-lengthFt / 2), y: mapX(widthFt / 2), rot: 0, len: lengthFt * FP_U, wallLen: lengthFt, mapAlong: mapZ, origin: mapZ(-lengthFt / 2), enclosed: isEnclosedWall(walls.right) },
  ].map((wd) => {
    // Openings — same placement math as the 3D WallOpenings (posFt offset
    // or even auto-spacing), converted into wall gap coordinates.
    const items = openings?.[wd.key] || [];
    const parsed = items.map((it) => ({ it, p: parseOpening(it) })).filter((x) => x.p);
    const spacing = wd.wallLen / (parsed.length + 1);
    const gaps = parsed.map(({ it, p }, idx) => {
      const c = it.posFt != null ? Number(it.posFt) : spacing * (idx + 1) - wd.wallLen / 2;
      const half = p.wFt / 2;
      return { type: p.type, g0: wd.mapAlong(c - half) - wd.origin, g1: wd.mapAlong(c + half) - wd.origin };
    });
    // Corner joints: clad bands and the white eave lines own the corners —
    // they overshoot by half the band thickness so the corner squares stay
    // filled. The black dashed gable lines stop at the solid line instead —
    // dashes never pass through it.
    const cornerOs = wd.enclosed || wd.key === "left" || wd.key === "right" ? FP_WALL_T / 2 : 0;
    return { ...wd, gaps, segments: fpSegmentsWithGaps(-cornerOs, wd.len + cornerOs, gaps.map((g) => [g.g0, g.g1])) };
  });

  // Side name label — readable orientation (the top name is upright while
  // the left/right names read along their sides).
  const sideName = (key, x, y, rot, text) => (
    <g key={key} transform={`translate(${x},${y}) rotate(${rot})`} fontFamily={FP_FONT}>
      <text x={0} y={0} textAnchor="middle" dominantBaseline="middle" fontSize={m * 0.15} fontWeight={600} fill="#3a4046">{text}</text>
    </g>
  );

  return (
    <svg
      ref={svgRef}
      width="100%" height="100%"
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ display: "block" }}
    >
      {slabTextureUrl ? (
        <defs>
          <pattern id="fp-slab-tex" patternUnits="userSpaceOnUse" width="180" height="180">
            <image href={slabTextureUrl} width="180" height="180" />
          </pattern>
        </defs>
      ) : null}

      {/* Zoom/pan group — set via innerTransform by the Top View overlay. */}
      <g transform={innerTransform ?? undefined}>
        {/* Installation-surface slab (footprint + allowance) */}
        <rect x={m} y={m} width={slabW} height={slabH} fill={slabTextureUrl ? "url(#fp-slab-tex)" : slabFill} stroke="rgba(0,0,0,0.16)" strokeWidth={1} />

        {/* Walls: filled dark band = enclosed; open walls are thin lines —
            black dashed on the gable ends (Front/Back), white solid on the
            eave sides (Left/Right). Openings cut through — prehung and
            roll-up doors render as hollow rectangles on the wall, windows as
            double lines, vents/frame-outs as a single line. Paint order:
            dashed gable lines first, then the white eave lines (so a dash
            never shows through the solid line), then clad bands. */}
        {[...wallDefs]
          .sort((a, b) => {
            const rank = (wd) => (wd.enclosed ? 2 : wd.key === "left" || wd.key === "right" ? 1 : 0);
            return rank(a) - rank(b);
          })
          .map((wd) => (
            <g key={wd.key} transform={`translate(${wd.x},${wd.y}) rotate(${wd.rot})`}>
              {wd.segments.map(([a, b], i) => (
                wd.enclosed ? (
                  /* Enclosed wall — filled dark band */
                  <rect key={`seg-${i}`} x={a} y={-FP_WALL_T / 2} width={b - a} height={FP_WALL_T} fill="#1c1c1c" />
                ) : wd.key === "front" || wd.key === "back" ? (
                  /* Open gable end — black dashed line */
                  <line key={`seg-${i}`} x1={a} y1={0} x2={b} y2={0} stroke="#1c1c1c" strokeWidth={2.5} strokeDasharray="6 5" />
                ) : (
                  /* Open eave side — thin white solid line */
                  <line key={`seg-${i}`} x1={a} y1={0} x2={b} y2={0} stroke="#ffffff" strokeWidth={2} />
                )
              ))}
              {wd.gaps.map((g, i) => (
                <g key={`gap-${i}`}>
                  {g.type === "door" || g.type === "rollup_door" ? (
                    /* Prehung / roll-up door — hollow rectangle on the wall */
                    <rect x={g.g0} y={-FP_DOOR_T / 2} width={g.g1 - g.g0} height={FP_DOOR_T} fill="#f7f7f7" stroke="#1c1c1c" strokeWidth={1.2} />
                  ) : g.type === "window" ? (
                    <>
                      <line x1={g.g0} y1={-2.6} x2={g.g1} y2={-2.6} stroke="#1c1c1c" strokeWidth={1.2} />
                      <line x1={g.g0} y1={2.6} x2={g.g1} y2={2.6} stroke="#1c1c1c" strokeWidth={1.2} />
                    </>
                  ) : (
                    /* Vent / frame-out */
                    <line x1={g.g0} y1={0} x2={g.g1} y2={0} stroke="#1c1c1c" strokeWidth={1.2} />
                  )}
                </g>
              ))}
            </g>
          ))}

        {/* Side names (mock layout: Front left, Back right, Left top,
            Right bottom), centered in the margin band around the slab. */}
        {showLabels && sideName("sn-top", cx, m - m * 0.45, 0, "Left Side")}
        {showLabels && sideName("sn-bottom", cx, m + slabH + m * 0.45, 0, "Right Side")}
        {showLabels && sideName("sn-left", m - m * 0.45, cy, -90, "Front Side")}
        {showLabels && sideName("sn-right", m + slabW + m * 0.45, cy, 90, "Back Side")}
      </g>
    </svg>
  );
}