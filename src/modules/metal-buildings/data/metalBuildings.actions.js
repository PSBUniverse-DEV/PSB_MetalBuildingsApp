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
  if (row.matrix_price_id) {
    const { data, error } = await supabase
      .from("metal_m_feature_matrix_price")
      .update({ style_id: row.style_id, width: row.width, length: row.length, height: row.height, price: row.price })
      .eq("matrix_price_id", row.matrix_price_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from("metal_m_feature_matrix_price")
    .insert({ feature_id: row.feature_id, style_id: row.style_id, width: row.width, length: row.length, height: row.height, price: row.price })
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
  if (featureIds.length === 0) return { styles: stylesRes.data ?? [], regions: regionsRes.data ?? [], features: [], matrixPrices: [], panelLocations: [], panelOptions: [], rates: [], options: [] };

  const [matrixRes, panelLocRes, panelOptRes, rateRes, optionRes, doorWindowRes, colorGroupRes, colorOptionRes, leantoStylesRes, leantoSidesRes, leantoPricesRes, leantoCompatRes] = await Promise.all([
    supabase.from("metal_m_feature_matrix_price").select("*").in("feature_id", featureIds).eq("is_active", true),
    supabase.from("metal_s_panel_location").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_panel_option").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_m_feature_rate").select("*").in("feature_id", featureIds).eq("is_active", true),
    supabase.from("metal_s_feature_option").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_door_window_item").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_color_group").select("*").in("feature_id", featureIds).eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_color_option").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_leanto_style").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_s_leanto_side").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("metal_m_leanto_price").select("*").eq("is_active", true),
    supabase.from("metal_m_leanto_style_compat").select("*").eq("is_active", true),
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
