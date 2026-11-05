/**
 * Client Helpers — metalBuildings.data.js
 *
 * Pricing logic and lookup helpers.
 * Runs in the browser — NO database calls here.
 */

// ─── LEAN-TO FEATURE RESOLUTION ─────────────────────────────

// Normalize a feature name / render_key for comparison: lowercase, every
// non-alphanumeric run collapsed to a single space, and "leanto" folded to
// "lean to" — so "Attached Lean-To", "attached_lean_to", "Attached Leanto" and
// "attached lean to" all canonicalize identically.
function normalizeFeatureKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bleanto\b/g, "lean to")
    .replace(/\s+/g, " ")
    .trim();
}

// Accepted canonical names for the lean-to pricing feature, most specific first.
const LEANTO_FEATURE_KEYS = ["attached lean to", "attached lean", "lean to"];

/**
 * Resolve the "Attached Lean To" pricing feature — the metal_s_feature whose
 * metal_m_feature_matrix_price rows drive lean-to sizes and base prices.
 * Matches on name or render_key, tolerating spelling variants ("Attached
 * Leanto", "Attached Lean-To", "Attached Lean", "Lean To"); never guesses a
 * non-lean feature. Returns the feature row or null.
 */
export function findLeantoFeature(features) {
  const list = features ?? [];
  for (const key of LEANTO_FEATURE_KEYS) {
    const match =
      list.find((f) => normalizeFeatureKey(f.name) === key) ??
      list.find((f) => normalizeFeatureKey(f.render_key) === key);
    if (match) return match;
  }
  return null;
}

// ─── MATRIX LOOKUP ─────────────────────────────────────────

/**
 * Look up a matrix price filtered by featureId AND styleId.
 * If styleId is provided, only match rows with that style_id.
 * Falls back to style_id=null rows if no style-specific match.
 */
export function lookupMatrixPrice(matrixPrices, featureId, styleId, width, length, height) {
  // Try style-specific first
  let match = matrixPrices.find((m) => {
    if (m.feature_id !== featureId) return false;
    if (m.style_id !== styleId) return false;
    if (m.width !== null && m.width !== width) return false;
    if (m.length !== null && m.length !== length) return false;
    if (m.height !== null && m.height !== height) return false;
    return true;
  });
  if (match) return Number(match.price);

  // Fallback: rows with style_id = null (shared across all styles)
  match = matrixPrices.find((m) => {
    if (m.feature_id !== featureId) return false;
    if (m.style_id !== null) return false;
    if (m.width !== null && m.width !== width) return false;
    if (m.length !== null && m.length !== length) return false;
    if (m.height !== null && m.height !== height) return false;
    return true;
  });
  return match ? Number(match.price) : null;
}

// ─── DIMENSION HELPERS ─────────────────────────────────────

/**
 * Get unique dimension values for a feature + style.
 * Filters by style_id when provided.
 */
export function getUniqueDimensionValues(matrixPrices, featureId, styleId, dimension) {
  const key = dimension.toLowerCase(); // width | length | height
  return [
    ...new Set(
      matrixPrices
        .filter((m) => {
          if (m.feature_id !== featureId) return false;
          if (styleId != null && m.style_id !== null && m.style_id !== styleId) return false;
          return m[key] !== null;
        })
        .map((m) => m[key])
    ),
  ].sort((a, b) => a - b);
}

// Get unique leg-height values. The new leg-height matrix is scoped by length
// range and leg type rather than feature/style, so feature/style params are
// accepted for backward compatibility but ignored.
export function getLegHeightValues(legHeightPrices, featureId, styleId) {
  return [
    ...new Set(
      (legHeightPrices ?? [])
        .filter((p) => p.leg_height != null)
        .map((p) => Number(p.leg_height))
    ),
  ].sort((a, b) => a - b);
}

// ─── STYLE DEFAULTS (metal_s_style.default_* columns) ─────

/**
 * Resolve a style's default dimension (metal_s_style.default_width /
 * default_length / default_height).
 *
 * The metal_s_style default is authoritative: when the column is set it is
 * used even if the pricing matrix does not offer that size yet. Only when the
 * column is empty do we fall back to the first offered value, then the
 * last-resort literal. No dimension is ever hard-coded per style in the views.
 */
