"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

// ─── STYLES ────────────────────────────────────────────────

export async function loadStyles() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_style")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── LEG TYPES ─────────────────────────────────────────────

export async function loadLegTypes() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_leg_type")
    .select("*")
    .order("leg_type_id", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── STRUCTURE SIZES ──────────────────────────────────────────────
// Distinct structure sizes (style + width x length) used as options in
// the Leg Height pricing editor (from the Base Structure matrix). Each
// option is a style–size combo so the dropdown can render
// "Style Name - Size" (e.g. "A-Frame Vertical - 12 x 20").
export async function loadStructureSizes() {
  const supabase = getSupabaseAdmin();
  const sizes = [];
  const seen = new Set();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("metal_m_feature_matrix_price")
      .select("matrix_price_id, width, length, style_id, metal_s_style(name)")
      .eq("feature_id", 1)
      .eq("is_active", true)
      .not("width", "is", null)
      .not("length", "is", null)
      .order("width", { ascending: true })
      .order("length", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const styleName = row.metal_s_style?.name ?? "";
      const key = `${row.style_id ?? "none"}|${row.width}x${row.length}`;
      if (!seen.has(key)) {
        seen.add(key);
        const label = styleName ? `${styleName} - ${row.width} x ${row.length}` : `${row.width} x ${row.length}`;
        sizes.push({ matrix_price_id: row.matrix_price_id, width: row.width, length: row.length, style_id: row.style_id, style_name: styleName, label });
      }
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return sizes;
}

// ─── REGIONS ───────────────────────────────────────────────

export async function loadRegions() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_region")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── ZIP CODE → REGION LOOKUP ───────────────────────────────

/**
 * Look up a region by a US ZIP code.
 *
 * `metal_s_zip_codes.region_id` is a direct FK → `metal_s_region(region_id)`.
 *
 * Flow:
 *   1. Normalize input to 5 digits → invalid if not possible.
 *   2. metal_s_zip_codes  → { region_id, city, county, metal_s_region(*) }
 *   3. Resolve the linked region (kept only when active).
 *
 * Returns a shape like:
 *   { ok: true, zipCode, regionId, city, county, region }
 *   { ok: false, reason: "invalid" | "not_found" }
 *
 * `region` is a full region row (with `.multiplier`) or null when the
 * linked region is inactive/missing (default pricing multiplier applies).
 */
export async function findRegionByZipCode(zipCode) {
  const supabase = getSupabaseAdmin();
  const digits = String(zipCode ?? "").replace(/\D/g, "").slice(0, 5);

  if (digits.length !== 5) {
    return { ok: false, reason: "invalid" };
  }

  // ZIP → region (embedded via FK join)
  const zipRes = await supabase
    .from("metal_s_zip_codes")
    .select("region_id, city, county, metal_s_region(*)")
    .eq("zip_code", digits)
    .maybeSingle();
  if (zipRes.error) throw new Error(zipRes.error.message);
  if (!zipRes.data) return { ok: false, reason: "not_found" };

  const rawRegion = zipRes.data.metal_s_region ?? null;
  const region = rawRegion && rawRegion.is_active !== false ? rawRegion : null;

  return {
    ok: true,
    zipCode: digits,
    regionId: zipRes.data.region_id ?? null,
    city: zipRes.data.city ?? null,
    county: zipRes.data.county ?? null,
    region,
  };
}

// ─── FEATURES ──────────────────────────────────────────────

export async function loadPricingTypes() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_pricing_type")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadCategories() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_category")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadFeatures() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_feature")
    .select("*, metal_s_pricing_type(pricing_type_id, code, label), metal_s_category(category_id, name)")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => ({
    ...f,
    pricing_type: f.metal_s_pricing_type?.code ?? f.pricing_type,
    pricing_type_label: f.metal_s_pricing_type?.label ?? f.pricing_type,
    category_name: f.metal_s_category?.name ?? f.category ?? "—",
  }));
}

export async function createFeature(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_feature")
    .insert({
      name: payload.name,
      pricing_type_id: payload.pricing_type_id,
      description: payload.description || null,
      category_id: payload.category_id || null,
      is_required: payload.is_required ?? false,
      sort_order: payload.sort_order ?? 0,
      is_active: payload.is_active ?? true,
    })
    .select("*, metal_s_pricing_type(pricing_type_id, code, label), metal_s_category(category_id, name)")
    .single();
  if (error) throw new Error(error.message);
  return {
    ...data,
    pricing_type: data.metal_s_pricing_type?.code ?? data.pricing_type,
    pricing_type_label: data.metal_s_pricing_type?.label ?? data.pricing_type,
    category_name: data.metal_s_category?.name ?? data.category ?? "—",
  };
}

