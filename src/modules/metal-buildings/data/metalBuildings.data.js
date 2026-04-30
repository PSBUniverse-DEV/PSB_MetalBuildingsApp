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

// ─── FORMATTERS ────────────────────────────────────────────

export function formatCurrency(value) {
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
