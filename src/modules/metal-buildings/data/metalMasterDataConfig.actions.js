"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

// --- Private helpers ---

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeOptionalText(value) {
  const text = normalizeText(value);
  return text === "" ? null : text;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return !(text === "false" || text === "0" || text === "n" || text === "no" || text === "f");
}

function normalizeStateCode(value) {
  return normalizeText(value).toUpperCase().slice(0, 5);
}

function normalizeMultiplier(value) {
  const text = String(value ?? "").trim();
  if (text === "") return 1;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 1;
}

function normalizeZipCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 5);
  return digits.length === 5 ? digits : "";
}

function normalizeOptionalNumber(value) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSortOrder(value) {
  const text = String(value ?? "").trim();
  if (text === "") return 0;
  const parsed = parseInt(text, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// --- REGIONS ---

export async function loadAllRegions() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("metal_s_region")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message || "Failed to fetch regions");
  return { regions: Array.isArray(data) ? data : [] };
}

export async function createRegionAction(payload) {
  const supabase = getSupabaseAdmin();
  const name = normalizeText(payload?.name);
  if (!name) throw new Error("Region name is required.");
  const stateCode = normalizeStateCode(payload?.state_code);
  if (!stateCode) throw new Error("State code is required.");

  const insertPayload = {
    name,
    state_code: stateCode,
    multiplier: hasOwn(payload || {}, "multiplier") ? normalizeMultiplier(payload.multiplier) : 1,
    is_active: hasOwn(payload || {}, "is_active") ? normalizeBoolean(payload.is_active) : true,
  };

  const { data, error } = await supabase.from("metal_s_region").insert(insertPayload).select("*").single();
  if (error) throw new Error(error.message || "Failed to create region");
  return data;
}

export async function updateRegionAction(regionId, updates) {
  if (regionId == null || regionId === "") throw new Error("Region ID is required.");
  const supabase = getSupabaseAdmin();
  const patch = {};

  if (hasOwn(updates, "name")) {
    const name = normalizeText(updates.name);
    if (!name) throw new Error("Region name cannot be empty.");
    patch.name = name;
  }
  if (hasOwn(updates, "state_code")) {
    const stateCode = normalizeStateCode(updates.state_code);
    if (!stateCode) throw new Error("State code cannot be empty.");
    patch.state_code = stateCode;
  }
  if (hasOwn(updates, "multiplier")) patch.multiplier = normalizeMultiplier(updates.multiplier);
  if (hasOwn(updates, "is_active")) patch.is_active = normalizeBoolean(updates.is_active);
  if (Object.keys(patch).length === 0) throw new Error("No valid fields to update.");

  const { data, error } = await supabase.from("metal_s_region").update(patch).eq("region_id", regionId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update region");
  return data;
}

export async function deactivateRegionAction(regionId) {
  if (regionId == null || regionId === "") throw new Error("Region ID is required.");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("metal_s_region").update({ is_active: false }).eq("region_id", regionId).select("*").single();
  if (error) throw new Error(error.message || "Failed to deactivate region");
  return data;
}

export async function hardDeleteRegionAction(regionId) {
  if (regionId == null || regionId === "") throw new Error("Region ID is required.");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("metal_s_region").delete().eq("region_id", regionId);
  if (error) throw new Error(error.message || "Failed to permanently delete region");
  return { regionId, permanentlyDeleted: true };
}

// --- ZIP CODES ---

export async function loadAllZipCodes() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("metal_s_zip_codes")
    .select("*, metal_s_region(name, state_code)")
    .order("zip_code", { ascending: true });

  if (error) throw new Error(error.message || "Failed to fetch zip codes");
  return { zipCodes: Array.isArray(data) ? data : [] };
}

