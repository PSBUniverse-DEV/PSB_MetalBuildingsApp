/**
 * Client Helpers — metalBuildings.data.js
 *
 * Pricing logic and lookup helpers.
 * Runs in the browser — NO database calls here.
 */

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

/**
 * 3D render type for a selected custom wall row. metal_m_panel_pricing has no
 * render_type column, so derive it from option_name (e.g. "Gable End",
 * "Top - 3' Panel"), defaulting to "enclosed".
 */
export function deriveCustomRenderType(row) {
  const name = String(row?.option_name ?? "").toLowerCase();
  if (name.includes("gable")) return "gable";
  const top = name.match(/top[^0-9]*([0-9]+(?:\.[0-9]+)?)/);
  if (top) return `top_${top[1]}`;
  return "enclosed";
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
 * Look up flat wall prices from metal_m_panel_pricing using the Base Structure's
 * width, height (where applicable), and region.
 *
 * panelPricing:      rows from metal_m_panel_pricing (each with panel_type_id).
 * panelTypes:        rows from metal_s_panel_type (panel_type_id, panel_name, location_type).
 * panelPriceRegions: map of panel_pricing_id → region_id[] (from metal_m_region_panelprice_matrix).
 * regionId:          the selected region id; region-linked rows take priority
 *                    over unrestricted rows (null = default pricing only).
 *
 * Matching: the width must fall within [width, max_width ?? width]. Enclosed walls
 * also match height exactly (null height = wildcard); Gable ends match width + region
 * only and prefer the "Horizontal" siding style. Returns
 * { sidePrice, endPrice, gableEndPrice } (all per single wall).
 */
export function lookupWallPanelPrices({ panelPricing = [], panelTypes = [], panelPriceRegions = {}, featureId, regionId, width, height }) {
  const w = Number(width);
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

  const findPrice = (panelTypeId, { matchHeight = true, preferSidingStyle = null } = {}) => {
    if (panelTypeId == null) return 0;
    const matches = (panelPricing ?? [])
      .filter((row) => Number(row.panel_type_id) === Number(panelTypeId))
      .filter((row) => featureId == null || Number(row.feature_id) === Number(featureId))
      .filter((row) => {
        const minW = row.width != null ? Number(row.width) : null;
        const maxW = row.max_width != null ? Number(row.max_width) : minW;
        if (Number.isFinite(w) && minW != null && w < minW) return false;
        if (Number.isFinite(w) && maxW != null && w > maxW) return false;
        return true;
      })
      .filter((row) => {
        if (!matchHeight || row.height == null) return true; // wildcard: matches any height
        return Number.isFinite(h) && Number(row.height) === h;
      });

    // Region preference: region-linked rows win over unrestricted rows.
    const regionLinked = matches.filter((row) =>
      rid != null && regionIdsFor(row).some((id) => Number(id) === rid)
    );
    const unrestricted = matches.filter((row) => regionIdsFor(row).length === 0);
    let pool = regionLinked.length > 0 ? regionLinked : unrestricted;
    if (pool.length === 0) return 0;

    // Prefer an exact height match over a wildcard row within the chosen pool
    // (only when height matching is enabled — e.g. Enclosed, not Gable).
    if (matchHeight) {
      const exact = pool.find((row) => row.height != null && Number(row.height) === h);
      if (exact) pool = [exact];
    }

    // Prefer the requested siding style when available (e.g. Horizontal for gables).
    if (preferSidingStyle) {
      const preferred = pool.filter(
        (row) => String(row.siding_style ?? "").toLowerCase() === preferSidingStyle.toLowerCase()
      );
      if (preferred.length > 0) pool = preferred;
    }

    return Number((pool[0]).price ?? 0);
  };

  return {
    sidePrice: findPrice(enclosedSideType?.panel_type_id, { matchHeight: true }),
    endPrice: findPrice(enclosedEndType?.panel_type_id, { matchHeight: true }),
    gableEndPrice: findPrice(gableEndType?.panel_type_id, { matchHeight: false, preferSidingStyle: "Horizontal" }),
  };
}

// ─── FORMATTERS ────────────────────────────────────────────

export function formatCurrency(value) {
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCurrencyInput(value) {
  const digits = String(value).replace(/[^0-9.]/g, "");
  return digits;
}

export function parseCurrencyInput(value) {
  return String(value).replace(/[^0-9.]/g, "");
}
