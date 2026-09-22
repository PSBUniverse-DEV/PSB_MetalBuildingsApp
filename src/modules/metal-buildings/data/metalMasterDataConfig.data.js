/**
 * Metal Master Data Config - Region + Zip Code data layer (client-safe utilities)
 *
 * Pure helpers shared between page and view:
 * - Model helpers (normalization, display)
 * - Utility functions
 * - Batch save orchestration (via Server Actions)
 */

import {
  createRegionAction,
  updateRegionAction,
  deactivateRegionAction,
  hardDeleteRegionAction,
  createZipCodeAction,
  updateZipCodeAction,
  hardDeleteZipCodeAction,
} from "./metalMasterDataConfig.actions.js";

// --- REGION MODEL HELPERS ---

export function isRegionActive(region) {
  if (region?.is_active === false || region?.is_active === 0) return false;
  const text = String(region?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function getRegionName(region) {
  return region?.name ?? "Unknown";
}

export function getRegionStateCode(region) {
  return region?.state_code ?? "--";
}

export function getRegionMultiplier(region) {
  const value = Number(region?.multiplier);
  return Number.isFinite(value) ? value : 1;
}

export function mapRegionRow(region, index) {
  return {
    ...region,
    id: region?.region_id ?? `region-${index}`,
    name: getRegionName(region),
    state_code: getRegionStateCode(region),
    multiplier: getRegionMultiplier(region),
    is_active_bool: isRegionActive(region),
  };
}

// --- ZIP CODE MODEL HELPERS ---

export function getZipCode(z) {
  return String(z?.zip_code ?? "").trim();
}

export function getZipRegionId(z) {
  return z?.region_id ?? null;
}

export function getZipRegionName(z) {
  return z?.metal_s_region?.name || z?.region_name || "";
}

export function getZipRegionStateCode(z) {
  return z?.metal_s_region?.state_code || z?.region_state_code || "";
}

export function getZipCity(z) {
  return z?.city ?? "";
}

export function getZipCounty(z) {
  return z?.county ?? "";
}

export function getZipLatitude(z) {
  const value = Number(z?.latitude);
  return Number.isFinite(value) ? value : null;
}

export function getZipLongitude(z) {
  const value = Number(z?.longitude);
  return Number.isFinite(value) ? value : null;
}

export function getZipTimezone(z) {
  return z?.timezone ?? "";
}

export function mapZipCodeRow(zipCode, index) {
  return {
    ...zipCode,
    id: zipCode?.zip_code ?? `zip-${index}`,
    zip_code: getZipCode(zipCode),
    region_id: getZipRegionId(zipCode),
    region_name: getZipRegionName(zipCode),
    region_state_code: getZipRegionStateCode(zipCode),
    city: getZipCity(zipCode),
    county: getZipCounty(zipCode),
    latitude: getZipLatitude(zipCode),
    longitude: getZipLongitude(zipCode),
    timezone: getZipTimezone(zipCode),
  };
}

// --- UTILITY HELPERS ---

export function isSameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

export function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function removeObjectKey(objectValue, keyToRemove) {
  const normalizedKey = String(keyToRemove ?? "");
  const nextObject = {};
  Object.entries(objectValue || {}).forEach(([key, value]) => {
    if (key !== normalizedKey) {
      nextObject[key] = value;
    }
  });
  return nextObject;
}

export function mergeUpdatePatch(previousPatch, nextPatch) {
  const mergedPatch = { ...(previousPatch || {}) };
  Object.entries(nextPatch || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      mergedPatch[key] = value;
    }
  });
  return mergedPatch;
}

export function appendUniqueId(idList, value) {
  const normalizedValue = String(value ?? "");
  if (!normalizedValue) return Array.isArray(idList) ? [...idList] : [];
  const existing = Array.isArray(idList) ? idList : [];
  if (existing.some((entry) => isSameId(entry, normalizedValue))) return [...existing];
  return [...existing, normalizedValue];
}

export const EMPTY_DIALOG = { kind: null, target: null, nextIsActive: null };
export const TEMP_REGION_PREFIX = "tmp-region-";

export function createTempId(prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isTempRegionId(value) {
  return String(value ?? "").startsWith(TEMP_REGION_PREFIX);
}

export function createEmptyRegionChanges() {
  return { creates: [], updates: {}, deactivations: [], hardDeletes: [] };
}

export function createEmptyZipCodeChanges() {
  return { creates: [], updates: {}, deletes: [] };
}

// --- BATCH SAVE (calls Server Actions) ---

export async function executeRegionBatchSave(regionChanges) {
  const deactivatedSet = new Set(
    [...(regionChanges.deactivations || []), ...(regionChanges.hardDeletes || [])].map((id) => String(id ?? "")),
  );
  const tempIdMap = new Map();

  for (const createEntry of regionChanges.creates || []) {
    const created = await createRegionAction(createEntry.payload);
    const createdId = created?.region_id;
    if (createdId === undefined || createdId === null || createdId === "") {
      throw new Error("Created region response is invalid.");
    }
    tempIdMap.set(String(createEntry.tempId), createdId);
  }

  for (const [regionId, updates] of Object.entries(regionChanges.updates || {})) {
    const resolvedRegionId = tempIdMap.get(String(regionId)) ?? regionId;
    if (deactivatedSet.has(String(resolvedRegionId))) continue;
    if (isTempRegionId(resolvedRegionId)) continue;
    if (Object.keys(updates || {}).length === 0) continue;
    await updateRegionAction(resolvedRegionId, updates);
  }

  for (const regionId of regionChanges.deactivations || []) {
    const resolvedRegionId = tempIdMap.get(String(regionId)) ?? regionId;
    if (isTempRegionId(resolvedRegionId)) continue;
    await deactivateRegionAction(resolvedRegionId);
  }

  for (const regionId of regionChanges.hardDeletes || []) {
    const resolvedRegionId = tempIdMap.get(String(regionId)) ?? regionId;
    if (isTempRegionId(resolvedRegionId)) continue;
    await hardDeleteRegionAction(resolvedRegionId);
  }
}

export async function executeZipCodeBatchSave(zipCodeChanges) {
  const deletedSet = new Set((zipCodeChanges.deletes || []).map((id) => String(id ?? "")));

  for (const createEntry of zipCodeChanges.creates || []) {
    await createZipCodeAction(createEntry.payload);
  }

  for (const [zipCode, updates] of Object.entries(zipCodeChanges.updates || {})) {
    if (deletedSet.has(String(zipCode))) continue;
    if (Object.keys(updates || {}).length === 0) continue;
    await updateZipCodeAction(zipCode, updates);
  }

  for (const zipCode of zipCodeChanges.deletes || []) {
    await hardDeleteZipCodeAction(zipCode);
  }
}