export async function createZipCodeAction(payload) {
  const supabase = getSupabaseAdmin();
  const zipCode = normalizeZipCode(payload?.zip_code);
  if (!zipCode) throw new Error("Zip code is required (5 digits).");
  const regionId = normalizeOptionalNumber(payload?.region_id);
  if (regionId == null) throw new Error("Region is required.");

  const insertPayload = {
    zip_code: zipCode,
    region_id: regionId,
    city: normalizeOptionalText(payload?.city),
    county: normalizeOptionalText(payload?.county),
    latitude: normalizeOptionalNumber(payload?.latitude),
    longitude: normalizeOptionalNumber(payload?.longitude),
    timezone: normalizeOptionalText(payload?.timezone),
  };

  const { data, error } = await supabase.from("metal_s_zip_codes").insert(insertPayload).select("*, metal_s_region(name, state_code)").single();
  if (error) throw new Error(error.message || "Failed to create zip code");
  return data;
}

export async function updateZipCodeAction(zipCode, updates) {
  const normalizedZip = normalizeZipCode(zipCode);
  if (!normalizedZip) throw new Error("Zip code is required.");
  const supabase = getSupabaseAdmin();
  const patch = {};

  if (hasOwn(updates, "region_id")) patch.region_id = normalizeOptionalNumber(updates.region_id);
  if (hasOwn(updates, "city")) patch.city = normalizeOptionalText(updates.city);
  if (hasOwn(updates, "county")) patch.county = normalizeOptionalText(updates.county);
  if (hasOwn(updates, "latitude")) patch.latitude = normalizeOptionalNumber(updates.latitude);
  if (hasOwn(updates, "longitude")) patch.longitude = normalizeOptionalNumber(updates.longitude);
  if (hasOwn(updates, "timezone")) patch.timezone = normalizeOptionalText(updates.timezone);
  if (Object.keys(patch).length === 0) throw new Error("No valid fields to update.");

  const { data, error } = await supabase.from("metal_s_zip_codes").update(patch).eq("zip_code", normalizedZip).select("*, metal_s_region(name, state_code)").single();
  if (error) throw new Error(error.message || "Failed to update zip code");
  return data;
}

export async function hardDeleteZipCodeAction(zipCode) {
  const normalizedZip = normalizeZipCode(zipCode);
  if (!normalizedZip) throw new Error("Zip code is required.");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("metal_s_zip_codes").delete().eq("zip_code", normalizedZip);
  if (error) throw new Error(error.message || "Failed to permanently delete zip code");
  return { zipCode: normalizedZip, permanentlyDeleted: true };
}

// --- CATEGORIES ---

export async function loadAllCategories() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("metal_s_category")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message || "Failed to fetch categories");
  return { categories: Array.isArray(data) ? data : [] };
}

export async function createCategoryAction(payload) {
  const supabase = getSupabaseAdmin();
  const name = normalizeText(payload?.name);
  if (!name) throw new Error("Category name is required.");

  let sortOrder = hasOwn(payload || {}, "sort_order") ? normalizeSortOrder(payload.sort_order) : 0;

  if (sortOrder <= 0) {
    const { data: existing } = await supabase.from("metal_s_category").select("sort_order");
    const maxOrder = (existing || []).reduce((max, row) => Math.max(max, Number(row?.sort_order || 0)), 0);
    sortOrder = maxOrder + 1;
  }

  const insertPayload = {
    name,
    description: normalizeOptionalText(payload?.description),
    sort_order: sortOrder,
    is_active: hasOwn(payload || {}, "is_active") ? normalizeBoolean(payload.is_active) : true,
  };

  const { data, error } = await supabase.from("metal_s_category").insert(insertPayload).select("*").single();
  if (error) throw new Error(error.message || "Failed to create category");
  return data;
}

