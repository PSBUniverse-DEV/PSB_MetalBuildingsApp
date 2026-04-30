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

// ─── FEATURES ──────────────────────────────────────────────

export async function loadFeatures() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_feature")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createFeature(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_feature")
    .insert({
      name: payload.name,
      pricing_type: payload.pricing_type,
      description: payload.description || null,
      category: payload.category || null,
      is_required: payload.is_required ?? false,
      sort_order: payload.sort_order ?? 0,
      is_active: payload.is_active ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateFeature(featureId, updates) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_s_feature")
    .update(updates)
    .eq("feature_id", featureId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ─── MATRIX PRICES ─────────────────────────────────────────

export async function loadMatrixPrices(featureId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("metal_m_feature_matrix_price")
    .select("*")
    .eq("feature_id", featureId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertMatrixPrice(row) {
  const supabase = getSupabaseAdmin();
  if (row.matrix_price_id) {
    const { data, error } = await supabase
      .from("metal_m_feature_matrix_price")
      .update({ width: row.width, length: row.length, height: row.height, price: row.price })
      .eq("matrix_price_id", row.matrix_price_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_m_feature_matrix_price")
    .insert({ feature_id: row.feature_id, width: row.width, length: row.length, height: row.height, price: row.price })
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
    const { data, error } = await supabase
      .from("metal_s_panel_option")
      .update({ name: row.name, price_per_foot: row.price_per_foot, location_type: row.location_type, sort_order: row.sort_order ?? 0 })
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
    const { data, error } = await supabase
      .from("metal_s_feature_option")
      .update({ name: row.name, price: row.price, sort_order: row.sort_order ?? 0 })
      .eq("option_id", row.option_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_s_feature_option")
    .insert({ feature_id: row.feature_id, name: row.name, price: row.price, sort_order: row.sort_order ?? 0 })
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
    supabase.from("metal_s_feature").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
  ]);

  if (stylesRes.error) throw new Error(stylesRes.error.message);
  if (regionsRes.error) throw new Error(regionsRes.error.message);
  if (featuresRes.error) throw new Error(featuresRes.error.message);

  const features = featuresRes.data ?? [];
  const featureIds = features.map((f) => f.feature_id);
  if (featureIds.length === 0) return { styles: stylesRes.data ?? [], regions: regionsRes.data ?? [], features: [], matrixPrices: [], panelLocations: [], panelOptions: [], rates: [], options: [] };

  const [matrixRes, panelLocRes, panelOptRes, rateRes, optionRes, doorWindowRes, colorGroupRes, colorOptionRes] = await Promise.all([
    supabase.from("metal_m_feature_matrix_price").select("*").in("feature_id", featureIds).eq("is_active", true),
    supabase.from("metal_s_panel_location").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_panel_option").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_m_feature_rate").select("*").in("feature_id", featureIds).eq("is_active", true),
    supabase.from("metal_s_feature_option").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_door_window_item").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_color_group").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_color_option").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
  ]);

  if (matrixRes.error) throw new Error(matrixRes.error.message);
  if (panelLocRes.error) throw new Error(panelLocRes.error.message);
  if (panelOptRes.error) throw new Error(panelOptRes.error.message);
  if (rateRes.error) throw new Error(rateRes.error.message);
  if (optionRes.error) throw new Error(optionRes.error.message);
  if (doorWindowRes.error) throw new Error(doorWindowRes.error.message);
  if (colorGroupRes.error) throw new Error(colorGroupRes.error.message);
  if (colorOptionRes.error) throw new Error(colorOptionRes.error.message);

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
  };
}
