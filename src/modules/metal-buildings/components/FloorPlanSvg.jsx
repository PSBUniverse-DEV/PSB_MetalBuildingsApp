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
import { getLeanToStorageDepthFt, isLeanToWithStorage } from "../data/leanToStorage";

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
 * @param {Array}  [leantos] attached lean-tos — { side_key ("left" | "right" |
 *                           "front" | "back"), width_ft (projection),
 *                           length_ft (optional span along the host wall,
 *                           centered), walls: { outer, left_end, right_end },
 *                           openings: { outer, left_end, right_end },
 *                           render_key, storageDepth (storage styles) }
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
  leantos = [],
  slabBounds = null,
  slabFill = "#c4c4be",
  slabTextureUrl = null,
  showLabels = false,
  innerTransform = null,
  svgRef = null,
  className = null,
}) {
  // Feet bounds → SVG units. SVG x = building z (front at left),
  // SVG y = building x (left side at top). Explicit bounds (the interactive
  // Top View) already include attachments; printed plans expand here so
  // lean-tos and their storage walls remain inside the slab and viewBox.
  let minX = slabBounds?.minX ?? -widthFt / 2;
  let maxX = slabBounds?.maxX ?? widthFt / 2;
  let minZ = slabBounds?.minZ ?? -lengthFt / 2;
  let maxZ = slabBounds?.maxZ ?? lengthFt / 2;
  if (!slabBounds) {
    for (const lt of leantos || []) {
      const projection = Math.max(0, Number(lt?.width_ft) || 0);
      if (projection <= 0) continue;
      if (lt.side_key === "left") minX = Math.min(minX, -widthFt / 2 - projection);
      else if (lt.side_key === "right") maxX = Math.max(maxX, widthFt / 2 + projection);
      else if (lt.side_key === "front") minZ = Math.min(minZ, -lengthFt / 2 - projection);
      else if (lt.side_key === "back") maxZ = Math.max(maxZ, lengthFt / 2 + projection);
    }
  }
  const z0 = minZ - FP_ALLOWANCE_FT;
  const x0 = minX - FP_ALLOWANCE_FT;
  const z1 = maxZ + FP_ALLOWANCE_FT;
  const x1 = maxX + FP_ALLOWANCE_FT;
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
    { key: "front", x: mapZ(-lengthFt / 2), y: mapX(-widthFt / 2), rot: 90, len: widthFt * FP_U, wallLen: widthFt, mapAlong: mapX, origin: mapX(-widthFt / 2), lineStyle: "dash", enclosed: isEnclosedWall(walls.front) },
    { key: "back", x: mapZ(lengthFt / 2), y: mapX(-widthFt / 2), rot: 90, len: widthFt * FP_U, wallLen: widthFt, mapAlong: mapX, origin: mapX(-widthFt / 2), lineStyle: "dash", enclosed: isEnclosedWall(walls.back) },
    { key: "left", x: mapZ(-lengthFt / 2), y: mapX(-widthFt / 2), rot: 0, len: lengthFt * FP_U, wallLen: lengthFt, mapAlong: mapZ, origin: mapZ(-lengthFt / 2), lineStyle: "solid", enclosed: isEnclosedWall(walls.left) },
    { key: "right", x: mapZ(-lengthFt / 2), y: mapX(widthFt / 2), rot: 0, len: lengthFt * FP_U, wallLen: lengthFt, mapAlong: mapZ, origin: mapZ(-lengthFt / 2), lineStyle: "solid", enclosed: isEnclosedWall(walls.right) },
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

  // ── Lean-tos ─────────────────────────────────────────────
  // Attached lean-tos drawn as plan walls around their footprint: projection
  // outward from the host wall (width_ft), span along the wall (length_ft,
  // else the full wall, centered — same as the 3D LeanToSystem). Walls render
  // with the main-building conventions (enclosed = filled band; open = thin
  // line — white solid along the eave direction, black dashed along the gable
  // direction) and openings cut through like main walls. The attached edge
  // normally draws no wall (the host wall is there); for storage, just that
  // bay's host segment is clad when the main wall is open, closing the room.
  const ltWalls = (leantos || []).flatMap((lt, i) => {
    const side = lt?.side_key;
    const proj = Math.max(0, Number(lt?.width_ft) || 0);
    if (!side || proj <= 0) return [];
    const isSide = side === "left" || side === "right";
    const maxLenFt = isSide ? lengthFt : widthFt;
    const lenFt = Math.min(Math.max(Number(lt.length_ft) || maxLenFt, 0), maxLenFt);
    if (lenFt <= 0) return [];
    const half = lenFt / 2;

    // One wall in the band renderer's local frame (the band runs along +x
    // from its start corner at y = 0, rotated into place). Opening positions
    // are wall-relative (centered on the wall midpoint; posFt for dragged
    // items) with the same auto-spacing as the main walls.
    const ltWall = (wkey, x, y, rot, wallLenFt, value, lineStyle, items) => {
      const wallLen = wallLenFt * FP_U;
      const parsed = (items || []).map((it) => ({ it, p: parseOpening(it) })).filter((v) => v.p);
      const spacing = wallLenFt / (parsed.length + 1);
      const gaps = parsed.map(({ it, p }, idx) => {
        const c = it.posFt != null ? Number(it.posFt) : spacing * (idx + 1) - wallLenFt / 2;
        const hw = p.wFt / 2;
        return { type: p.type, g0: (wallLenFt / 2 + c - hw) * FP_U, g1: (wallLenFt / 2 + c + hw) * FP_U };
      });
      const enclosed = isEnclosedWall(value);
      const cornerOs = enclosed || lineStyle === "solid" ? FP_WALL_T / 2 : 0;
      return {
        key: `lt-${i}-${wkey}`, x, y, rot, enclosed, lineStyle, gaps,
        segments: fpSegmentsWithGaps(-cornerOs, wallLen + cornerOs, gaps.map((g) => [g.g0, g.g1])),
      };
    };

    const storageStyle = isLeanToWithStorage(lt);
    const storageDepth = getLeanToStorageDepthFt(lt, lenFt);
    const hasStorage = storageDepth > 0;
    const ltW = storageStyle
      ? { outer: "enclosed", left_end: "enclosed", right_end: "enclosed" }
      : lt.walls || {};
    const ltO = lt.openings || {};
    if (isSide) {
      // Side lean-to (left/right): the outer wall runs along the eave
      // direction (z → SVG x), the ends along the gable direction (x → SVG
      // y). left_end = the −z (front) end.
      const yStart = side === "left" ? mapX(-widthFt / 2 - proj) : mapX(widthFt / 2);
      const outerX = side === "left" ? -widthFt / 2 - proj : widthFt / 2 + proj;
      const defs = [
        ltWall("outer", mapZ(-half), mapX(outerX), 0, lenFt, ltW.outer, "solid", ltO.outer),
        ltWall("left_end", mapZ(-half), yStart, 90, proj, ltW.left_end, "dash", ltO.left_end),
        ltWall("right_end", mapZ(half), yStart, 90, proj, ltW.right_end, "dash", ltO.right_end),
      ];
      if (hasStorage) {
        defs.push(ltWall("storage_partition", mapZ(-half + storageDepth), yStart, 90, proj, "enclosed", "dash", []));
        if (!isEnclosedWall(walls?.[side])) {
          defs.push(ltWall("storage_host", mapZ(-half), mapX(side === "left" ? -widthFt / 2 : widthFt / 2), 0, storageDepth, "enclosed", "solid", []));
        }
      }
      return defs;
    }
    // End lean-to (front/back): the outer wall runs along the gable direction
    // (x → SVG y), the ends along the eave direction (z → SVG x).
    // left_end = the −x (left) end.
    const xStart = side === "front" ? mapZ(-lengthFt / 2 - proj) : mapZ(lengthFt / 2);
    const outerZ = side === "front" ? -lengthFt / 2 - proj : lengthFt / 2 + proj;
    const defs = [
      ltWall("outer", mapZ(outerZ), mapX(-half), 90, lenFt, ltW.outer, "dash", ltO.outer),
      ltWall("left_end", xStart, mapX(-half), 0, proj, ltW.left_end, "solid", ltO.left_end),
      ltWall("right_end", xStart, mapX(half), 0, proj, ltW.right_end, "solid", ltO.right_end),
    ];
    if (hasStorage) {
      defs.push(ltWall("storage_partition", xStart, mapX(-half + storageDepth), 0, proj, "enclosed", "solid", []));
      if (!isEnclosedWall(walls?.[side])) {
        defs.push(ltWall("storage_host", mapZ(side === "front" ? -lengthFt / 2 : lengthFt / 2), mapX(-half), 90, storageDepth, "enclosed", "dash", []));
      }
    }
    return defs;
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
        {[...wallDefs, ...ltWalls]
          .sort((a, b) => {
            const rank = (wd) => (wd.enclosed ? 2 : wd.lineStyle === "solid" ? 1 : 0);
            return rank(a) - rank(b);
          })
          .map((wd) => (
            <g key={wd.key} transform={`translate(${wd.x},${wd.y}) rotate(${wd.rot})`}>
              {wd.segments.map(([a, b], i) => (
                wd.enclosed ? (
                  /* Enclosed wall — filled dark band */
                  <rect key={`seg-${i}`} x={a} y={-FP_WALL_T / 2} width={b - a} height={FP_WALL_T} fill="#1c1c1c" />
                ) : wd.lineStyle === "dash" ? (
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
        {showLabels && sideName("sn-top", cx, m - m * 0.20, 0, "Left Side")}
        {showLabels && sideName("sn-bottom", cx, m + slabH + m * 0.20, 0, "Right Side")}
        {showLabels && sideName("sn-left", m - m * 0.20, cy, -90, "Front Side")}
        {showLabels && sideName("sn-right", m + slabW + m * 0.20, cy, 90, "Back Side")}
      </g>
    </svg>
  );
}