export async function updateCategoryAction(categoryId, updates) {
  if (categoryId == null || categoryId === "") throw new Error("Category ID is required.");
  const supabase = getSupabaseAdmin();
  const patch = {};

  if (hasOwn(updates, "name")) {
    const name = normalizeText(updates.name);
    if (!name) throw new Error("Category name cannot be empty.");
    patch.name = name;
  }
  if (hasOwn(updates, "description")) patch.description = normalizeOptionalText(updates.description);
  if (hasOwn(updates, "sort_order")) patch.sort_order = normalizeSortOrder(updates.sort_order);
  if (hasOwn(updates, "is_active")) patch.is_active = normalizeBoolean(updates.is_active);
  if (Object.keys(patch).length === 0) throw new Error("No valid fields to update.");

  const { data, error } = await supabase.from("metal_s_category").update(patch).eq("category_id", categoryId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update category");
  return data;
}

export async function deactivateCategoryAction(categoryId) {
  if (categoryId == null || categoryId === "") throw new Error("Category ID is required.");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("metal_s_category").update({ is_active: false }).eq("category_id", categoryId).select("*").single();
  if (error) throw new Error(error.message || "Failed to deactivate category");
  return data;
}

export async function hardDeleteCategoryAction(categoryId) {
  if (categoryId == null || categoryId === "") throw new Error("Category ID is required.");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("metal_s_category").delete().eq("category_id", categoryId);
  if (error) throw new Error(error.message || "Failed to permanently delete category");
  return { categoryId, permanentlyDeleted: true };
}

// --- PANEL TYPES ---

export async function loadAllPanelTypes() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("metal_s_panel_type")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("panel_name", { ascending: true });

  if (error) throw new Error(error.message || "Failed to fetch panel types");
  return { panelTypes: Array.isArray(data) ? data : [] };
}

export async function createPanelTypeAction(payload) {
  const supabase = getSupabaseAdmin();
  const panelName = normalizeText(payload?.panel_name);
  if (!panelName) throw new Error("Panel name is required.");

  let sortOrder = hasOwn(payload || {}, "sort_order") ? normalizeSortOrder(payload.sort_order) : 0;

  if (sortOrder <= 0) {
    const { data: existing } = await supabase.from("metal_s_panel_type").select("sort_order");
    const maxOrder = (existing || []).reduce((max, row) => Math.max(max, Number(row?.sort_order || 0)), 0);
    sortOrder = maxOrder + 1;
  }

  const insertPayload = {
    panel_name: panelName,
    panel_description: normalizeOptionalText(payload?.panel_description),
    location_type: normalizeOptionalText(payload?.location_type),
    sort_order: sortOrder,
  };

  const { data, error } = await supabase.from("metal_s_panel_type").insert(insertPayload).select("*").single();
  if (error) throw new Error(error.message || "Failed to create panel type");
  return data;
}

export async function updatePanelTypeAction(panelTypeId, updates) {
  if (panelTypeId == null || panelTypeId === "") throw new Error("Panel Type ID is required.");
  const supabase = getSupabaseAdmin();
  const patch = {};

  if (hasOwn(updates, "panel_name")) {
    const panelName = normalizeText(updates.panel_name);
    if (!panelName) throw new Error("Panel name cannot be empty.");
    patch.panel_name = panelName;
  }
  if (hasOwn(updates, "panel_description")) patch.panel_description = normalizeOptionalText(updates.panel_description);
  if (hasOwn(updates, "location_type")) patch.location_type = normalizeOptionalText(updates.location_type);
  if (hasOwn(updates, "sort_order")) patch.sort_order = normalizeSortOrder(updates.sort_order);
  if (Object.keys(patch).length === 0) throw new Error("No valid fields to update.");

  const { data, error } = await supabase.from("metal_s_panel_type").update(patch).eq("panel_type_id", panelTypeId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update panel type");
  return data;
}

export async function hardDeletePanelTypeAction(panelTypeId) {
  if (panelTypeId == null || panelTypeId === "") throw new Error("Panel Type ID is required.");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("metal_s_panel_type").delete().eq("panel_type_id", panelTypeId);
  if (error) throw new Error(error.message || "Failed to permanently delete panel type");
  return { panelTypeId, permanentlyDeleted: true };
}