export function resolveStyleDefaultDim(dbDefault, values, fallback) {
  const list = Array.isArray(values) ? values : [];
  const def = dbDefault == null || dbDefault === "" ? NaN : Number(dbDefault);
  if (Number.isFinite(def)) return def;
  return list.length > 0 ? list[0] : fallback;
}

/**
 * Merge an extra size value (e.g. metal_s_style.default_width) into an offered
 * size list so the SIZE selectors can always display the applied default.
 * Returns a sorted numeric list.
 */
export function mergeDimValue(values, extra) {
  const list = (Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isFinite);
  const num = extra == null || extra === "" ? NaN : Number(extra);
  if (Number.isFinite(num) && !list.includes(num)) list.push(num);
  return list.sort((a, b) => a - b);
}

// Normalize an overhang label / metal_s_style.default_roof_overhang value to
// a comparable size key. Quote-style marks are equivalent and stripped:
// `6"` ≡ `6'` ≡ `6` → 6; non-numeric labels compare as lowercased text.
function normalizeOverhangSize(name) {
  if (name == null) return null;
  const cleaned = String(name).trim().replace(/['"″′”’]/g, "").trim();
  if (cleaned === "") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : cleaned.toLowerCase();
}

/**
 * Match metal_s_style.default_roof_overhang (e.g. "6", "0") against roof
 * overhang option labels (e.g. `6"`, `0"`). Returns the matching label or
 * null when nothing matches.
 */
export function matchOverhangOption(optionNames, dbDefaultOverhang) {
  const want = normalizeOverhangSize(dbDefaultOverhang);
  if (want == null) return null;
  return (optionNames ?? []).find((n) => normalizeOverhangSize(n) === want) ?? null;
}

/**
 * Build the default roof-overhang add-on line for a style from
 * metal_s_style.default_roof_overhang. Returns the add-on item shape used by
 * the configurators ({ featureId, featureName, description, price }) or null
 * when the feature or a matching option is missing.
 */
export function buildDefaultRoofOverhangAddOn(features, options, style) {
  const feat = (features ?? []).find((f) => f.render_key === "roof_overhang");
  if (!feat) return null;
  const candidates = (options ?? []).filter(
    (o) => o.feature_id === feat.feature_id && o.is_active !== false
  );
  const label = matchOverhangOption(candidates.map((o) => o.name), style?.default_roof_overhang);
  if (!label) return null;
  const opt = candidates.find((o) => o.name === label);
  if (!opt) return null;
  return {
    featureId: feat.feature_id,
    featureName: feat.name,
    description: opt.name,
    price: Number(opt.price),
  };
}

// Look up the leg-height price for the current building length.
// Matches by length range (min_length/max_length), leg height, and optionally leg type.
// When overlapping ranges match, the narrowest range wins (then the lowest
// leg_type_id / leg_matrix_id) so resolution is deterministic and mirrors the
// server-side lookup.
export function lookupLegHeightPrice(legHeightPrices, matrixPrices, featureId, styleId, width, length, height, legTypeId) {
  if (height == null) return 0;
  const len = Number(length);
  const h = Number(height);
  const rangeSize = (p) => {
    const min = p.min_length != null ? Number(p.min_length) : Number.NEGATIVE_INFINITY;
    const max = p.max_length != null ? Number(p.max_length) : Number.POSITIVE_INFINITY;
    return max - min;
  };
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const matches = (legHeightPrices ?? []).filter((p) => {
    if (Number(p.leg_height) !== h) return false;
    if (legTypeId != null && Number(p.leg_type_id) !== Number(legTypeId)) return false;
    const min = p.min_length != null ? Number(p.min_length) : null;
    const max = p.max_length != null ? Number(p.max_length) : null;
    if (min != null && len < min) return false;
    if (max != null && len > max) return false;
    return true;
  });
  if (matches.length === 0) return 0;
  matches.sort((a, b) =>
    cmp(rangeSize(a), rangeSize(b)) ||
    cmp(Number(a.leg_type_id ?? 0), Number(b.leg_type_id ?? 0)) ||
    cmp(Number(a.leg_matrix_id ?? 0), Number(b.leg_matrix_id ?? 0))
  );
  return Number(matches[0].price ?? 0);
}

// ─── OPTION DIMENSION LOOKUP ───────────────────────────────

/**
 * Look up a feature option by building dimensions (featureId, width, length).
 * Matches rows whose [min_width, max_width] and [min_length, max_length] ranges
 * contain the building's width/length. Null bounds = unbounded.
 * Returns the first matching row (ordered by sort_order) or null.
 */
export function lookupOptionByDimensions(options, featureId, width, length) {
  const w = Number(width);
  const l = Number(length);
  const candidates = (options ?? [])
    .filter((o) => o.feature_id === featureId && o.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return candidates.find((o) => {
    const minW = o.min_width != null ? Number(o.min_width) : null;
    const maxW = o.max_width != null ? Number(o.max_width) : null;
    const minL = o.min_length != null ? Number(o.min_length) : null;
    const maxL = o.max_length != null ? Number(o.max_length) : null;
    if (minW != null && w < minW) return false;
    if (maxW != null && w > maxW) return false;
    if (minL != null && l < minL) return false;
    if (maxL != null && l > maxL) return false;
    return true;
  }) ?? null;
}

// ─── OPENING DIMENSIONS ────────────────────────────────────

/**
 * Parse WxH opening dimensions from a door/window item name. Handles the
 * live naming formats:
 *   `10' x 11' Roll-Up Door`      → foot marks  → 10ft × 11ft
 *   `36" x 80" Mobile Home Door`  → inch marks  → 3ft × 6.67ft
 *   `36×80 Walk-in Door`, `24×36 Single Window`, `8×8 Rollup Door` (bare) →
 *   inches when the height reads like inches (>= 20), feet otherwise.
 * Returns { widthFt, heightFt } or null when no dimensions are present.
 */
export function parseOpeningDimensions(name) {
  const s = String(name ?? "");
  const ft = /(\d+(?:\.\d+)?)\s*['′’]\s*[×xX]\s*(\d+(?:\.\d+)?)\s*['′’]/.exec(s);
  if (ft) return { widthFt: Number(ft[1]), heightFt: Number(ft[2]) };
  const inch = /(\d+(?:\.\d+)?)\s*["″”]\s*[×xX]\s*(\d+(?:\.\d+)?)\s*["″”]/.exec(s);
  if (inch) return { widthFt: Number(inch[1]) / 12, heightFt: Number(inch[2]) / 12 };
  // Letter-suffixed sizes ("24W x 36H Single Pane…", "36W x 80H Door"): the W/H
  // markers break the bare pattern below, so allow them explicitly. Same unit
  // heuristic as bare (inches when the height reads like inches).
  const tagged = /(\d+(?:\.\d+)?)\s*[wW]?\s*[×xX]\s*(\d+(?:\.\d+)?)\s*[hH]?/.exec(s);
  const bare = tagged ?? /(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)/.exec(s);
  if (!bare) return null;
  let w = Number(bare[1]);
  let h = Number(bare[2]);
  // Heuristic: if height >= 20, assume inches (walk-in doors are "36×80" =
  // 36"×80"). If both < 20, assume feet (rollup doors are "8×8" = 8ft×8ft).
  if (h >= 20) { w /= 12; h /= 12; }
  return { widthFt: w, heightFt: h };
}

// ─── REGION / STATE PRICING ────────────────────────────────

/**
 * Apply region multiplier to a price.
 */
export function applyRegionMultiplier(price, region) {
  if (!region || !region.multiplier) return price;
  return price * Number(region.multiplier);
}

// ─── PANEL PRICING ─────────────────────────────────────────

/**
 * Calculate price for a single wall option.
 * End walls multiply price_per_foot × building width.
 * Sidewalls multiply price_per_foot × building length.
 */
export function calcPanelOptionPrice(option, buildingWidth, buildingLength) {
  const ppf = Number(option.price_per_foot);
  if (ppf === 0) return 0;
  const dimension = option.location_type === "end" ? buildingWidth : buildingLength;
  return ppf * (dimension || 0);
}

/**
 * Calculate total panel cost for all wall selections.
 * wallSelections: { [location_id]: option_id }
 */
export function calcTotalPanelPrice(wallSelections, panelLocations, panelOptions, buildingWidth, buildingLength) {
  let total = 0;
  for (const loc of panelLocations) {
    const selectedOptId = wallSelections[loc.location_id];
    if (!selectedOptId) continue;
    const opt = panelOptions.find((o) => o.option_id === selectedOptId);
    if (!opt) continue;
    total += calcPanelOptionPrice(opt, buildingWidth, buildingLength);
  }
  return total;
}

// ─── CUSTOM WALL PANEL PRICING (metal_m_panel_pricing) ─────
//
// "Custom" per-wall panels are sourced from metal_m_panel_pricing rows whose
// panel type (metal_s_panel_type.panel_name) marks them as Custom. Each row is
// priced FLAT from its `price` column (unlike metal_s_panel_option which uses
// price_per_foot × dimension). The selected value stored per wall is the row's
// panel_pricing_id.

/**
 * True when a metal_s_panel_type row represents a "Custom" wall panel.
 */
export function isCustomPanelType(panelType) {
  return String(panelType?.panel_name ?? "").toLowerCase().includes("custom");
}

/**
 * Options for one wall's "Custom" combo box.
 *
 * Returns metal_m_panel_pricing rows whose panel type is Custom and matches the
 * wall's location_type (side/end). When a panel type has no location_type it is
 * treated as applying to every wall. Each row is enriched with a display `label`
 * (its option_name). The combo's value should be `panel_pricing_id`.
 *
 * NOTE: intentionally filtered only by "panel type is Custom" + the wall's
 * location_type (not by feature_id) — metal_m_panel_pricing rows may be linked to
 * either the PANEL feature or the "Base Structure Wall" feature. Custom walls are
 * an explicit user choice and price straight from the row's `price`.
 */
export function getCustomWallOptions({ panelPricing = [], panelTypes = [], locationType }) {
  const typeById = new Map((panelTypes ?? []).map((t) => [t.panel_type_id, t]));
  const locType = String(locationType ?? "").toLowerCase();
  return (panelPricing ?? [])
    .filter((row) => {
      const type = typeById.get(row.panel_type_id);
      if (!type || !isCustomPanelType(type)) return false;
      const typeLoc = String(type.location_type ?? "").toLowerCase();
      if (typeLoc && locType && typeLoc !== locType) return false;
      return true;
    })
    .map((row) => ({ ...row, label: row.option_name ?? `Panel ${row.panel_pricing_id}` }));
}

/**
 * Find a metal_m_panel_pricing row by its primary key (a wall's selection).
 */
export function findCustomWallRow(panelPricing, panelPricingId) {
  if (!panelPricingId) return null;
  return (panelPricing ?? []).find((r) => r.panel_pricing_id === panelPricingId) ?? null;
}

// Parse a feet token used in custom panel names ("3", "1 1/2", "1/2", "1.5")
// into decimal feet ("1 1/2" → 1.5). Returns null when unparseable.
function parseFeetToken(token) {
  const s = String(token ?? "").trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const dec = Number(s);
  return Number.isFinite(dec) ? dec : null;
}

/**
 * 3D render type for a selected custom wall row. metal_m_panel_pricing has no
 * render_type column, so derive it from option_name, matching the render_type
 * vocabulary of metal_s_panel_option:
 *   "Extended Gable End - 3' Panel"    → "ext_gable_3"  (gable + 3' strip)
 *   "Gable End"                        → "gable"
 *   "Top - 1 1/2' Panel"               → "top_1.5"
 *   "Open"                             → false         (no panel)
 *   "Fully Enclosed" / anything else   → "enclosed"
 * A leading siding-style prefix ("Horizontal"/"Vertical") is ignored — it only
 * describes panel orientation — and mixed-number heights ("1 1/2") parse to
 * decimals ("1.5"). Returns false for open rows so the wall renders frame-only.
 */
export function deriveCustomRenderType(row) {
  const raw = String(row?.option_name ?? "").toLowerCase();
  const name = raw.replace(/^(horizontal|vertical)\s+/, "");

  if (/\bopen\b/.test(name)) return false;

  // First feet token in the name ("3'", "1 1/2'", "1/2'", "1.5'").
  const heightMatch = name.match(/(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)/);
  const heightFt = heightMatch ? parseFeetToken(heightMatch[1]) : null;

  // Extended gable ("Extended Gable End - 3' Panel") = gable triangle plus a
  // panel strip of that height below the eave ("ext_gable_N"). Must be matched
  // before the generic "gable" check so it isn't collapsed to plain "gable".
  if (name.includes("extended") && /\bgable\b/.test(name)) {
    return heightFt != null ? `ext_gable_${heightFt}` : "gable";
  }
  if (/\bgable\b/.test(name)) return "gable";

  // Partial top panel ("Top - 3' Panel") = "top_N".
  if (/\btop\b/.test(name)) {
    return heightFt != null ? `top_${heightFt}` : "enclosed";
  }
  return "enclosed";
}

/**
 * Siding seam direction for a selected custom wall row, overriding the global
 * Siding Panel setting per wall. Prefers the row's `siding_style` column
 * (metal_m_panel_pricing), falling back to the "Horizontal"/"Vertical" prefix
 * of option_name. Returns "horizontal" | "vertical" | null (null = keep the
 * global setting).
 */
export function deriveCustomSidingStyle(row) {
  const style = String(row?.siding_style ?? "").trim().toLowerCase();
  if (style.includes("horizontal")) return "horizontal";
  if (style.includes("vertical")) return "vertical";
  const name = String(row?.option_name ?? "").trim().toLowerCase();
  if (/^(horizontal|vertical)\b/.test(name)) {
    return name.startsWith("horizontal") ? "horizontal" : "vertical";
  }
  return null;
}

// ─── STYLE DEFAULT SETUP RESOLVERS ─────────────────────────
// Resolve a style profile's `defaultSetup` (see styleProfiles.js) against the
// live DB rows by NAME. Every resolver is pure and skips anything it cannot
// find — a renamed/missing DB row never breaks the configurator.

const normName = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Loose name match: every word of `needle` appears in `haystack`. */
function nameMatches(haystack, needle) {
  const h = normName(haystack);
  return normName(needle).split(" ").filter(Boolean).every((w) => h.includes(w));
}

/**
 * Find a row by name: exact normalized match first, then loose word match.
 * The exact pass keeps "White" from resolving to "Bright White" (both contain
 * the word "white") when both rows exist.
 */
function findByName(rows, needle, getName) {
  const list = (rows ?? []).filter(Boolean);
  const exact = normName(needle);
  return (
    list.find((r) => normName(getName(r)) === exact) ??
    list.find((r) => nameMatches(getName(r), needle)) ??
    null
  );
}

/**
 * Resolve `{ [groupName]: optionName }` color defaults to
 * `{ [color_group_id]: color_option_id }` for colorSelections. Group and option
 * are matched by name (option must live in that group).
 */
export function resolveDefaultColorSelections(colorGroups = [], colorOptions = [], colorDefaults = {}) {
  const result = {};
  for (const [groupName, optionName] of Object.entries(colorDefaults ?? {})) {
    const group = findByName(colorGroups, groupName, (g) => g.name);
    if (!group) continue;
    const opt = findByName(
      (colorOptions ?? []).filter((o) => o.color_group_id === group.color_group_id),
      optionName,
      (o) => o.name
    );
    if (opt) result[group.color_group_id] = opt.color_option_id;
  }
  return result;
}

/**
 * Resolve `{ [featureName]: optionName }` add-on defaults to the
 * addOnItems-shaped map `{ [feature_id]: { featureId, featureName, description,
 * price } }`. Matched by feature name (or render_key) and option name.
 */
export function resolveDefaultAddOns(features = [], options = [], addonDefaults = {}) {
  const result = {};
  for (const [featureName, optionName] of Object.entries(addonDefaults ?? {})) {
    const feat =
      findByName(features, featureName, (f) => f.name) ??
      findByName(features, featureName, (f) => f.render_key);
    if (!feat) continue;
    const opt = findByName(
      (options ?? []).filter((o) => o.feature_id === feat.feature_id),
      optionName,
      (o) => o.name
    );
    if (!opt) continue;
    result[feat.feature_id] = {
      featureId: feat.feature_id,
      featureName: feat.name,
      description: opt.name,
      price: Number(opt.price ?? 0),
    };
  }
  return result;
}

/**
 * Resolve default opening specs to the doorWindowSelections shape
 * (`{ [wall]: [{ item_id, name, price, item_type, posFt }] }`).
 *
 * Each spec: `{ wall, type, widthFt, heightFt } | { wall, type, widthIn,
 * heightIn } | { wall, type, nameHint }`. Items are matched within the
 * item_type candidates: nameHint narrows the pool first (so "prehung" wins
 * over a same-size walk-in door), then the parsed WxH (within 0.25ft) picks
 * the item. Specs whose item can't be found are skipped.
 */
export function resolveDefaultOpenings(doorWindowItems = [], openingSpecs = []) {
  const result = { left: [], back: [], right: [], front: [] };
  for (const spec of openingSpecs ?? []) {
    const wall = String(spec?.wall ?? "").toLowerCase();
    if (!(wall in result)) continue;
    let pool = (doorWindowItems ?? []).filter(
      (it) => String(it.item_type ?? "").toLowerCase() === String(spec.type ?? "").toLowerCase()
    );
    if (spec.nameHint) {
      const hinted = pool.filter((it) => nameMatches(it.name, spec.nameHint));
      if (hinted.length > 0) pool = hinted;
    }
    const wantW = spec.widthFt ?? (spec.widthIn != null ? spec.widthIn / 12 : null);
    const wantH = spec.heightFt ?? (spec.heightIn != null ? spec.heightIn / 12 : null);
    const item =
      (wantW != null && wantH != null
        ? pool.find((it) => {
            const d = parseOpeningDimensions(it.name);
            return d && Math.abs(d.widthFt - wantW) <= 0.25 && Math.abs(d.heightFt - wantH) <= 0.25;
          })
        : null) ??
      (spec.nameHint ? pool[0] ?? null : null);
    if (!item) continue;
    result[wall].push({
      item_id: item.item_id,
      name: item.name,
      price: Number(item.price ?? 0),
      item_type: item.item_type,
      posFt: spec.posFt ?? 0,
    });
  }
  return result;
}

/**
 * Total flat price for the selected custom wall panels.
 * wallSelections: { [location_id]: panel_pricing_id }
 */
export function calcCustomTotalWallPrice(wallSelections, panelLocations, panelPricing) {
  let total = 0;
  for (const loc of panelLocations ?? []) {
    const selectedId = wallSelections?.[loc.location_id];
    const row = findCustomWallRow(panelPricing, selectedId);
    if (!row) continue;
    total += Number(row.price ?? 0);
  }
  return total;
}

/**
 * Look up flat wall prices from metal_m_panel_pricing using each wall's own
 * size (side walls: sideWidth × height; end walls: width × height), region,
 * panel type, and siding style.
 *
 * panelPricing:      rows from metal_m_panel_pricing (each with panel_type_id).
 * panelTypes:        rows from metal_s_panel_type (panel_type_id, panel_name, location_type).
 * panelPriceRegions: map of panel_pricing_id → region_id[] (from metal_m_region_panelprice_matrix).
 * regionId:          the selected region id; region-linked rows take priority
 *                    over unrestricted rows (null = default pricing only).
 * width:             end-wall (front/back) span used for the width band match.
 * sideWidth:         side-wall (left/right) span; falls back to width when omitted.
 * sidingStyle:       siding style to match against metal_m_panel_pricing.siding_style
 *                    ("Horizontal" / "Vertical"). Defaults to "Horizontal".
 *
 * Matching: the wall span must fall within [width, max_width ?? width]. Enclosed and
 * Gable walls also match height exactly (null height = wildcard) and the siding
 * style (null/empty siding_style = wildcard). Rows with a non-matching explicit
 * style are excluded. Within the matching rows, region-linked rows win over
 * unrestricted rows, then exact siding style over wildcard, then exact height
 * over wildcard. Returns { sidePrice, endPrice, gableEndPrice } (all per single wall).
 */
export function lookupWallPanelPrices({ panelPricing = [], panelTypes = [], panelPriceRegions = {}, featureId, regionId, width, sideWidth = null, height, sidingStyle = "Horizontal" }) {
  const w = Number(width);
  // Side walls (left/right) span the building length; end walls (front/back)
  // span the building width. sideWidth lets each wall type match its own span.
  const sw = sideWidth == null || sideWidth === "" ? w : Number(sideWidth);
  const h = Number(height);
  const rid = regionId == null || regionId === "" ? null : Number(regionId);

  const findPanelType = (locationType, keyword) =>
    (panelTypes ?? []).find(
      (t) =>
        String(t.location_type ?? "").toLowerCase() === locationType &&
        String(t.panel_name ?? "").toLowerCase().includes(keyword)
    );

  // "closed" matches both "Fully Closed" and "Fully Enclosed" (the latter
  // contains "closed" as a substring) — the DB uses both spellings.
  const enclosedSideType = findPanelType("side", "closed");
  const enclosedEndType = findPanelType("end", "closed");
  const gableEndType = findPanelType("end", "gable");

  const regionIdsFor = (row) => {
    const ids = panelPriceRegions?.[String(row.panel_pricing_id)];
    return Array.isArray(ids) ? ids : [];
  };

  const findPrice = (panelTypeId, { matchHeight = true, matchSidingStyle = null, matchWidth = w } = {}) => {
    if (panelTypeId == null) return 0;
    const style = String(matchSidingStyle ?? "").trim().toLowerCase();
    const matches = (panelPricing ?? [])
      .filter((row) => Number(row.panel_type_id) === Number(panelTypeId))
      .filter((row) => featureId == null || Number(row.feature_id) === Number(featureId))
      .filter((row) => {
        const minW = row.width != null ? Number(row.width) : null;
        const maxW = row.max_width != null ? Number(row.max_width) : minW;
        if (Number.isFinite(matchWidth) && minW != null && matchWidth < minW) return false;
        if (Number.isFinite(matchWidth) && maxW != null && matchWidth > maxW) return false;
        return true;
      })
      .filter((row) => {
        if (!matchHeight || row.height == null) return true; // wildcard: matches any height
        return Number.isFinite(h) && Number(row.height) === h;
      })
      .filter((row) => {
        // Siding style: null/empty rows are wildcards (match any style); any
        // other row must match the requested style exactly (case-insensitive).
        if (!style) return true;
        const rowStyle = String(row.siding_style ?? "").trim().toLowerCase();
        return rowStyle === "" || rowStyle === style;
      });

    // Region preference: region-linked rows win over unrestricted rows.
    const regionLinked = matches.filter((row) =>
      rid != null && regionIdsFor(row).some((id) => Number(id) === rid)
    );
    const unrestricted = matches.filter((row) => regionIdsFor(row).length === 0);
    let pool = regionLinked.length > 0 ? regionLinked : unrestricted;
    if (pool.length === 0) return 0;

    // Prefer an exact siding style match over a wildcard row within the pool.
    if (style) {
      const exactStyle = pool.filter(
        (row) => String(row.siding_style ?? "").trim().toLowerCase() === style
      );
      if (exactStyle.length > 0) pool = exactStyle;
    }

    // Prefer an exact height match over a wildcard row within the chosen pool.
    if (matchHeight) {
      const exact = pool.find((row) => row.height != null && Number(row.height) === h);
      if (exact) pool = [exact];
    }

    return Number((pool[0]).price ?? 0);
  };

  return {
    // Side walls match their own span (the building length when sideWidth is given).
    sidePrice: findPrice(enclosedSideType?.panel_type_id, { matchHeight: true, matchWidth: sw }),
    endPrice: findPrice(enclosedEndType?.panel_type_id, { matchHeight: true }),
    gableEndPrice: findPrice(gableEndType?.panel_type_id, { matchHeight: true, matchSidingStyle: sidingStyle }),
  };
}

// ─── FEATURE RATE LOOKUP (metal_m_feature_rate) ─────────────

/**
 * Look up an active per-unit rate from metal_m_feature_rate rows.
 * Returns the rate as a positive number, or null when not found.
 */
export function lookupFeatureRate(rates, featureId, unit = "linear_ft") {
  if (featureId == null) return null;
  const row = (rates ?? []).find(
    (r) => r.feature_id === featureId && r.unit === unit && r.is_active !== false
  );
  const rate = Number(row?.rate);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

// ─── GUTTER & DOWNSPOUT PRICING ─────────────────────────────

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Pure gutter/downspout price calculation. No side effects, no UI access.
 *
 * Pricing rules (all lengths in feet, prices in USD):
 * - One side ("left" | "right"): gutterLF = buildingLength + 2
 * - Both sides: gutterLF = (buildingLength + 2) * 2
 * - Downspouts (only when gutters are selected):
 *   downspoutLF = (tallestSidewallHeight + 1.5) * downspoutCount
 * - gutterPrice = gutterLF * ratePerLF; downspoutPrice = downspoutLF * ratePerLF
 * - Prices are identical in all regions.
 *
 * Validation: negative/NaN building length clamps to 0; downspoutCount clamps
 * to an integer 0-10; a missing leg height yields downspoutLF = 0; an unknown
 * gutterSelection is treated as "none".
 *
 * @param {Object} params
 * @param {number} params.buildingLength     Building length in feet (width is NOT used).
 * @param {number[]} [params.sidewallHeights] Leg heights (feet) across the center section and any left/right sections.
 * @param {"none"|"left"|"right"|"both"} [params.gutterSelection]
 * @param {number} [params.downspoutCount]   Integer 0-10.
 * @param {number} params.ratePerLF          Rate per linear foot from metal_m_feature_rate (via lookupFeatureRate). Required — no hardcoded fallback.
 * @returns {{ gutterLF: number, gutterPrice: number, downspoutLF: number, downspoutPrice: number }}
 */
export function calculateGutterPricing({
  buildingLength,
  sidewallHeights = [],
  gutterSelection = "none",
  downspoutCount = 0,
  ratePerLF,
} = {}) {
  const selection = ["none", "left", "right", "both"].includes(gutterSelection) ? gutterSelection : "none";

  // Downspouts are only priced when gutters are selected.
  if (selection === "none") {
    return { gutterLF: 0, gutterPrice: 0, downspoutLF: 0, downspoutPrice: 0 };
  }

  // The rate must come from metal_m_feature_rate (no hardcoded fallback) —
  // a missing or invalid rate means no pricing.
  const rate = Number(ratePerLF);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { gutterLF: 0, gutterPrice: 0, downspoutLF: 0, downspoutPrice: 0 };
  }

  // Clamp building length to a non-negative finite number.
  const lengthNum = Number(buildingLength);
  const lengthFt = Number.isFinite(lengthNum) ? Math.max(0, lengthNum) : 0;

  // Clamp downspout count to an integer 0-10.
  const count = Math.min(10, Math.max(0, Math.trunc(Number(downspoutCount) || 0)));

  // Tallest sidewall height across the center section and any left/right
  // sections that exist. A missing/invalid leg height yields no downspout length.
  const heights = (Array.isArray(sidewallHeights) ? sidewallHeights : [])
    .filter((v) => v != null && v !== "")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
  const tallestSidewall = heights.length ? Math.max(...heights) : null;

  // Per-side run: building length + 2 ft; both sides doubles the run.
  // TODO: Wraparound corner sections — add 2 ft for each "standard carport
  // wraparound" corner (up to 4: left-front, left-back, right-front, right-back).
  // Skipped: the codebase has no wraparound concept yet.
  const gutterLF = selection === "both" ? (lengthFt + 2) * 2 : lengthFt + 2;

  const downspoutLF = tallestSidewall == null ? 0 : (tallestSidewall + 1.5) * count;

  return {
    gutterLF: round2(gutterLF),
    gutterPrice: round2(gutterLF * rate),
    downspoutLF: round2(downspoutLF),
    downspoutPrice: round2(downspoutLF * rate),
  };
}

// ─── FORMATTERS ────────────────────────────────────────────

export function formatCurrency(value) {
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Upcharge label (e.g. color premiums): "+$25.00" when positive, empty when none.
export function formatUpcharge(value) {
  const amt = Number(value ?? 0);
  return amt > 0 ? `+${formatCurrency(amt)}` : "";
}

// "Burgundy (+$25.00)" when a premium applies, just "Burgundy" when none.
export function formatColorLabel(name, value) {
  const up = formatUpcharge(value);
  return up ? `${name} (${up})` : name;
}

// ─── COLOR GROUP VISIBILITY ─────────────────────────────────
// Wall-cladding color groups (Siding, Wainscot) only apply when the building
// actually has walls to clad. `walls` is the 3D walls map
// ({ front, back, left, right } → false | true | "enclosed" | "gable" |
// "top_N" | "ext_gable_N"). Wainscot additionally needs full-height cladding —
// the two-tone lower band renders only on enclosed walls, not on gable wedges
// or partial top/ext-gable strips.
export function isColorGroupVisible(group, walls) {
  const target = String(group?.render_target ?? "").toLowerCase();
  const name = String(group?.name ?? "").toLowerCase();
  const isWainscot = target === "two_tone" || /wainscot|two[- ]?tone/.test(name);
  const isSiding = target === "wall" || /siding/.test(name);
  const wallTypes = Object.values(walls ?? {});
  if (isWainscot) return wallTypes.some((v) => v === true || v === "enclosed");
  if (isSiding) return wallTypes.some(Boolean);
  return true;
}

export function formatCurrencyInput(value) {
  const digits = String(value).replace(/[^0-9.]/g, "");
  return digits;
}

export function parseCurrencyInput(value) {
  return String(value).replace(/[^0-9.]/g, "");
}