export async function updateFeature(featureId, updates) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_feature")
    .update(updates)
    .eq("feature_id", featureId)
    .select("*, metal_s_pricing_type(pricing_type_id, code, label), metal_s_category(category_id, name)")
    .single();
  if (error) throw new Error(error.message);
  return {
    ...data,
    pricing_type: data.metal_s_pricing_type?.code ?? data.pricing_type,
    pricing_type_label: data.metal_s_pricing_type?.label ?? data.pricing_type,
    category_name: data.metal_s_category?.name ?? data.category ?? "—",
  };
}

export async function deleteFeature(featureId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_s_feature")
    .update({ is_active: false })
    .eq("feature_id", featureId);
  if (error) throw new Error(error.message);
}

// ─── MATRIX PRICES ─────────────────────────────────────────

export async function loadMatrixPrices(featureId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_feature_matrix_price")
    .select("*, metal_s_style(name)")
    .eq("feature_id", featureId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row, style_name: row.metal_s_style?.name ?? "—" }));
}

export async function upsertMatrixPrice(row) {
  const supabase = getSupabaseAdmin();
  const payload = {
    style_id: row.style_id,
    width: row.width,
    length: row.length,
    height: row.height,
    width_max: row.width_max,
    length_max: row.length_max,
    roof_stye: row.roof_stye,
    base_price: row.base_price,
    leg_height_price: row.leg_height_price,
    enclosed_sides_price: row.enclosed_sides_price,
    enclosed_ends_price: row.enclosed_ends_price,
  };
  if (row.matrix_price_id) {
    const { data, error } = await supabase
      .from("metal_m_feature_matrix_price")
      .update(payload)
      .eq("matrix_price_id", row.matrix_price_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_m_feature_matrix_price")
    .insert({ feature_id: row.feature_id, ...payload })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteMatrixPrice(matrixPriceId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_m_feature_matrix_price")
    .update({ is_active: false })
    .eq("matrix_price_id", matrixPriceId);
  if (error) throw new Error(error.message);
}

// ─── REGION PRICE MATRIX ────────────────────────────────────

/**
 * Load region mappings for a single matrix price row.
 * Joins metal_s_region for display (name, state_code, multiplier).
 */
export async function loadRegionPriceMatrix(matrixPriceId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_region_price_matrix")
    .select("*, metal_s_region(name, state_code, multiplier)")
    .eq("matrix_price_id", matrixPriceId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    region_id: row.region_id,
    matrix_price_id: row.matrix_price_id,
    region_name: row.metal_s_region?.name ?? null,
    state_code: row.metal_s_region?.state_code ?? null,
  }));
}

/**
 * Bulk-load region mappings for multiple matrix price rows.
 * Returns a Map: { matrix_price_id → Set<region_id> }
 */
export async function bulkLoadRegionPriceMatrix(matrixPriceIds) {
  if (!matrixPriceIds || matrixPriceIds.length === 0) return {};
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_region_price_matrix")
    .select("id, region_id, matrix_price_id")
    .in("matrix_price_id", matrixPriceIds);
  if (error) throw new Error(error.message);

  const map = {};
  for (const row of data ?? []) {
    const key = row.matrix_price_id;
    if (!map[key]) map[key] = [];
    map[key].push(row.region_id);
  }
  return map;
}

export async function insertRegionPriceMatrix(regionId, matrixPriceId) {
  if (!regionId) throw new Error("region_id is required.");
  if (!matrixPriceId) throw new Error("matrix_price_id is required.");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_region_price_matrix")
    .insert({ region_id: regionId, matrix_price_id: matrixPriceId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRegionPriceMatrix(regionId, matrixPriceId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_m_region_price_matrix")
    .delete()
    .eq("region_id", regionId)
    .eq("matrix_price_id", matrixPriceId);
  if (error) throw new Error(error.message);
}

// ─── LEG HEIGHT PRICING ────────────────────────────────────
// Rows live in metal_m_leg_price_matrix, scoped by leg type and
// a length range (min_length / max_length). Leg type references metal_s_leg_type.

export async function loadLegHeightPrices() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_leg_price_matrix")
    .select("*")
    .order("min_length", { ascending: true })
    .order("max_length", { ascending: true })
    .order("leg_height", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertLegHeightPrice(row) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const payload = {
    leg_type_id: row.leg_type_id,
    leg_height: row.leg_height,
    price: row.price,
    min_length: row.min_length ?? null,
    max_length: row.max_length ?? null,
  };
  if (row.leg_matrix_id) {
    const { data, error } = await supabase
      .from("metal_m_leg_price_matrix")
      .update({ ...payload, modified_at: now })
      .eq("leg_matrix_id", row.leg_matrix_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_m_leg_price_matrix")
    .insert({ ...payload, created_at: now, modified_at: now })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteLegHeightPrice(legMatrixId) {
  const supabase = getSupabaseAdmin();
  const { error: linkError } = await supabase
    .from("metal_m_region_legprice_matrix")
    .delete()
    .eq("leg_matrix_id", legMatrixId);
  if (linkError) throw new Error(linkError.message);
  const { error } = await supabase
    .from("metal_m_leg_price_matrix")
    .delete()
    .eq("leg_matrix_id", legMatrixId);
  if (error) throw new Error(error.message);
}

export async function bulkLoadRegionLegPriceMatrix(legMatrixIds) {
  if (!legMatrixIds || legMatrixIds.length === 0) return {};
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_region_legprice_matrix")
    .select("region_id, leg_matrix_id")
    .in("leg_matrix_id", legMatrixIds);
  if (error) throw new Error(error.message);
  const map = {};
  for (const row of data ?? []) {
    const key = row.leg_matrix_id;
    if (!map[key]) map[key] = [];
    map[key].push(row.region_id);
  }
  return map;
}

export async function insertRegionLegPriceMatrix(regionId, legMatrixId) {
  if (!regionId) throw new Error("region_id is required.");
  if (!legMatrixId) throw new Error("leg_matrix_id is required.");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_region_legprice_matrix")
    .insert({ region_id: regionId, leg_matrix_id: legMatrixId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRegionLegPriceMatrix(regionId, legMatrixId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_m_region_legprice_matrix")
    .delete()
    .eq("region_id", regionId)
    .eq("leg_matrix_id", legMatrixId);
  if (error) throw new Error(error.message);
}

// ─── REGION FEATURE OPTION ─────────────────────────────────

/**
 * Bulk-load region mappings for multiple feature option rows.
 * Returns a Map: { option_id → region_id[] }
 */
export async function bulkLoadRegionFeatureOption(optionIds) {
  if (!optionIds || optionIds.length === 0) return {};
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_region_feature_option")
    .select("id, region_id, option_id")
    .in("option_id", optionIds);
  if (error) throw new Error(error.message);

  const map = {};
  for (const row of data ?? []) {
    const key = row.option_id;
    if (!map[key]) map[key] = [];
    map[key].push(row.region_id);
  }
  return map;
}

export async function insertRegionFeatureOption(regionId, optionId) {
  if (!regionId) throw new Error("region_id is required.");
  if (!optionId) throw new Error("option_id is required.");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_region_feature_option")
    .insert({ region_id: regionId, option_id: optionId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRegionFeatureOption(regionId, optionId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_m_region_feature_option")
    .delete()
    .eq("region_id", regionId)
    .eq("option_id", optionId);
  if (error) throw new Error(error.message);
}


/**
 * Look up a roof-style base price from the metal_m_feature_matrix_price table.
 *
 * Matches the Roof Style feature by roof_stye (Horizontal/Vertical), width/length
 * ranges, and optional region mappings. Returns the matching row base_price or
 * null if no match.
 */
export async function lookupRoofStyleBasePrice({ roofStyle, width, length, regionId }) {
  const supabase = getSupabaseAdmin();

  // Find the Roof Style feature
  const { data: featureRows, error: featureErr } = await supabase
    .from("metal_s_feature")
    .select("feature_id")
    .ilike("name", "Roof Style")
    .eq("is_active", true)
    .limit(1);
  if (featureErr) throw new Error(featureErr.message);
  const roofStyleFeatureId = featureRows?.[0]?.feature_id;
  if (!roofStyleFeatureId) return null;

  // Build candidate query with range matching
  let query = supabase
    .from("metal_m_feature_matrix_price")
    .select("*, metal_m_region_price_matrix(region_id)")
    .eq("feature_id", roofStyleFeatureId)
    .eq("is_active", true)
    .ilike("roof_stye", roofStyle)
    .lte("width", width)
    .or(`width_max.gte.${width},width_max.is.null`)
    .lte("length", length)
    .or(`length_max.gte.${length},length_max.is.null`);

  const { data: candidates, error } = await query;
  if (error) throw new Error(error.message);

  const rows = candidates ?? [];

  // Prefer rows mapped to the selected region; fall back to rows with no region restrictions
  const regionMapped = rows.filter((r) =>
    (r.metal_m_region_price_matrix ?? []).some((m) => m.region_id === regionId)
  );
  const unrestricted = rows.filter((r) => !(r.metal_m_region_price_matrix ?? []).length);

  const match = regionMapped[0] ?? unrestricted[0] ?? null;
  if (!match) return null;

  return {
    base_price: Number(match.base_price),
    matrix_price_id: match.matrix_price_id,
    source: regionMapped.length ? "region" : "unrestricted",
  };
}

/**
 * Look up a region-specific base price from the view.
 *
 * Queries metal_vw_region_feature_price_matrix for a matching row
 * based on region_id, style_id, width, and length.
 * Height is not part of the lookup; when multiple height rows exist,
 * the lowest-height row is used as the base structure price.
 *
 * Returns { base_price, leg_height_price, enclosed_sides_price,
 *            enclosed_ends_price, region_multiplier, region_name }
 * or null if no matching price.
 */
export async function lookupRegionBasePrice({ featureId, regionId, styleId, width, length }) {
  const supabase = getSupabaseAdmin();

  // 1. Try region-specific match via the view.
  //    Height is intentionally not a filter; we pick the lowest-height row
  //    as the base structure price and let the separate leg-height price
  //    cover height upgrades.
  const { data: regionMatch, error: regionErr } = await supabase
    .from("metal_vw_region_feature_price_matrix")
    .select("*")
    .eq("region_id", regionId)
    .eq("feature_id", featureId)
    .eq("style_id", styleId)
    .eq("width", width)
    .eq("length", length)
    .eq("price_is_active", true)
    .order("height", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (regionErr) throw new Error(regionErr.message);
  if (regionMatch) {
    return {
      base_price: regionMatch.base_price,
      leg_height_price: regionMatch.leg_height_price,
      enclosed_sides_price: regionMatch.enclosed_sides_price,
      enclosed_ends_price: regionMatch.enclosed_ends_price,
      region_multiplier: regionMatch.region_multiplier,
      region_name: regionMatch.region_name,
      source: "region",
    };
  }

  // No region-specific match found — pricing requires region + style to be configured
  return null;
}

/**
 * Look up a leg-height price from the metal_vw_leg_price_lookup view.
 *
 * Scoped by region + leg type + leg height, and matches the building length
 * against each row's min_length / max_length range.
 * Returns { leg_price, leg_matrix_id, leg_type_id, region_multiplier,
 * source } or null when no matching price exists.
 */
export async function lookupLegHeightPrice({ regionId, length, legHeight, legTypeId }) {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("metal_vw_leg_price_lookup")
    .select("*")
    .eq("region_id", regionId)
    .eq("region_is_active", true)
    .eq("leg_height", legHeight);

  if (legTypeId != null) {
    query = query.eq("leg_type_id", legTypeId);
  }

  // Match the building length against the row's min/max length range.
  // A null bound is treated as unbounded so length-only rows still match.
  if (length != null && length !== "") {
    const len = Number(length);
    if (Number.isFinite(len)) {
      query = query
        .or(`min_length.is.null,min_length.lte.${len}`)
        .or(`max_length.is.null,max_length.gte.${len}`);
    }
  }

  const { data, error } = await query
    .order("leg_type_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Surface the exact Supabase error in server logs so we know whether the
    // view is missing, a column name is wrong, RLS is blocking, etc.
     
    console.error("[lookupLegHeightPrice] Supabase error", {
      regionId,
      length,
      legHeight,
      legTypeId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(`lookupLegHeightPrice failed: ${error.message} (${error.code})`);
  }

  if (!data) return null;

  return {
    leg_price: Number(data.base_price ?? 0),
    leg_matrix_id: data.leg_matrix_id,
    leg_type_id: data.leg_type_id,
    region_multiplier: data.region_multiplier,
    source: "region",
  };
}

// ─── PANEL LOCATIONS ───────────────────────────────────────

export async function loadPanelLocations(featureId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_panel_location")
    .select("*")
    .eq("feature_id", featureId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertPanelLocation(row) {
  const supabase = getSupabaseAdmin();
  if (row.location_id) {
    const { data, error } = await supabase
      .from("metal_s_panel_location")
      .update({ name: row.name, location_type: row.location_type, sort_order: row.sort_order ?? 0 })
      .eq("location_id", row.location_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_s_panel_location")
    .insert({ feature_id: row.feature_id, name: row.name, location_type: row.location_type, sort_order: row.sort_order ?? 0 })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ─── PANEL OPTIONS ─────────────────────────────────────────

export async function loadPanelOptions(featureId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_panel_option")
    .select("*")
    .eq("feature_id", featureId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertPanelOption(row) {
  const supabase = getSupabaseAdmin();
  if (row.option_id) {
    const payload = { name: row.name, price_per_foot: row.price_per_foot, location_type: row.location_type };
    if (row.sort_order !== undefined) payload.sort_order = row.sort_order;
    const { data, error } = await supabase
      .from("metal_s_panel_option")
      .update(payload)
      .eq("option_id", row.option_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_s_panel_option")
    .insert({ feature_id: row.feature_id, location_type: row.location_type, name: row.name, price_per_foot: row.price_per_foot, sort_order: row.sort_order ?? 0 })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePanelOption(optionId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_s_panel_option")
    .update({ is_active: false })
    .eq("option_id", optionId);
  if (error) throw new Error(error.message);
}

// ─── PANEL PRICING ─────────────────────────────────────────
// Matrix pricing for the "Sides & Ends" feature: each row maps a
// panel type + width + length to a price, and can be linked to regions
// via metal_m_region_panelprice_matrix.

export async function loadPanelTypes() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_panel_type")
    .select("*")
    .order("panel_type_id", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadPanelPricing(featureid) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_panel_pricing")
    .select("*, metal_s_panel_type(panel_name, location_type)")
    .eq("feature_id", featureid)
    .order("panel_type_id", { ascending: true })
    .order("width", { ascending: true })
    .order("height", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...row,
    panel_type_name: row.metal_s_panel_type?.panel_name ?? "—",
  }));
}

export async function upsertPanelPricing(row) {
  const supabase = getSupabaseAdmin();
  const payload = {
    feature_id: row.feature_id,
    panel_type_id: row.panel_type_id,
    width: row.width,
    height: row.height,
    price: row.price,
    siding_style: row.siding_style,
  };
  if (row.panel_pricing_id) {
    const { data, error } = await supabase
      .from("metal_m_panel_pricing")
      .update(payload)
      .eq("panel_pricing_id", row.panel_pricing_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_m_panel_pricing")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePanelPricing(panelPricingId) {
  const supabase = getSupabaseAdmin();
  const { error: linkError } = await supabase
    .from("metal_m_region_panelprice_matrix")
    .delete()
    .eq("panel_pricing_id", panelPricingId);
  if (linkError) throw new Error(linkError.message);
  const { error } = await supabase
    .from("metal_m_panel_pricing")
    .delete()
    .eq("panel_pricing_id", panelPricingId);
  if (error) throw new Error(error.message);
}

export async function bulkLoadRegionPanelPriceMatrix(panelPricingIds) {
  if (!panelPricingIds || panelPricingIds.length === 0) return {};
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_region_panelprice_matrix")
    .select("region_id, panel_pricing_id")
    .in("panel_pricing_id", panelPricingIds);
  if (error) throw new Error(error.message);
  const map = {};
  for (const row of data ?? []) {
    const key = row.panel_pricing_id;
    if (!map[key]) map[key] = [];
    map[key].push(row.region_id);
  }
  return map;
}

export async function insertRegionPanelPriceMatrix(regionId, panelPricingId) {
  if (!regionId) throw new Error("region_id is required.");
  if (!panelPricingId) throw new Error("panel_pricing_id is required.");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_region_panelprice_matrix")
    .insert({ region_id: regionId, panel_pricing_id: panelPricingId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRegionPanelPriceMatrix(regionId, panelPricingId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_m_region_panelprice_matrix")
    .delete()
    .eq("region_id", regionId)
    .eq("panel_pricing_id", panelPricingId);
  if (error) throw new Error(error.message);
}

// ─── RATES ─────────────────────────────────────────────────

export async function loadRate(featureId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_feature_rate")
    .select("*")
    .eq("feature_id", featureId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertRate(row) {
  const supabase = getSupabaseAdmin();
  if (row.rate_id) {
    const { data, error } = await supabase
      .from("metal_m_feature_rate")
      .update({ rate: row.rate, unit: row.unit })
      .eq("rate_id", row.rate_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_m_feature_rate")
    .insert({ feature_id: row.feature_id, rate: row.rate, unit: row.unit })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ─── FIXED OPTIONS ─────────────────────────────────────────

export async function loadOptions(featureId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_feature_option")
    .select("*")
    .eq("feature_id", featureId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertOption(row) {
  const supabase = getSupabaseAdmin();
  if (row.option_id) {
    const payload = { name: row.name, price: row.price };
    if (row.sort_order !== undefined) payload.sort_order = row.sort_order;
    if (row.with_min !== undefined) payload.with_min = row.with_min;
    if (row.with_max !== undefined) payload.with_max = row.with_max;
    if (row.length_min !== undefined) payload.length_min = row.length_min;
    if (row.lenght_max !== undefined) payload.lenght_max = row.lenght_max;
    const { data, error } = await supabase
      .from("metal_s_feature_option")
      .update(payload)
      .eq("option_id", row.option_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_s_feature_option")
    .insert({
      feature_id: row.feature_id,
      name: row.name,
      price: row.price,
      sort_order: row.sort_order ?? 0,
      with_min: row.with_min ?? null,
      with_max: row.with_max ?? null,
      length_min: row.length_min ?? null,
      lenght_max: row.lenght_max ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteOption(optionId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_s_feature_option")
    .update({ is_active: false })
    .eq("option_id", optionId);
  if (error) throw new Error(error.message);
}

// ─── CONFIGURATOR (load all active features + pricing) ─────

export async function loadConfiguratorData() {
  const supabase = getSupabaseAdmin();

  // Load styles, regions, and features in parallel
  const [stylesRes, regionsRes, featuresRes] = await Promise.all([
    supabase.from("metal_s_style").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_region").select("*").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("metal_s_feature").select("*, metal_s_pricing_type(pricing_type_id, code, label), metal_s_category(category_id, name)").eq("is_active", true).order("sort_order", { ascending: true }),
  ]);

  if (stylesRes.error) throw new Error(stylesRes.error.message);
  if (regionsRes.error) throw new Error(regionsRes.error.message);
  if (featuresRes.error) throw new Error(featuresRes.error.message);

  const features = (featuresRes.data ?? []).map((f) => ({
    ...f,
    pricing_type: f.metal_s_pricing_type?.code ?? null,
    category: f.metal_s_category?.name ?? null,
  }));
  const featureIds = features.map((f) => f.feature_id);
  if (featureIds.length === 0) return { styles: stylesRes.data ?? [], regions: regionsRes.data ?? [], features: [], matrixPrices: [], legHeightPrices: [], panelLocations: [], panelOptions: [], rates: [], options: [] };

  const [matrixRes, panelLocRes, panelOptRes, rateRes, optionRes, doorWindowRes, colorGroupRes, colorOptionRes, leantoStylesRes, leantoSidesRes, leantoPricesRes, leantoCompatRes, styleDefaultsRes, legHeightRes] = await Promise.all([
    supabase.from("metal_m_feature_matrix_price").select("*").in("feature_id", featureIds).eq("is_active", true),
    supabase.from("metal_s_panel_location").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_panel_option").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_m_feature_rate").select("*").in("feature_id", featureIds).eq("is_active", true),
    supabase.from("metal_s_feature_option").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_door_window_item").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_color_group").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_color_option").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_leanto_style").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_leanto_side").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_m_leanto_price").select("*").eq("is_active", true),
    supabase.from("metal_m_leanto_style_compat").select("*").eq("is_active", true),
    supabase.from("metal_s_style_default").select("*").eq("is_active", true),
    supabase.from("metal_m_leg_price_matrix").select("leg_matrix_id, leg_height, price, leg_type_id, min_length, max_length").order("min_length", { ascending: true }).order("max_length", { ascending: true }).order("leg_height", { ascending: true }),
  ]);

  if (matrixRes.error) throw new Error(matrixRes.error.message);
  if (panelLocRes.error) throw new Error(panelLocRes.error.message);
  if (panelOptRes.error) throw new Error(panelOptRes.error.message);
  if (rateRes.error) throw new Error(rateRes.error.message);
  if (optionRes.error) throw new Error(optionRes.error.message);
  if (doorWindowRes.error) throw new Error(doorWindowRes.error.message);
  if (colorGroupRes.error) throw new Error(colorGroupRes.error.message);
  if (colorOptionRes.error) throw new Error(colorOptionRes.error.message);
  if (leantoStylesRes.error) throw new Error(leantoStylesRes.error.message);
  if (leantoSidesRes.error) throw new Error(leantoSidesRes.error.message);
  if (leantoPricesRes.error) throw new Error(leantoPricesRes.error.message);
  if (leantoCompatRes.error) throw new Error(leantoCompatRes.error.message);
  if (styleDefaultsRes.error) throw new Error(styleDefaultsRes.error.message);
  if (legHeightRes.error) throw new Error(legHeightRes.error.message);

  return {
    styles: stylesRes.data ?? [],
    regions: regionsRes.data ?? [],
    features: features,
    matrixPrices: matrixRes.data ?? [],
    panelLocations: panelLocRes.data ?? [],
    panelOptions: panelOptRes.data ?? [],
    rates: rateRes.data ?? [],
    options: optionRes.data ?? [],
    doorWindowItems: doorWindowRes.data ?? [],
    colorGroups: colorGroupRes.data ?? [],
    colorOptions: colorOptionRes.data ?? [],
    leantoStyles: leantoStylesRes.data ?? [],
    leantoSides: leantoSidesRes.data ?? [],
    leantoPrices: leantoPricesRes.data ?? [],
    leantoCompat: leantoCompatRes.data ?? [],
    styleDefaults: styleDefaultsRes.data ?? [],
    legHeightPrices: (legHeightRes.data ?? []).map((r) => ({
      leg_matrix_id: r.leg_matrix_id,
      leg_height: r.leg_height,
      leg_type_id: r.leg_type_id,
      price: r.price,
      min_length: r.min_length,
      max_length: r.max_length,
    })),
  };
}

// ─── COLOR GROUPS ──────────────────────────────────────────

export async function loadColorGroups(featureId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_color_group")
    .select("*")
    .eq("feature_id", featureId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertColorGroup(row) {
  const supabase = getSupabaseAdmin();
  if (row.color_group_id) {
    const { data, error } = await supabase
      .from("metal_s_color_group")
      .update({ name: row.name, sort_order: row.sort_order ?? 0 })
      .eq("color_group_id", row.color_group_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_s_color_group")
    .insert({ feature_id: row.feature_id, name: row.name, sort_order: row.sort_order ?? 0 })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteColorGroup(colorGroupId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_s_color_group")
    .update({ is_active: false })
    .eq("color_group_id", colorGroupId);
  if (error) throw new Error(error.message);
}

// ─── COLOR OPTIONS ─────────────────────────────────────────

export async function loadColorOptions(colorGroupId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_color_option")
    .select("*")
    .eq("color_group_id", colorGroupId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertColorOption(row) {
  const supabase = getSupabaseAdmin();
  if (row.color_option_id) {
    const { data, error } = await supabase
      .from("metal_s_color_option")
      .update({ name: row.name, hex_code: row.hex_code, upcharge: row.upcharge, sort_order: row.sort_order ?? 0 })
      .eq("color_option_id", row.color_option_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_s_color_option")
    .insert({ color_group_id: row.color_group_id, name: row.name, hex_code: row.hex_code, upcharge: row.upcharge ?? 0, sort_order: row.sort_order ?? 0 })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteColorOption(colorOptionId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_s_color_option")
    .update({ is_active: false })
    .eq("color_option_id", colorOptionId);
  if (error) throw new Error(error.message);
}

// ─── LEAN-TO STYLES ────────────────────────────────────────

export async function loadLeantoStyles() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_leanto_style")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertLeantoStyle(row) {
  const supabase = getSupabaseAdmin();
  if (row.leanto_style_id) {
    const { data, error } = await supabase
      .from("metal_s_leanto_style")
      .update({ name: row.name, description: row.description, render_key: row.render_key, default_slope: row.default_slope, sort_order: row.sort_order ?? 0 })
      .eq("leanto_style_id", row.leanto_style_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_s_leanto_style")
    .insert({ name: row.name, description: row.description, render_key: row.render_key, default_slope: row.default_slope, sort_order: row.sort_order ?? 0 })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteLeantoStyle(leantoStyleId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_s_leanto_style")
    .update({ is_active: false })
    .eq("leanto_style_id", leantoStyleId);
  if (error) throw new Error(error.message);
}

// ─── LEAN-TO SIDES ─────────────────────────────────────────

export async function loadLeantoSides() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_leanto_side")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── LEAN-TO MATRIX PRICING ────────────────────────────────

export async function loadLeantoPrices(leantoStyleId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_leanto_price")
    .select("*")
    .eq("leanto_style_id", leantoStyleId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertLeantoPrice(row) {
  const supabase = getSupabaseAdmin();
  if (row.leanto_price_id) {
    const { data, error } = await supabase
      .from("metal_m_leanto_price")
      .update({ leanto_style_id: row.leanto_style_id, style_id: row.style_id, width_ft: row.width_ft, height_ft: row.height_ft, length_ft: row.length_ft, price: row.price })
      .eq("leanto_price_id", row.leanto_price_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_m_leanto_price")
    .insert({ leanto_style_id: row.leanto_style_id, style_id: row.style_id, width_ft: row.width_ft, height_ft: row.height_ft, length_ft: row.length_ft, price: row.price })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteLeantoPrice(leantoPriceId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_m_leanto_price")
    .update({ is_active: false })
    .eq("leanto_price_id", leantoPriceId);
  if (error) throw new Error(error.message);
}

// ─── LEAN-TO STYLE COMPATIBILITY ───────────────────────────

export async function loadLeantoCompat(leantoStyleId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_leanto_style_compat")
    .select("*")
    .eq("leanto_style_id", leantoStyleId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertLeantoCompat(row) {
  const supabase = getSupabaseAdmin();
  if (row.compat_id) {
    const { data, error } = await supabase
      .from("metal_m_leanto_style_compat")
      .update({ leanto_style_id: row.leanto_style_id, style_id: row.style_id, is_active: row.is_active ?? true })
      .eq("compat_id", row.compat_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_m_leanto_style_compat")
    .insert({ leanto_style_id: row.leanto_style_id, style_id: row.style_id })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteLeantoCompat(compatId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_m_leanto_style_compat")
    .update({ is_active: false })
    .eq("compat_id", compatId);
  if (error) throw new Error(error.message);
}

// ─── DOOR / WINDOW ITEMS ───────────────────────────────────

export async function loadDoorWindowItems(featureId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_door_window_item")
    .select("*")
    .eq("feature_id", featureId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadDoorWindowItemsByType(itemType) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_door_window_item")
    .select("*")
    .eq("item_type", itemType)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertDoorWindowItem(row) {
  const supabase = getSupabaseAdmin();
  const payload = {
    feature_id: row.feature_id,
    name: row.name,
    item_type: row.item_type,
    price: row.price,
    description: row.description ?? null,
    sort_order: row.sort_order ?? 0,
  };
  if (row.item_id) {
    const { data, error } = await supabase
      .from("metal_s_door_window_item")
      .update(payload)
      .eq("item_id", row.item_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_s_door_window_item")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteDoorWindowItem(itemId) {
  const supabase = getSupabaseAdmin();
  const { error: linkError } = await supabase
    .from("metal_m_region_door_window")
    .delete()
    .eq("item_id", itemId);
  if (linkError) throw new Error(linkError.message);
  const { error } = await supabase
    .from("metal_s_door_window_item")
    .update({ is_active: false })
    .eq("item_id", itemId);
  if (error) throw new Error(error.message);
}

// ─── REGION DOOR / WINDOW ──────────────────────────────────

export async function bulkLoadRegionDoorWindow(itemIds) {
  if (!itemIds || itemIds.length === 0) return {};
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_region_door_window")
    .select("region_id, item_id")
    .in("item_id", itemIds);
  if (error) throw new Error(error.message);
  const map = {};
  for (const row of data ?? []) {
    const key = row.item_id;
    if (!map[key]) map[key] = [];
    map[key].push(row.region_id);
  }
  return map;
}

export async function insertRegionDoorWindow(regionId, itemId) {
  if (!regionId) throw new Error("region_id is required.");
  if (!itemId) throw new Error("item_id is required.");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_region_door_window")
    .insert({ region_id: regionId, item_id: itemId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRegionDoorWindow(regionId, itemId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("metal_m_region_door_window")
    .delete()
    .eq("region_id", regionId)
    .eq("item_id", itemId);
  if (error) throw new Error(error.message);
}
