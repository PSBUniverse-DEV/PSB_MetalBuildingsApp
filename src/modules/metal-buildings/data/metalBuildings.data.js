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
export function lookupLegHeightPrice(legHeightPrices, matrixPrices, featureId, styleId, width, length, height, legTypeId) {
  if (height == null) return 0;
  const len = Number(length);
  const h = Number(height);
  const match = (legHeightPrices ?? []).find((p) => {
    if (Number(p.leg_height) !== h) return false;
    if (legTypeId != null && Number(p.leg_type_id) !== Number(legTypeId)) return false;
    const min = p.min_length != null ? Number(p.min_length) : null;
    const max = p.max_length != null ? Number(p.max_length) : null;
    if (min != null && len < min) return false;
    if (max != null && len > max) return false;
    return true;
  });
  return match ? Number(match.price ?? 0) : 0;
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
