"use server";

/**
 * Master Data Config — Snow Load (public.metal_s_snowload_data).
 * zip_code is a bigint (leading zeros dropped). One row per ZIP is enforced
 * here (the configurator reads the newest row per ZIP).
 */

import zipcodes from "zipcodes-us";
import { getSupabaseAdmin } from "@/core/supabase/admin";
import { lookupZipDetailsAction } from "./metalBuildings.actions";

const TABLE = "metal_s_snowload_data";
const COLS = "id, zip_code, latitude, longitude, snow_load, created_at";

// "2134" / "02134" / 2134 → "02134"; null when not a 3–5 digit ZIP.
function zipDigits(value) {
  let d = String(value ?? "").replace(/\D/g, "");
  if (d.length >= 3 && d.length <= 5) d = d.padStart(5, "0");
  return d.length === 5 ? d : null;
}

// "" → null; number → number; anything else → NaN (invalid).
function toNum(value) {
  const t = String(value ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function offlineCoords(digits) {
  try {
    const z = zipcodes.find(digits);
    if (z?.isValid) {
      return {
        latitude: Number.isFinite(z.latitude) ? z.latitude : null,
        longitude: Number.isFinite(z.longitude) ? z.longitude : null,
      };
    }
  } catch { /* unknown ZIP offline */ }
  return null;
}

function validate(payload) {
  const digits = zipDigits(payload?.zip_code);
  if (!digits) throw new Error("Enter a valid 5-digit ZIP code.");
  const snow = toNum(payload?.snow_load);
  if (snow == null || Number.isNaN(snow) || snow < 0) throw new Error("Snow load must be a number of 0 or more.");
  let lat = toNum(payload?.latitude);
  let lng = toNum(payload?.longitude);
  if (Number.isNaN(lat) || (lat != null && (lat < -90 || lat > 90))) throw new Error("Latitude must be between -90 and 90.");
  if (Number.isNaN(lng) || (lng != null && (lng < -180 || lng > 180))) throw new Error("Longitude must be between -180 and 180.");
  if (lat == null || lng == null) {
    const c = offlineCoords(digits);
    if (lat == null) lat = c?.latitude ?? null;
    if (lng == null) lng = c?.longitude ?? null;
  }
  return { digits, row: { zip_code: Number(digits), snow_load: snow, latitude: lat, longitude: lng } };
}

async function assertZipFree(zipNumber, exceptId = null) {
  let q = getSupabaseAdmin().from(TABLE).select("id").eq("zip_code", zipNumber).limit(1);
  if (exceptId != null) q = q.neq("id", exceptId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  if (data?.length) {
    throw new Error(`ZIP ${String(zipNumber).padStart(5, "0")} already has a snow load — edit that row instead.`);
  }
}

/** Search by ZIP prefix (digits); newest first per ZIP. Returns { rows, total }. */
export async function listSnowLoads({ search = "", limit = 500 } = {}) {
  const max = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  let q = getSupabaseAdmin().from(TABLE).select(COLS, { count: "exact" })
    .order("zip_code", { ascending: true }).order("id", { ascending: false }).limit(max);
  const prefix = String(search ?? "").replace(/\D/g, "").slice(0, 5);
  if (prefix) {
    q = q.gte("zip_code", Number(prefix.padEnd(5, "0"))).lte("zip_code", Number(prefix.padEnd(5, "9")));
  }
  const { data, error, count } = await q;
  if (error) throw new Error(error.message || "Failed to load snow loads");
  return { rows: data ?? [], total: count ?? 0 };
}

/** Coordinates for a ZIP (GeoNames, offline fallback). */
export async function lookupSnowLoadCoordinates(zipCode) {
  const digits = zipDigits(zipCode);
  if (!digits) return { ok: false, message: "Enter a valid 5-digit ZIP code." };
  const res = await lookupZipDetailsAction(digits);
  if (res?.ok && res.details?.latitude != null && res.details?.longitude != null) {
    return {
      ok: true, latitude: res.details.latitude, longitude: res.details.longitude,
      place: [res.details.city, res.details.region].filter(Boolean).join(", "),
    };
  }
  const c = offlineCoords(digits);
  if (c?.latitude != null && c?.longitude != null) return { ok: true, ...c, place: "" };
  return { ok: false, message: res?.message || "Coordinates not found for this ZIP." };
}

export async function createSnowLoad(payload) {
  const { row } = validate(payload);
  await assertZipFree(row.zip_code);
  const { data, error } = await getSupabaseAdmin().from(TABLE).insert(row).select(COLS).single();
  if (error) throw new Error(error.message || "Failed to add snow load");
  return data;
}

export async function updateSnowLoad(id, payload) {
  if (id == null || id === "") throw new Error("Row ID is required.");
  const { row } = validate(payload);
  await assertZipFree(row.zip_code, id);
  const { data, error } = await getSupabaseAdmin().from(TABLE).update(row).eq("id", id).select(COLS).single();
  if (error) throw new Error(error.message || "Failed to update snow load");
  return data;
}

/**
 * Mass import (≤ 1000 rows per call). rows: [{ line, zip_code, snow_load, latitude, longitude }]
 * Existing ZIPs are replaced (new row inserted first, then old rows removed).
 * Returns { inserted, updated, errors: [{ line, reason }] }.
 */
export async function importSnowLoads(rows) {
  const list = Array.isArray(rows) ? rows.slice(0, 1000) : [];
  const result = { inserted: 0, updated: 0, errors: [] };
  const byZip = new Map(); // last row per ZIP wins
  for (const r of list) {
    const line = r?.line ?? "?";
    try {
      const { row } = validate(r);
      byZip.set(row.zip_code, row);
    } catch (err) {
      result.errors.push({ line, reason: err?.message || "Invalid row" });
    }
  }
  if (byZip.size === 0) return result;

  const supabase = getSupabaseAdmin();
  const zips = [...byZip.keys()];
  const { data: existing, error: exErr } = await supabase.from(TABLE).select("id, zip_code").in("zip_code", zips);
  if (exErr) throw new Error(exErr.message);
  const oldIds = (existing ?? []).map((e) => e.id);
  const existingZips = new Set((existing ?? []).map((e) => Number(e.zip_code)));

  const { error: insErr } = await supabase.from(TABLE).insert([...byZip.values()]);
  if (insErr) throw new Error(insErr.message || "Import failed");
  if (oldIds.length) {
    const { error: delErr } = await supabase.from(TABLE).delete().in("id", oldIds);
    if (delErr) throw new Error(`Imported, but old rows could not be removed: ${delErr.message}`);
  }
  for (const z of zips) {
    if (existingZips.has(z)) result.updated += 1; else result.inserted += 1;
  }
  return result;
}

export async function deleteSnowLoad(id) {
  if (id == null || id === "") throw new Error("Row ID is required.");
  const { error } = await getSupabaseAdmin().from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message || "Failed to delete snow load");
  return { id, deleted: true };
}