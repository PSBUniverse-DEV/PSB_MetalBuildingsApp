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

import { useId } from "react";
import { parseOpening } from "../data/openings";
import { getLeanToStorageDepthFt, isLeanToWithStorage } from "../data/leanToStorage";

const FP_U = 12;             // SVG units per foot
const FP_ALLOWANCE_FT = 1.5; // slab overhang past the footprint, each side
const FP_WALL_T = 5;         // wall band thickness (~5" at this scale)
const FP_DOOR_T = 4;         // door-rectangle depth on the wall centerline
const FP_FONT = '"Segoe UI", Arial, sans-serif';
const FP_LABEL_PAD_M = 0.12;  // side-label distance from slab edge (fraction of margin m)
const FP_LABEL_FONT_M = 0.11; // side-label font size (fraction of margin m)

// Drafting (print) style — feet-inches dimension text: 30 → 30', 10.5 → 10'-6".
const fmtFtIn = (ft) => {
  const totalIn = Math.round(Number(ft) * 12);
  const f = Math.floor(totalIn / 12);
  const i = totalIn % 12;
  return i ? `${f}'-${i}"` : `${f}'`;
};

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
 * @param {string} [watermarkUrl] logo drawn faded/gray in the margin on all
 *                           four sides (Top View only; print passes none)
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
  watermarkUrl = null,
  innerTransform = null,
  svgRef = null,
  className = null,
  // Print/drafting style (Order Form page 3): white sheet + 1' grid, heavy
  // closed walls, dashed open walls, architectural dimension strings, side
  // labels, scale key and a centred watermark. Top View leaves this off.
  drafting = false,
  // Drafting only: how the sheet sits in its box — print pins it to the top,
  // the interactive Top View centres it ("xMidYMid meet").
  fit = "xMidYMin meet",
  // Drafting only: skip the "□ = 1'-0"" scale key (Top View shows it in its legend).
  hideScaleKey = false,
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
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
  // Drafting draws the building outline itself (no slab allowance).
  const allowance = drafting ? 0 : FP_ALLOWANCE_FT;
  const z0 = minZ - allowance;
  const x0 = minX - allowance;
  const z1 = maxZ + allowance;
  const x1 = maxX + allowance;
  const slabW = (z1 - z0) * FP_U;
  const slabH = (x1 - x0) * FP_U;
  // Drafting annotation scale: text/dimension sizes grow with the plan so
  // they print at a constant size whatever the building size.
  const k = drafting ? Math.max(slabW, slabH) / 420 : 1;
  // Label margin around the slab — scales with the plan so the composition
  // (slab : margin ratio) always matches the mock. Drafting reserves room
  // for two dimension strings + side labels.
  const m = drafting ? 150 * k : Math.max(Math.min(slabW, slabH) * 0.32, 70);
  // Wall band thickness (heavier object line in print for large plans).
  const WT = drafting ? Math.max(FP_WALL_T, 4.5 * k) : FP_WALL_T;
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
      return { type: p.type, name: it.name, wFt: p.wFt, hFt: p.hFt, g0: wd.mapAlong(c - half) - wd.origin, g1: wd.mapAlong(c + half) - wd.origin };
    });
    // Corner joints: clad bands and the white eave lines own the corners —
    // they overshoot by half the band thickness so the corner squares stay
    // filled. The black dashed gable lines stop at the solid line instead —
    // dashes never pass through it.
    const cornerOs = wd.enclosed || wd.key === "left" || wd.key === "right" ? WT / 2 : 0;
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
    // End (front/back) lean-tos span the full end wall — same as the 3D LeanToSystem.
    const lenFt = isSide ? Math.min(Math.max(Number(lt.length_ft) || maxLenFt, 0), maxLenFt) : maxLenFt;
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
        return { type: p.type, name: it.name, wFt: p.wFt, hFt: p.hFt, g0: (wallLenFt / 2 + c - hw) * FP_U, g1: (wallLenFt / 2 + c + hw) * FP_U };
      });
      const enclosed = isEnclosedWall(value);
      const cornerOs = enclosed || lineStyle === "solid" ? WT / 2 : 0;
      return {
        key: `lt-${i}-${wkey}`, x, y, rot, len: wallLen, enclosed, lineStyle, gaps,
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
        defs.push(ltWall("storage_partition", mapZ(-half + storageDepth), yStart, 90, proj, "enclosed", "dash", ltO.storage_partition));
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
      defs.push(ltWall("storage_partition", xStart, mapX(-half + storageDepth), 0, proj, "enclosed", "solid", ltO.storage_partition));
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
      <text x={0} y={0} textAnchor="middle" dominantBaseline="middle" fontSize={m * FP_LABEL_FONT_M} fontWeight={600} fill="#3a4046">{text}</text>
    </g>
  );

  // ── DRAFTING (print) RENDER ─────────────────────────────
  // Conventions: heavy object lines (walls), thin dimension/extension lines,
  // extension lines gapped from the object and run past the dimension line,
  // 45° tick terminators, text above the line (vertical text reads from the
  // right), chain dimensions nearest the building and the overall string
  // outermost; scale key + legend explain the symbols.
  if (drafting) {
    const L = lengthFt;
    const W = widthFt;
    const r3 = (v) => Math.round(v * 1000) / 1000;

    // Footprint rectangles (feet) — main building + each lean-to — for the
    // grid clip, plus the dimension break points in each direction.
    const rects = [{ x0: -W / 2, x1: W / 2, z0: -L / 2, z1: L / 2 }];
    // Lean-to storage rooms: { edge, horiz, pts (feet along the string), label (feet center) }
    const storageRuns = [];
    const xBreaks = new Set([r3(minX), r3(maxX), r3(-W / 2), r3(W / 2)]);
    const zBreaks = new Set([r3(minZ), r3(maxZ), r3(-L / 2), r3(L / 2)]);
    for (const lt of leantos || []) {
      const side = lt?.side_key;
      const proj = Math.max(0, Number(lt?.width_ft) || 0);
      if (!side || proj <= 0) continue;
      const maxLen = side === "left" || side === "right" ? L : W;
      const half = Math.min(Math.max(Number(lt.length_ft) || maxLen, 0), maxLen) / 2;
      if (side === "left") rects.push({ x0: -W / 2 - proj, x1: -W / 2, z0: -half, z1: half });
      else if (side === "right") rects.push({ x0: W / 2, x1: W / 2 + proj, z0: -half, z1: half });
      else if (side === "front") rects.push({ x0: -half, x1: half, z0: -L / 2 - proj, z1: -L / 2 });
      else if (side === "back") rects.push({ x0: -half, x1: half, z0: L / 2, z1: L / 2 + proj });

      // Storage depth (same value the partition is drawn at).
      const sDepth = getLeanToStorageDepthFt(lt, half * 2);
      if (sDepth > 0) {
        const pts = [-half, -half + sDepth, half];
        const mid = -half + sDepth / 2;
        if (side === "left") storageRuns.push({ edge: "top", horiz: true, pts, label: { z: mid, x: -W / 2 - proj / 2 } });
        else if (side === "right") storageRuns.push({ edge: "bottom", horiz: true, pts, label: { z: mid, x: W / 2 + proj / 2 } });
        else if (side === "front") storageRuns.push({ edge: "left", horiz: false, pts, label: { z: -L / 2 - proj / 2, x: mid } });
        else if (side === "back") storageRuns.push({ edge: "right", horiz: false, pts, label: { z: L / 2 + proj / 2, x: mid } });
      }
    }
    const chain = (set) => {
      const s = [...set].sort((a, b) => a - b);
      return s.slice(1).map((v, i) => [s[i], v]);
    };
    const xChain = chain(xBreaks); // along the width  → SVG y (right-side string)
    const zChain = chain(zBreaks); // along the length → SVG x (bottom string)

    const left = mapZ(minZ), right = mapZ(maxZ), top = mapX(minX), bottom = mapX(maxX);
    const pcx = (left + right) / 2, pcy = (top + bottom) / 2;
    const S = {
      thin: 0.8 * k, ext: 0.6 * k, tick: 7 * k, gap: 4 * k, over: 5 * k,
      text: 11 * k, label: 15 * k, d1: 30 * k, step: 22 * k,
    };
    const INK = "#1c1c1c";

    // ── Opening tags, schedule and per-wall locating strings ──
    // Tags: D (walk-in / roll-up door), W (window), V (vent), F (frame-out).
    // A wall on the plan's outside edge with openings gets a locating string
    // (wall start → opening edges → wall end) at the first dimension level.
    const TAG = { door: "D", rollup_door: "D", window: "W", vent: "V", frameout: "F" };
    const counters = {};
    const near = (a, b) => Math.abs(a - b) < 1;
    const openingRuns = []; // { side, line, start, pts } (SVG units)
    const tags = [];        // { x, y, text }
    const schedule = [];    // { tag, name, wFt, hFt }
    for (const wd of [...wallDefs, ...ltWalls]) {
      if (!wd.gaps?.length || !wd.len) continue;
      const horiz = wd.rot === 0; // wall runs along SVG x
      const line = horiz ? wd.y : wd.x;
      const start = horiz ? wd.x : wd.y;
      const side = horiz
        ? (near(line, top) ? "top" : near(line, bottom) ? "bottom" : null)
        : (near(line, left) ? "left" : near(line, right) ? "right" : null);
      const outDir = side
        ? (side === "top" || side === "left" ? -1 : 1)
        : ((horiz ? line < pcy : line < pcx) ? -1 : 1);
      const sorted = [...wd.gaps].sort((a, b) => a.g0 - b.g0);
      for (const g of sorted) {
        const prefix = TAG[g.type] ?? "O";
        counters[prefix] = (counters[prefix] || 0) + 1;
        const tag = `${prefix}${counters[prefix]}`;
        const mid = start + (g.g0 + g.g1) / 2;
        const off = outDir * 12 * k;
        tags.push(horiz ? { x: mid, y: line + off, text: tag } : { x: line + off, y: mid, text: tag });
        schedule.push({ tag, name: g.name, wFt: g.wFt, hFt: g.hFt });
      }
      if (side) {
        const pts = [0, ...sorted.flatMap((g) => [g.g0, g.g1]), wd.len]
          .map((v) => Math.min(wd.len, Math.max(0, v)));
        openingRuns.push({ side, line, start, pts });
      }
    }
    const hasRun = (s) => openingRuns.some((r) => r.side === s);
    const hasStorage = (s) => storageRuns.some((r) => r.edge === s);
    // Extra levels on a side: opening locating string, then storage string.
    const sideLevels = (s) => (hasRun(s) ? 1 : 0) + (hasStorage(s) ? 1 : 0);
    // Distance of the storage string from its edge (after any opening string).
    const storageAt = (s) => S.d1 + (hasRun(s) ? S.step : 0);

    // Building dimension strings — further out by the levels used on that
    // side (overall always outermost).
    const vX1 = right + S.d1 + sideLevels("right") * S.step;
    const vX2 = vX1 + S.step;
    const hY1 = bottom + S.d1 + sideLevels("bottom") * S.step;
    const hY2 = hY1 + S.step;
    const vOuter = xChain.length > 1 ? vX2 : vX1;
    const hOuter = zChain.length > 1 ? hY2 : hY1;
    const topOuter = top - (sideLevels("top") ? S.d1 + (sideLevels("top") - 1) * S.step : 0);
    const leftOuter = left - (sideLevels("left") ? S.d1 + (sideLevels("left") - 1) * S.step : 0);

    const tick = (x, y, key) => (
      <line key={key} x1={x - S.tick / 2} y1={y + S.tick / 2} x2={x + S.tick / 2} y2={y - S.tick / 2} stroke={INK} strokeWidth={S.thin * 1.6} />
    );
    const dimV = ([a, b], x, key) => {
      const y0 = mapX(a), y1 = mapX(b);
      return (
        <g key={key}>
          <line x1={x} y1={y0} x2={x} y2={y1} stroke="#333333" strokeWidth={S.thin} />
          {tick(x, y0, "t0")}{tick(x, y1, "t1")}
          <text transform={`translate(${x - S.gap},${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle"
            fontSize={S.text} fill="#222222" fontFamily={FP_FONT}>{fmtFtIn(b - a)}</text>
        </g>
      );
    };
    const dimH = ([a, b], y, key) => {
      const xa = mapZ(a), xb = mapZ(b);
      return (
        <g key={key}>
          <line x1={xa} y1={y} x2={xb} y2={y} stroke="#333333" strokeWidth={S.thin} />
          {tick(xa, y, "t0")}{tick(xb, y, "t1")}
          <text x={(xa + xb) / 2} y={y - S.gap} textAnchor="middle"
            fontSize={S.text} fill="#222222" fontFamily={FP_FONT}>{fmtFtIn(b - a)}</text>
        </g>
      );
    };

    // Grid (1' squares, darker every 10') clipped to the footprint
    const gridLines = [];
    const spanZ = maxZ - minZ, spanX = maxX - minX;
    for (let f = 0; f <= Math.ceil(spanZ); f++) {
      const x = mapZ(Math.min(minZ + f, maxZ));
      gridLines.push(<line key={`gz${f}`} x1={x} y1={top} x2={x} y2={bottom} stroke={f % 10 === 0 ? "#8f8f8f" : "#cfcfcf"} strokeWidth={f % 10 === 0 ? 0.9 : 0.5} />);
    }
    for (let f = 0; f <= Math.ceil(spanX); f++) {
      const y = mapX(Math.min(minX + f, maxX));
      gridLines.push(<line key={`gx${f}`} x1={left} y1={y} x2={right} y2={y} stroke={f % 10 === 0 ? "#8f8f8f" : "#cfcfcf"} strokeWidth={f % 10 === 0 ? 0.9 : 0.5} />);
    }

    const label = (key, x, y, rot, text) => (
      <text key={key} transform={`translate(${x},${y}) rotate(${rot})`} textAnchor="middle" dominantBaseline="middle"
        fontSize={S.label} fontWeight={500} fill="#222222" fontFamily={FP_FONT} letterSpacing={0.5 * k}>{text}</text>
    );

    const wmW = Math.min(right - left, bottom - top) * 0.75;
    const clipId = `fp-clip-${uid}`;
    const grayId = `fp-gray-${uid}`;

    // Tight viewBox around what is drawn (no blank bands), pinned to the top.
    // Footer row sits well below RIGHT SIDE: scale key (left) + openings
    // schedule (right, small type). Drawing coordinates are unchanged.
    const SCHED_TITLE = S.text * 0.78;
    const SCHED_TEXT = S.text * 0.68;
    const LINE_H = 10.5 * k;
    const footY = hOuter + 80 * k;                      // footer first baseline
    const footRows = schedule.length ? schedule.length + 1 : 1;
    const vbX0 = leftOuter - 72 * k;
    const vbY0 = topOuter - 62 * k;
    const vbX1 = vOuter + 56 * k;
    const vbY1 = footY + (footRows - 1) * LINE_H + 12 * k;
    const vbWd = vbX1 - vbX0;
    const vbHd = vbY1 - vbY0;

    return (
      <svg ref={svgRef} width="100%" height="100%" viewBox={`${vbX0} ${vbY0} ${vbWd} ${vbHd}`}
        preserveAspectRatio={fit} className={className} style={{ display: "block" }}>
        <defs>
          <clipPath id={clipId}>
            {rects.map((r, i) => (
              <rect key={i} x={mapZ(r.z0)} y={mapX(r.x0)} width={(r.z1 - r.z0) * FP_U} height={(r.x1 - r.x0) * FP_U} />
            ))}
          </clipPath>
          <filter id={grayId}><feColorMatrix type="saturate" values="0" /></filter>
        </defs>
        {/* Zoom/pan group — set via innerTransform by the Top View overlay (print: none). */}
        <g transform={innerTransform ?? undefined}>
        <rect x={vbX0} y={vbY0} width={vbWd} height={vbHd} fill="#ffffff" />

        {/* 1' grid inside the footprint */}
        <g clipPath={`url(#${clipId})`}>{gridLines}</g>

        {/* Watermark (faded grey logo, centred) */}
        {watermarkUrl ? (
          <image href={watermarkUrl} x={pcx - wmW / 2} y={pcy - wmW * 0.25} width={wmW} height={wmW * 0.5}
            preserveAspectRatio="xMidYMid meet" opacity={0.16} filter={`url(#${grayId})`} />
        ) : null}

        {/* Walls — closed: heavy band; open: dashed line; openings cut through */}
        {[...wallDefs, ...ltWalls]
          .sort((a, b) => (a.enclosed ? 1 : 0) - (b.enclosed ? 1 : 0))
          .map((wd) => (
            <g key={wd.key} transform={`translate(${wd.x},${wd.y}) rotate(${wd.rot})`}>
              {wd.segments.map(([a, b], i) => (
                wd.enclosed ? (
                  <rect key={`seg-${i}`} x={a} y={-WT / 2} width={b - a} height={WT} fill={INK} />
                ) : (
                  <line key={`seg-${i}`} x1={a} y1={0} x2={b} y2={0} stroke={INK} strokeWidth={1.8 * k} strokeDasharray={`${3 * k} ${2.5 * k}`} />
                )
              ))}
              {wd.gaps.map((g, i) => (
                <g key={`gap-${i}`}>
                  {g.type === "door" || g.type === "rollup_door" ? (
                    <rect x={g.g0} y={-FP_DOOR_T / 2} width={g.g1 - g.g0} height={FP_DOOR_T} fill="#ffffff" stroke={INK} strokeWidth={1.2} />
                  ) : g.type === "window" ? (
                    <>
                      <line x1={g.g0} y1={-2.6} x2={g.g1} y2={-2.6} stroke={INK} strokeWidth={1.2} />
                      <line x1={g.g0} y1={2.6} x2={g.g1} y2={2.6} stroke={INK} strokeWidth={1.2} />
                    </>
                  ) : (
                    <line x1={g.g0} y1={0} x2={g.g1} y2={0} stroke={INK} strokeWidth={1.2} />
                  )}
                </g>
              ))}
            </g>
          ))}

        {/* Extension lines (gap from the object, run past the outer string) */}
        {[...xBreaks].map((b) => (
          <line key={`evx${b}`} x1={right + S.gap} y1={mapX(b)} x2={vOuter + S.over} y2={mapX(b)} stroke="#555555" strokeWidth={S.ext} />
        ))}
        {[...zBreaks].map((b) => (
          <line key={`ehz${b}`} x1={mapZ(b)} y1={bottom + S.gap} x2={mapZ(b)} y2={hOuter + S.over} stroke="#555555" strokeWidth={S.ext} />
        ))}

        {/* Chain strings (nearest) + overall (outermost) */}
        {xChain.map((seg, i) => dimV(seg, vX1, `dv${i}`))}
        {xChain.length > 1 && dimV([minX, maxX], vX2, "dv-all")}
        {zChain.map((seg, i) => dimH(seg, hY1, `dh${i}`))}
        {zChain.length > 1 && dimH([minZ, maxZ], hY2, "dh-all")}

        {/* Opening locating strings (first level, per outside wall) */}
        {openingRuns.map((r, ri) => {
          const horiz = r.side === "top" || r.side === "bottom";
          const sgn = r.side === "top" || r.side === "left" ? -1 : 1;
          const at = r.line + sgn * S.d1;
          const abs = r.pts.map((p) => r.start + p);
          return (
            <g key={`run${ri}`}>
              {abs.map((p, i) => (horiz ? (
                <line key={`e${i}`} x1={p} y1={r.line + sgn * S.gap} x2={p} y2={at + sgn * S.over} stroke="#555555" strokeWidth={S.ext} />
              ) : (
                <line key={`e${i}`} x1={r.line + sgn * S.gap} y1={p} x2={at + sgn * S.over} y2={p} stroke="#555555" strokeWidth={S.ext} />
              )))}
              {abs.slice(1).map((p, i) => {
                const p0 = abs[i];
                if (p - p0 < 0.5) return null;
                const txt = fmtFtIn((p - p0) / FP_U);
                return horiz ? (
                  <g key={`s${i}`}>
                    <line x1={p0} y1={at} x2={p} y2={at} stroke="#333333" strokeWidth={S.thin} />
                    {tick(p0, at, "t0")}{tick(p, at, "t1")}
                    <text x={(p0 + p) / 2} y={at - S.gap} textAnchor="middle"
                      fontSize={S.text * 0.9} fill="#222222" fontFamily={FP_FONT}>{txt}</text>
                  </g>
                ) : (
                  <g key={`s${i}`}>
                    <line x1={at} y1={p0} x2={at} y2={p} stroke="#333333" strokeWidth={S.thin} />
                    {tick(at, p0, "t0")}{tick(at, p, "t1")}
                    <text transform={`translate(${at - S.gap},${(p0 + p) / 2}) rotate(-90)`} textAnchor="middle"
                      fontSize={S.text * 0.9} fill="#222222" fontFamily={FP_FONT}>{txt}</text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Lean-to storage depth strings (storage depth · remaining length) */}
        {storageRuns.map((s, si) => {
          const sgn = s.edge === "top" || s.edge === "left" ? -1 : 1;
          const edge = { top, bottom, left, right }[s.edge];
          const at = edge + sgn * storageAt(s.edge);
          const abs = s.pts.map((f) => (s.horiz ? mapZ(f) : mapX(f)));
          return (
            <g key={`st${si}`}>
              {abs.map((p, i) => (s.horiz ? (
                <line key={`e${i}`} x1={p} y1={edge + sgn * S.gap} x2={p} y2={at + sgn * S.over} stroke="#555555" strokeWidth={S.ext} />
              ) : (
                <line key={`e${i}`} x1={edge + sgn * S.gap} y1={p} x2={at + sgn * S.over} y2={p} stroke="#555555" strokeWidth={S.ext} />
              )))}
              {abs.slice(1).map((p, i) => {
                const p0 = abs[i];
                if (p - p0 < 0.5) return null;
                const txt = fmtFtIn((p - p0) / FP_U);
                return s.horiz ? (
                  <g key={`s${i}`}>
                    <line x1={p0} y1={at} x2={p} y2={at} stroke="#333333" strokeWidth={S.thin} />
                    {tick(p0, at, "t0")}{tick(p, at, "t1")}
                    <text x={(p0 + p) / 2} y={at - S.gap} textAnchor="middle"
                      fontSize={S.text * 0.9} fill="#222222" fontFamily={FP_FONT}>{txt}</text>
                  </g>
                ) : (
                  <g key={`s${i}`}>
                    <line x1={at} y1={p0} x2={at} y2={p} stroke="#333333" strokeWidth={S.thin} />
                    {tick(at, p0, "t0")}{tick(at, p, "t1")}
                    <text transform={`translate(${at - S.gap},${(p0 + p) / 2}) rotate(-90)`} textAnchor="middle"
                      fontSize={S.text * 0.9} fill="#222222" fontFamily={FP_FONT}>{txt}</text>
                  </g>
                );
              })}
              {/* Room label inside the storage area */}
              <text x={mapZ(s.label.z)} y={mapX(s.label.x)} textAnchor="middle" dominantBaseline="middle"
                fontSize={S.text * 0.8} fontWeight={600} fill="#555555" fontFamily={FP_FONT}
                letterSpacing={0.4 * k}>STORAGE</text>
            </g>
          );
        })}

        {/* Opening tags (D1, W1, …) just outside the wall */}
        {tags.map((t, i) => (
          <text key={`tag${i}`} x={t.x} y={t.y} textAnchor="middle" dominantBaseline="middle"
            fontSize={S.text * 0.95} fontWeight={600} fill="#222222" fontFamily={FP_FONT}>{t.text}</text>
        ))}

        {/* Side labels outside the dimensions */}
        {label("lb-top", pcx, topOuter - 45 * k, 0, "LEFT SIDE")}
        {label("lb-bottom", pcx, hOuter + 38 * k, 0, "RIGHT SIDE")}
        {label("lb-left", leftOuter - 50 * k, pcy, -90, "FRONT")}
        {label("lb-right", vOuter + 38 * k, pcy, 90, "BACK")}

        {/* Openings schedule — tag, item and size (footer row, right, small type) */}
        {schedule.length > 0 && (
          <g fontFamily={FP_FONT} fill="#222222">
            <text x={vbX1 - 10 * k} y={footY} textAnchor="end"
              fontSize={SCHED_TITLE} fontWeight={700}>OPENINGS</text>
            {schedule.map((o, i) => (
              <text key={o.tag} x={vbX1 - 10 * k} y={footY + (i + 1) * LINE_H}
                textAnchor="end" fontSize={SCHED_TEXT}>
                {`${o.tag} — ${o.name ? `${o.name} ` : ""}(${fmtFtIn(o.wFt)} W × ${fmtFtIn(o.hFt)} H)`}
              </text>
            ))}
          </g>
        )}

        {/* Scale key: one grid square = 1'-0" (footer row, left) */}
        {!hideScaleKey && (
          <>
            <rect x={vbX0 + 12 * k} y={footY - FP_U * 0.8} width={FP_U} height={FP_U} fill="#ffffff" stroke="#8f8f8f" strokeWidth={0.8} />
            <text x={vbX0 + 12 * k + FP_U + 6 * k} y={footY - FP_U * 0.3} dominantBaseline="middle"
              fontSize={SCHED_TEXT} fill="#222222" fontFamily={FP_FONT}>{"= 1'-0\""}</text>
          </>
        )}
        </g>
      </svg>
    );
  }

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

      {watermarkUrl ? (
        <defs>
          <filter id="fp-wm-gray">
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      ) : null}

      {/* Zoom/pan group — set via innerTransform by the Top View overlay. */}
      <g transform={innerTransform ?? undefined}>
        {/* Logo watermarks in the margin band, outside the side names, each
            readable from its own side (Left = top band upside down, Right =
            bottom, Front = left band, Back = right band). */}
        {watermarkUrl && [
          { key: "wm-top", x: cx, y: m * 0.42, rot: 180, len: slabW },
          { key: "wm-bottom", x: cx, y: m + slabH + m * 0.58, rot: 0, len: slabW },
          { key: "wm-left", x: m * 0.42, y: cy, rot: 90, len: slabH },
          { key: "wm-right", x: m + slabW + m * 0.58, y: cy, rot: -90, len: slabH },
        ].map((wm) => {
          const bw = Math.min(wm.len * 0.56, m * 1.26);
          const bh = m * 0.38;
          return (
            <g key={wm.key} transform={`translate(${wm.x},${wm.y}) rotate(${wm.rot})`}>
              <image
                href={watermarkUrl}
                x={-bw / 2}
                y={-bh / 2}
                width={bw}
                height={bh}
                preserveAspectRatio="xMidYMid meet"
                opacity={0.22}
                filter="url(#fp-wm-gray)"
              />
            </g>
          );
        })}
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
        {showLabels && sideName("sn-top", cx, m - m * FP_LABEL_PAD_M, 0, "Left Side")}
        {showLabels && sideName("sn-bottom", cx, m + slabH + m * FP_LABEL_PAD_M, 0, "Right Side")}
        {showLabels && sideName("sn-left", m - m * FP_LABEL_PAD_M, cy, -90, "Front Side")}
        {showLabels && sideName("sn-right", m + slabW + m * FP_LABEL_PAD_M, cy, 90, "Back Side")}
      </g>
    </svg>
  );
}