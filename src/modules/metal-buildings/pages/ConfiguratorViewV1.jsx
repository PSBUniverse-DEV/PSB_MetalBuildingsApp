"use client";
// ═══════════════════════════════════════════════════════════
// ConfiguratorViewV1 — Calculation-focused configurator.
// 3D preview removed; the preview area shows a placeholder.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from "react";
import AppIcon from "@/shared/components/ui/AppIcon";
import { Button } from "@/shared/components/ui";
import {
  getUniqueDimensionValues,
  getLegHeightValues,
  applyRegionMultiplier,
  calcPanelOptionPrice,
  calcTotalPanelPrice,
  lookupWallPanelPrices,
  getCustomWallOptions,
  findCustomWallRow,
  deriveCustomRenderType,
  calcCustomTotalWallPrice,
  formatCurrency,
  lookupLegHeightPrice as lookupLegHeightPriceClient,
  lookupOptionByDimensions,
  lookupFeatureRate,
  calculateGutterPricing,
} from "../data/metalBuildings.data";
import EstimateDetailsDrawer from "../components/EstimateDetailsDrawer";
import { buildEstimate } from "../components/estimateDrawer.utils";
import { getStyleProfile, isFeatureAllowed, isAccessoryAllowed } from "../data/styleProfiles";
import { getStyleIconPath } from "../data/styleIcons";
import { getModuleImagePath } from "../data/moduleImages";
import { findRegionByZipCode, addZipCodeAction, lookupZipDetailsAction, lookupRegionBasePrice, lookupRoofStyleBasePrice, lookupLegHeightPrice } from "../data/metalBuildings.actions";
import useTaxRate from "../components/useTaxRate";
import "./configuratorV1.css";

// ─── DEFAULT INSTALLATION SURFACE ─────────────────────────
const DEFAULT_INSTALLATION_SURFACE = "Concrete";

function buildInstallationSurfaceDefault(features, options) {
  const feat = features.find((f) => f.name === "Installation Surface" || f.render_key === "installation_surface");
  if (!feat) return null;
  const opt = options.find((o) => o.feature_id === feat.feature_id && o.name === DEFAULT_INSTALLATION_SURFACE);
  if (!opt) return null;
  return { featureId: feat.feature_id, featureName: feat.name, description: opt.name, price: Number(opt.price) };
}

// ─── ROOF OVERHANG NAME NORMALIZATION ─────────────────────
// Normalize an overhang option label to a comparable size key. Quote-style
// marks are treated as equivalent and stripped: the UI renders `12"` (inch
// mark) while DB rows may be named `12'` (foot mark) or `12` for the same
// 12-inch overhang. `6"` ≡ `6'` ≡ `6` → 6; `12"` ≡ `12'` ≡ `12` → 12.
function normalizeOverhangName(name) {
  if (name == null) return null;
  const cleaned = String(name).trim().replace(/['"″′”’]/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) && cleaned !== "" ? num : cleaned.toLowerCase();
}

// ─── ROOF PITCH NAME NORMALIZATION ────────────────────────
// Normalize a pitch option label to a comparable rise key. The UI renders
// `4/12` while DB rows may be named `4:12` or `4` for the same 4/12 pitch.
// `4/12` ≡ `4:12` ≡ `4` → 4.
function normalizePitchName(name) {
  if (name == null) return null;
  const cleaned = String(name).trim();
  const m = cleaned.match(/^(\d+(?:\.\d+)?)\s*[/:]\s*\d+/);
  if (m) return Number(m[1]);
  const num = Number(cleaned);
  return Number.isFinite(num) && cleaned !== "" ? num : cleaned.toLowerCase();
}

// ─── LEAN-TO SIDE IMAGE PATH ──────────────────────────────
// Resolves metal_s_leanto_side.image_path to a usable src. Bundled module
// images (e.g. "src\modules\metal-buildings\Images\mt-left.png") resolve by
// file name; full URLs pass through; other relative values are normalized to
// root-relative public paths.
function getLeantoSideImagePath(side) {
  const raw = String(side?.image_path ?? "").trim();
  if (!raw) return "";
  const bundled = getModuleImagePath(raw);
  if (bundled) return bundled;
  if (/^https?:\/\//i.test(raw)) return raw;
  const cleaned = raw.replace(/^\/public\//i, "/");
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

// ─── ROOF PITCH OPTIONS (metal_s_feature_option) ──────────
// The Roof Pitch feature and its option rows (names + multiplier factors)
// live in the database — the UI never hardcodes pitch choices or factors.
function findRoofPitchFeature(features) {
  return features.find((f) => f.render_key === "roof_pitch")
    ?? features.find((f) => String(f.name ?? "").toLowerCase().includes("pitch"))
    ?? null;
}

// Distinct pitch names from metal_s_feature_option for the Roof Pitch feature,
// ordered by sort_order/option_id and deduped by rise (width-band rows share
// the same pitch). The first entry serves as the default selection.
function getRoofPitchOptionNames(features, options) {
  const feat = findRoofPitchFeature(features);
  if (!feat) return [];
  const rows = (options ?? [])
    .filter((o) => o.feature_id === feat.feature_id && o.is_active !== false)
    .sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)) || ((a.option_id ?? 0) - (b.option_id ?? 0)));
  const seen = new Set();
  const names = [];
  for (const o of rows) {
    const key = normalizePitchName(o.name);
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    names.push(String(o.name ?? "").trim());
  }
  return names;
}

const FALLBACK_LT_WIDTHS = [6, 8, 10, 12, 14, 16, 18, 20, 24];
const FALLBACK_LT_HEIGHTS = [4, 5, 6, 7, 8, 9, 10, 12];
const FALLBACK_LT_LENGTHS = [10, 12, 14, 16, 18, 20, 24, 30, 36, 40, 45, 50, 60];

// Storage location options (Center Storage — display only, not wired to pricing/3D yet)
const STORAGE_LOCATIONS = [
  { value: "none", label: "None" },
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "left", label: "Left Side" },
  { value: "right", label: "Right Side" },
];

// Storage depth options (placeholder — not wired to pricing/3D yet)
const STORAGE_DEPTHS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

// Lean-to feature UI defaults (display only — not wired to pricing/3D yet).
// Pitch defaults to "" and is normalized to a DB-listed pitch option at render.
const LT_WRAP_OPTIONS = ["No Wrap", "Standard Roofing"];
const LT_UI_DEFAULTS = {
  roofPitch: "",
  wrap: "No Wrap",
};

// Wall mode presets for lean-tos (mirrors NorthEdge: Fully Enclosed / Fully Open / Gable Ends / Customize)
const LT_WALL_MODES = [
  { key: "enclosed", label: "Fully Enclosed" },
  { key: "open", label: "Fully Open" },
  { key: "gable", label: "Gable Ends" },
  { key: "custom", label: "Customize by Wall" },
];

function applyLtWallMode(mode) {
  if (mode === "enclosed") return { outer: "enclosed", left_end: "enclosed", right_end: "enclosed" };
  if (mode === "open") return { outer: "open", left_end: "open", right_end: "open" };
  if (mode === "gable") return { outer: "open", left_end: "gable", right_end: "gable" };
  return null; // custom — don't change
}

// Maps Rain Gutters UI labels to calculateGutterPricing gutterSelection keys.
const RAIN_GUTTER_SIDE_KEY = {
  "Left Side Gutters": "left",
  "Right Side Gutters": "right",
  "Both Sides Gutters": "both",
};

// The Standard (Regular) Carport is the only style with side-based downspout
// defaults: Both Sides Gutters → 4, one side (Left/Right) → 2. All other
// styles default to 0.
function isStandardCarportStyle(styleRow) {
  const key = String(styleRow?.render_key ?? "").toLowerCase().replace(/[-\s]/g, "_");
  const name = String(styleRow?.name ?? "").toLowerCase();
  return key.includes("regular") || key.includes("standard") ||
    name.includes("regular") || name.includes("standard");
}

function getDefaultDownspoutCount(styleRow, rainGuttersSelection) {
  if (!isStandardCarportStyle(styleRow)) return 0;
  return rainGuttersSelection === "Both Sides Gutters" ? 4 : 2;
}

// ─── DOWNSPOUT PRICING (metal_s_feature_option) ────────────
// The downspout base price is the `price` column of an active
// metal_s_feature_option row. DB naming varies ("Downspout", "Down Spout",
// "Downspouts", "2x3 Downspout", "Downpipe", or a combined "Gutter &
// Downspout" feature — render_key often null), so match loosely (letters and
// digits only) and search in priority order (each tier by sort_order, then
// option_id):
//   1. downspout-named option under a downspout-named feature
//   2. any option under a downspout-named feature
//   3. downspout-named option under any feature
//   4. any option under the gutter feature (combined "Gutter & Downspout" rows)
// Returns null when no valid price is found — no hardcoded fallback.
function lookupDownspoutBasePrice(features, options) {
  const alnum = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const isDownspoutish = (v) => {
    const s = alnum(v);
    return s.includes("downspout") || s.includes("downpipe");
  };
  const isGutterish = (v) => alnum(v).includes("gutter");
  const bySort = (a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)) || ((a.option_id ?? 0) - (b.option_id ?? 0));

  const activeOptions = (options ?? []).filter((o) => o.is_active !== false);
  const featureList = features ?? [];
  const downspoutFeature = featureList.find((f) => isDownspoutish(f.name) || isDownspoutish(f.render_key)) ?? null;
  const gutterFeature = featureList.find((f) => isGutterish(f.name) || isGutterish(f.render_key)) ?? null;

  const tiers = [
    downspoutFeature ? activeOptions.filter((o) => o.feature_id === downspoutFeature.feature_id && isDownspoutish(o.name)) : [],
    downspoutFeature ? activeOptions.filter((o) => o.feature_id === downspoutFeature.feature_id) : [],
    activeOptions.filter((o) => isDownspoutish(o.name)),
    gutterFeature ? activeOptions.filter((o) => o.feature_id === gutterFeature.feature_id) : [],
  ];

  for (const tier of tiers) {
    for (const row of [...tier].sort(bySort)) {
      const price = Number(row?.price);
      if (Number.isFinite(price) && price > 0) return price;
    }
  }
  return null;
}

// Pure downspout price calculation. No side effects, no UI access.
//
// Pricing rule (heights in feet, prices in USD):
//   Price = basePrice × (tallestSidewallHeight + 1.5) × downspoutCount
//
// basePrice comes from metal_s_feature_option.price (lookupDownspoutBasePrice).
// Validation: downspoutCount clamps to an integer 0-10; a missing/invalid base
// price or sidewall height yields 0 (no hardcoded fallback). Result is rounded
// to 2 decimals.
function computeDownspoutPrice({ basePrice, tallestSidewallHeight, downspoutCount = 0 } = {}) {
  const price = Number(basePrice);
  if (!Number.isFinite(price) || price <= 0) return 0;
  // A missing height (null/undefined/"") means no downspout pricing — note
  // Number(null) === 0, so it must be rejected before numeric conversion.
  // A genuine 0-ft sidewall is still valid (run = 1.5 ft).
  if (tallestSidewallHeight == null || tallestSidewallHeight === "") return 0;
  const heightFt = Number(tallestSidewallHeight);
  if (!Number.isFinite(heightFt) || heightFt < 0) return 0;
  const count = Math.min(10, Math.max(0, Math.trunc(Number(downspoutCount) || 0)));
  return Math.round(price * (heightFt + 1.5) * count * 100) / 100;
}

// Default siding style used when looking up Gable wall prices from
// metal_m_panel_pricing (matches metal_m_panel_pricing.siding_style values
// "Horizontal" / "Vertical"). Horizontal is the default; wire this to a user
// selection later if a siding-style input is added.
const DEFAULT_SIDING_STYLE = "Horizontal";

// ─── ENGINEERING CONSTRAINTS ───────────────────────────────
// Parse WxH dimensions from item names like "12×12 Rollup Door" or "36×80 Walk-in Door"
// Returns { widthFt, heightFt } — converts inches to feet when values indicate inches (>= 20 for height means inches)
function parseItemDimensions(name) {
  const match = name?.match(/(\d+)\s*[×x]\s*(\d+)/i);
  if (!match) return null;
  let w = Number(match[1]);
  let h = Number(match[2]);
  // Heuristic: if height >= 20, assume inches (walk-in doors are "36×80" = 36"×80")
  // If both < 20, assume feet (rollup doors are "12×12" = 12ft×12ft)
  if (h >= 20) { w = w / 12; h = h / 12; }
  return { widthFt: w, heightFt: h };
}

// Structural clearance rules
const FRAME_CLEARANCE_FT = 1;      // min gap from each frame column
const HEIGHT_CLEARANCE_FT = 0.17;  // min gap below eave (~2" for frame header)
const MAX_OPENING_RATIO = 0.85;    // max total opening width vs wall width

function getWallWidthFt(wallKey, section, buildingWidth, buildingLength, leantos) {
  if (section === "center") {
    if (wallKey === "front" || wallKey === "back") return buildingWidth;
    return buildingLength; // left / right
  }
  // Lean-to walls
  const lt = leantos.find((l) => l.side_key === section);
  if (!lt) return 0;
  if (wallKey === "outer") return lt.length_ft ?? 0;
  return lt.width_ft ?? 0; // left_end / right_end
}

function getWallHeightFt(section, buildingHeight, leantos, wallKey) {
  if (section === "center") return buildingHeight;
  const lt = leantos.find((l) => l.side_key === section);
  if (!lt) return buildingHeight;
  // End walls are trapezoids — taller at building side, shorter at outer edge
  // Use 70% of the height range (items can be placed toward the taller building side)
  if (wallKey === "left_end" || wallKey === "right_end") {
    return lt.height_ft + (buildingHeight - lt.height_ft) * 0.7;
  }
  return lt.height_ft;
}

function validateItemForWall(item, existingItems, wallWidthFt, wallHeightFt) {
  const dims = parseItemDimensions(item.name);
  if (!dims) return { ok: true }; // can't validate, allow it

  // Single item too wide for wall
  if (dims.widthFt > wallWidthFt - FRAME_CLEARANCE_FT * 2) {
    return { ok: false, reason: `${item.name} is ${dims.widthFt}' wide but this wall only allows up to ${(wallWidthFt - FRAME_CLEARANCE_FT * 2).toFixed(0)}' (${wallWidthFt}' wall minus frame clearance).` };
  }

  // Single item too tall for wall
  if (dims.heightFt > wallHeightFt - HEIGHT_CLEARANCE_FT) {
    return { ok: false, reason: `${item.name} is ${dims.heightFt.toFixed(1)}' tall but this wall is only ${wallHeightFt}' (need ${HEIGHT_CLEARANCE_FT}' eave clearance).` };
  }

  // Total opening width check (sum of all items + this new one)
  const totalExisting = existingItems.reduce((sum, ex) => {
    const d = parseItemDimensions(ex.name);
    return sum + (d ? d.widthFt : 0);
  }, 0);
  const totalAfter = totalExisting + dims.widthFt;
  const maxAllowed = wallWidthFt * MAX_OPENING_RATIO;
  if (totalAfter > maxAllowed) {
    return { ok: false, reason: `Adding ${item.name} would total ${totalAfter.toFixed(1)}' of openings on a ${wallWidthFt}' wall (max ${maxAllowed.toFixed(0)}').` };
  }

  return { ok: true };
}

// ─── ICON SVGs for wall items ──────────────────────────────
const ITEM_ICONS = {
  door: (
    <svg viewBox="0 0 48 64" fill="none" stroke="currentColor" strokeWidth="2" width="36" height="48">
      <rect x="8" y="4" width="32" height="56" rx="2" />
      <circle cx="34" cy="34" r="2" fill="currentColor" />
    </svg>
  ),
  window: (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" width="36" height="36">
      <rect x="6" y="6" width="36" height="36" rx="2" />
      <line x1="24" y1="6" x2="24" y2="42" />
      <line x1="6" y1="24" x2="42" y2="24" />
    </svg>
  ),
  frameout: (
    <svg viewBox="0 0 48 64" fill="none" stroke="currentColor" strokeWidth="2" width="36" height="48">
      <rect x="4" y="2" width="40" height="60" rx="2" />
      <rect x="8" y="6" width="32" height="52" rx="1" strokeDasharray="4 2" fill="none" />
      <line x1="4" y1="2" x2="8" y2="6" />
      <line x1="44" y1="2" x2="40" y2="6" />
      <line x1="4" y1="62" x2="8" y2="58" />
      <line x1="44" y1="62" x2="40" y2="58" />
    </svg>
  ),
  rollup_door: (
    <svg viewBox="0 0 48 64" fill="none" stroke="currentColor" strokeWidth="2" width="36" height="48">
      <rect x="4" y="2" width="40" height="60" rx="2" />
      <path d="M8 10 Q24 6 40 10" />
      <line x1="8" y1="18" x2="40" y2="18" />
      <line x1="8" y1="26" x2="40" y2="26" />
      <line x1="8" y1="34" x2="40" y2="34" />
      <line x1="8" y1="42" x2="40" y2="42" />
      <line x1="8" y1="50" x2="40" y2="50" />
      <line x1="8" y1="58" x2="40" y2="58" />
    </svg>
  ),
  vent: (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" width="36" height="36">
      <rect x="6" y="10" width="36" height="28" rx="2" />
      <line x1="6" y1="17" x2="42" y2="17" />
      <line x1="6" y1="24" x2="42" y2="24" />
      <line x1="6" y1="31" x2="42" y2="31" />
    </svg>
  ),
};

// ─── ADD ZIP CODE HELPERS ─────────────────────────────────

function emptyAddZipDraft() {
  return {
    zipCode: "",
    region: "",
    stateCode: "",
    city: "",
    county: "",
    latitude: "",
    longitude: "",
    // Per-field source for the confirmation summary: "api" | "manual".
    sources: {},
  };
}

// ─── MAIN COMPONENT ─────────────────────────────────────────

export default function ConfiguratorView({ data }) {
  const { styles, features, matrixPrices, legHeightPrices, panelLocations, panelOptions, panelPricing, panelTypes, panelPriceRegions, rates, options, doorWindowItems, colorGroups, colorOptions, leantoStyles, leantoSides, leantoPrices, leantoCompat, styleDefaults } = data;

  // ─── FULL-BLEED LAYOUT (remove parent padding/max-width) ──
  useEffect(() => {
    const shell = document.querySelector(".app-shell-body");
    const content = document.querySelector(".app-content");
    if (shell) { shell.dataset.origPad = shell.style.padding; shell.style.padding = "0"; }
    if (content) { content.dataset.origMax = content.style.maxWidth; content.style.maxWidth = "none"; }
    return () => {
      if (shell) shell.style.padding = shell.dataset.origPad || "";
      if (content) content.style.maxWidth = content.dataset.origMax || "";
    };
  }, []);

  // ─── STYLE & SIZE STATE ──────────────────────────────────
  const [selectedStyleId, setSelectedStyleId] = useState(
    styles.find((s) => s.render_key === "rib_type")?.style_id ?? styles[0]?.style_id ?? null
  );
  const [selectedRegion, setSelectedRegion] = useState(null);

  // ─── REGION-SPECIFIC BASE PRICE ────────────────────────────
  const [regionBasePriceResult, setRegionBasePriceResult] = useState(null);
  const [roofStyleBasePriceResult, setRoofStyleBasePriceResult] = useState(null);
  const [legHeightPrice, setLegHeightPrice] = useState(0);

  // ─── ZIP CODE GATE STATE ──────────────────────────────────
  // The configurator is locked (overlay) until a valid US ZIP is confirmed.
  const [showZipModal, setShowZipModal] = useState(true);
  const [zipDraft, setZipDraft] = useState("");
  const [zipError, setZipError] = useState(null);
  const [zipSubmitting, setZipSubmitting] = useState(false);
  const [zipCode, setZipCode] = useState(null);
  const [zipCity, setZipCity] = useState(null);
  const [zipStateCode, setZipStateCode] = useState(null);

  // Non-dismissible until a zip is confirmed.
  const zipUnlocked = zipCode != null;

  // ─── ADD ZIP CODE FLOW ────────────────────────────────────
  // Shown when the typed ZIP is missing from metal_s_zip_codes: the user can
  // add it after confirming the details looked up via lookupZipDetailsAction.
  const [zipNotFoundDigits, setZipNotFoundDigits] = useState(null);
  const [showAddZipModal, setShowAddZipModal] = useState(false);
  const [addZipStep, setAddZipStep] = useState("form"); // "form" | "confirm"
  const [addZipDraft, setAddZipDraft] = useState(emptyAddZipDraft());
  const [addZipLookupLoading, setAddZipLookupLoading] = useState(false);
  const [addZipLookupNote, setAddZipLookupNote] = useState(null);
  const [addZipError, setAddZipError] = useState(null);
  const [addZipSaving, setAddZipSaving] = useState(false);

  // ─── SALES TAX RATE (via free SalesTaxZip API — 100 req/hr) ─
  const { data: taxData, getTaxRate } = useTaxRate();
  const [salesTaxRate, setSalesTaxRate] = useState(0.07); // fallback default

  // Parse the combined_pct string (e.g. "8.875%") into a decimal.
  useEffect(() => {
    if (taxData?.rates?.combined_pct) {
      const num = parseFloat(String(taxData.rates.combined_pct).replace("%", ""));
      if (!isNaN(num)) setSalesTaxRate(num / 100);
    }
  }, [taxData]);

  // Shared accept path for a confirmed ZIP (existing row or just-added row):
  // unlocks the configurator and starts the sales-tax lookup.
  const acceptZipLookupResult = (result) => {
    setZipCode(result.zipCode);
    setZipCity(result.city);
    setZipStateCode(result.region?.state_code ?? null);
    setSelectedRegion(result.region ?? null);
    setShowZipModal(false);
    setShowAddZipModal(false);
    setZipNotFoundDigits(null);
    setZipError(null);

    // Automatically fetch the sales tax rate for this ZIP.
    getTaxRate(result.zipCode);
  };

  const submitZip = async (e) => {
    e?.preventDefault();
    setZipError(null);
    setZipNotFoundDigits(null);
    const digits = zipDraft.replace(/\D/g, "").slice(0, 5);
    if (digits.length !== 5) {
      setZipError("Please enter a valid 5-digit ZIP code.");
      return;
    }
    setZipSubmitting(true);
    try {
      const result = await findRegionByZipCode(digits);
      if (!result.ok) {
        if (result.reason === "not_found") {
          setZipError("The given zip code is not yet part of the serviceable area. You can add your ZIP code below to continue.");
          setZipNotFoundDigits(digits);
        } else {
          setZipError("Please enter a valid 5-digit ZIP code.");
        }
        return;
      }
      // Accept the ZIP and auto-select the linked region (may be null if
      // the zip's region is inactive — default pricing applies).
      acceptZipLookupResult(result);
    } catch (err) {
      console.error("ZIP lookup failed:", err);
      setZipError("Something went wrong looking up that ZIP. Please try again.");
    } finally {
      setZipSubmitting(false);
    }
  };

  // ─── ADD ZIP CODE FLOW (missing ZIP → lookup → confirm → save) ─

  const closeAddZipModal = () => {
    if (addZipSaving) return;
    setShowAddZipModal(false);
    setAddZipStep("form");
    setAddZipError(null);
    setAddZipLookupNote(null);
  };

  // Track per-field edits so the confirmation step can show what came from
  // the lookup API vs. manual entry.
  const updateAddZipField = (field, value) => {
    setAddZipDraft((prev) => ({
      ...prev,
      [field]: value,
      sources: { ...prev.sources, [field]: "manual" },
    }));
  };

  // Open the Add ZIP modal and pre-fill the form from the lookup API.
  const openAddZipModal = async () => {
    const digits = String(zipNotFoundDigits ?? zipDraft ?? "").replace(/\D/g, "").slice(0, 5);
    setAddZipStep("form");
    setAddZipError(null);
    setAddZipLookupNote(null);
    setAddZipDraft({ ...emptyAddZipDraft(), zipCode: digits });
    setShowAddZipModal(true);
    if (digits.length !== 5) return;

    setAddZipLookupLoading(true);
    try {
      const result = await lookupZipDetailsAction(digits);
      if (result.ok && result.details) {
        const d = result.details;
        setAddZipDraft((prev) => ({
          ...prev,
          zipCode: String(d.zipCode ?? digits),
          region: d.stateName ?? d.region ?? "",
          stateCode: d.region ?? "",
          city: d.city ?? "",
          county: d.county ?? "",
          latitude: d.latitude ?? "",
          longitude: d.longitude ?? "",
          sources: {
            region: (d.stateName ?? d.region) != null ? "api" : undefined,
            city: d.city != null ? "api" : undefined,
            county: d.county != null ? "api" : undefined,
            latitude: d.latitude != null ? "api" : undefined,
            longitude: d.longitude != null ? "api" : undefined,
          },
        }));
        // Surface anything the lookup API couldn't provide (e.g. city/county on
        // the free tier) so the user knows to enter it manually.
        const missing = ["city", "county"].filter((k) => d[k] == null);
        if (missing.length > 0) {
          setAddZipLookupNote(`Not provided by the ZIP lookup: ${missing.join(", ")} — please enter ${missing.length > 1 ? "them" : "it"} manually.`);
        }
      } else {
        setAddZipLookupNote(result.message || "ZIP details lookup unavailable — please fill in the details manually.");
      }
    } catch (err) {
      console.error("ZIP details lookup failed:", err);
      setAddZipLookupNote("ZIP details lookup unavailable — please fill in the details manually.");
    } finally {
      setAddZipLookupLoading(false);
    }
  };

  // Step 1 → Step 2: validate, then show the read-only confirmation summary
  // of the API data result (merged with manual edits) before anything is saved.
  const reviewAddZip = () => {
    setAddZipError(null);
    const digits = String(addZipDraft.zipCode ?? "").replace(/\D/g, "").slice(0, 5);
    if (digits.length !== 5) {
      setAddZipError("Please enter a valid 5-digit ZIP code.");
      return;
    }
    if (!String(addZipDraft.region ?? "").trim()) {
      setAddZipError("Please enter a region (e.g. the state name) so we can price your building.");
      return;
    }
    setAddZipStep("confirm");
  };

  // Step 2 → save the confirmed ZIP and unlock the configurator.
  const confirmAddZip = async () => {
    setAddZipError(null);
    const digits = String(addZipDraft.zipCode ?? "").replace(/\D/g, "").slice(0, 5);
    setAddZipSaving(true);
    try {
      const result = await addZipCodeAction({
        zip_code: digits,
        region: addZipDraft.region || null,
        state_code: addZipDraft.stateCode || null,
        city: addZipDraft.city || null,
        county: addZipDraft.county || null,
        latitude: addZipDraft.latitude === "" || addZipDraft.latitude == null ? null : Number(addZipDraft.latitude),
        longitude: addZipDraft.longitude === "" || addZipDraft.longitude == null ? null : Number(addZipDraft.longitude),
      });
      if (!result?.ok) {
        setAddZipError("The ZIP code was saved but could not be loaded. Please try again.");
        return;
      }
      acceptZipLookupResult(result);
    } catch (err) {
      console.error("Add ZIP failed:", err);
      setAddZipError(err?.message || "Something went wrong saving that ZIP code. Please try again.");
    } finally {
      setAddZipSaving(false);
    }
  };

  const baseFeature = features.find((f) => f.is_required);
  const baseFeatureId = baseFeature?.feature_id;

  // Helper: get the style row for current selection
  const selectedStyle = styles.find((s) => s.style_id === selectedStyleId);

  const handleStyleChange = (styleId) => {
    setSelectedStyleId(styleId);
  };

  const widths = useMemo(() => getUniqueDimensionValues(matrixPrices, baseFeatureId, selectedStyleId, "width"), [matrixPrices, baseFeatureId, selectedStyleId]);
  const lengths = useMemo(() => getUniqueDimensionValues(matrixPrices, baseFeatureId, selectedStyleId, "length"), [matrixPrices, baseFeatureId, selectedStyleId]);
  const heights = useMemo(() => getLegHeightValues(legHeightPrices, baseFeatureId, selectedStyleId), [legHeightPrices, baseFeatureId, selectedStyleId]);

  const initStyle = styles.find((s) => s.render_key === "rib_type") ?? styles[0];
  const [width, setWidth] = useState(initStyle?.default_width ?? widths[0] ?? 12);
  const [length, setLength] = useState(initStyle?.default_length ?? lengths[0] ?? 20);
  const [height, setHeight] = useState(10);

  // ─── STYLE-DRIVEN OPTIONS STATE ──────────────────────────
  const DEFAULT_ROOFING = "Vertical";
  const DEFAULT_ROOF_OVERHANG = '6"';

  const [roofing, setRoofing] = useState(DEFAULT_ROOFING);
  // Pitch choices and their multiplier factors are DB-driven
  // (metal_s_feature_option) — default to the first option by sort_order
  // rather than a hardcoded pitch.
  const [roofPitch, setRoofPitch] = useState(() => getRoofPitchOptionNames(features, options)[0] ?? "");
  const [roofOverhang, setRoofOverhang] = useState(DEFAULT_ROOF_OVERHANG);
  // Gutters UI selections — drive Rain Gutters visibility and gutter pricing.
  const [guttersSelection, setGuttersSelection] = useState("No Gutters");
  const [rainGuttersSelection, setRainGuttersSelection] = useState("Left Side Gutters");
  // Downspout count (0-10) — legacy input for the rate-based
  // calculateGutterPricing call. The "Number of Downspouts" UI field below
  // (uiDownspoutCount) drives the actual downspout price via
  // computeDownspoutPrice.
  const [downspoutCount, setDownspoutCount] = useState(0);
  // Number of Downspouts UI field (0-10) — drives the downspout price
  // (computeDownspoutPrice) and the estimate. Default is side-based for the
  // Standard (Regular) Carport (Both Sides → 4, one side → 2) and 0 for every
  // other style — see getDefaultDownspoutCount.
  const [uiDownspoutCount, setUiDownspoutCount] = useState(() => getDefaultDownspoutCount(selectedStyle, rainGuttersSelection));
  // Multiplier factor looked up from metal_s_feature_option for the selected
  // overhang (e.g. 0.15 → upcharge = Base Structure Price × 0.15). 0 = no upcharge.
  const [roofOverhangMultiplier, setRoofOverhangMultiplier] = useState(0);
  // Multiplier factor looked up from metal_s_feature_option for the selected
  // roof pitch — upcharge = (W × H × L) × factor. 0 = no matching DB row.
  const [roofPitchMultiplier, setRoofPitchMultiplier] = useState(0);

  // Reset style-driven options to defaults whenever building style changes
  useEffect(() => {
    setRoofing(DEFAULT_ROOFING);
    setRoofPitch(getRoofPitchOptionNames(features, options)[0] ?? "");
    setRoofOverhang(DEFAULT_ROOF_OVERHANG);
    setRoofOverhangMultiplier(0);
    setRoofPitchMultiplier(0);
    setGuttersSelection("No Gutters");
    setRainGuttersSelection("Left Side Gutters");
    setDownspoutCount(0);
    // Side is reset to "Left Side Gutters" above, so seed its matching default.
    setUiDownspoutCount(getDefaultDownspoutCount(selectedStyle, "Left Side Gutters"));
  }, [selectedStyleId, features, options, selectedStyle]);

  // ─── Fetch region-specific base price ─────────────────────
  // Re-run when style, region, or dimensions change
  useEffect(() => {
    let cancelled = false;
    if (!selectedRegion || !baseFeatureId || !selectedStyleId) {
      setRegionBasePriceResult(null);
      return;
    }
    (async () => {
      try {
        const result = await lookupRegionBasePrice({
          featureId: baseFeatureId,
          regionId: selectedRegion.region_id,
          styleId: selectedStyleId,
          width,
          length,
        });
        if (!cancelled) setRegionBasePriceResult(result);
      } catch (err) {
        if (!cancelled) setRegionBasePriceResult(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedRegion, selectedStyleId, width, length, baseFeatureId]);

  // ─── Fetch roof-style base price ───────────────────────────
  // Re-run when roofing, dimensions, or region change
  useEffect(() => {
    let cancelled = false;
    if (!selectedRegion || !roofing || !width || !length) {
      setRoofStyleBasePriceResult(null);
      return;
    }
    (async () => {
      try {
        const result = await lookupRoofStyleBasePrice({
          roofStyle: roofing,
          width,
          length,
          regionId: selectedRegion.region_id,
        });
        if (!cancelled) setRoofStyleBasePriceResult(result);
      } catch (err) {
        if (!cancelled) setRoofStyleBasePriceResult(null);
      }
    })();
    return () => { cancelled = true; };
  }, [roofing, width, length, selectedRegion]);

  // ─── Fetch leg-height price ────────────────────────────────
  // Re-run when region, style, or dimensions change.
  // Falls back to the client-side matrix lookup if the server view returns
  // no price (so changing length still works while the Supabase view is
  // being verified).
  useEffect(() => {
    let cancelled = false;
    if (!selectedRegion || !selectedStyleId || height == null || !baseFeatureId) {
      setLegHeightPrice(0);
      return;
    }
    (async () => {
      try {
        const result = await lookupLegHeightPrice({
          regionId: selectedRegion.region_id,
          length,
          legHeight: height,
        });
        // Diagnostics: make it easy to see what the server returned.
        // eslint-disable-next-line no-console
        console.log("[legHeight] server result", {
          regionId: selectedRegion.region_id,
          length,
          legHeight: height,
          result,
        });
        const serverPrice = result?.leg_price ?? 0;
        if (!cancelled) {
          if (serverPrice > 0) {
            setLegHeightPrice(serverPrice);
          } else {
            // Fallback to client-side matrix data so length changes still work
            // immediately while the public.metal_vw_leg_price_lookup view is
            // being sorted out.
            const fallback = lookupLegHeightPriceClient(
              legHeightPrices,
              matrixPrices,
              baseFeatureId,
              selectedStyleId,
              width,
              length,
              height
            );
            // eslint-disable-next-line no-console
            console.log("[legHeight] fallback price", { fallback });
            setLegHeightPrice(fallback ?? 0);
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[legHeight] server lookup failed", err);
        if (!cancelled) {
          const fallback = lookupLegHeightPriceClient(
            legHeightPrices,
            matrixPrices,
            baseFeatureId,
            selectedStyleId,
            width,
            length,
            height
          );
          setLegHeightPrice(fallback ?? 0);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedRegion, selectedStyleId, width, length, height, baseFeatureId, legHeightPrices, matrixPrices]);

  const [wallMode, setWallMode] = useState(initStyle?.has_walls ? "enclosed" : "open");

  const panelFeature = features.find((f) => f.pricing_type === "PANEL");
  const [wallSelections, setWallSelections] = useState({});

  // Walls the user explicitly changed (drawer shows selected-only rows)
  const [touchedWallIds, setTouchedWallIds] = useState(() => new Set());
  const markWallsTouched = useCallback((ids) => {
    setTouchedWallIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);
  const changeWallSelection = useCallback((locationId, optionId) => {
    // Preserve the empty "Open (No Panel)" selection as ""; otherwise store the
    // numeric id (a metal_s_panel_option.option_id or metal_m_panel_pricing.panel_pricing_id).
    setWallSelections((prev) => ({ ...prev, [locationId]: optionId === "" ? "" : Number(optionId) }));
    markWallsTouched([locationId]);
  }, [markWallsTouched]);

  // ─── PANEL STATE ─────────────────────────────────────────

  // Siding direction
  const sidingFeature = features.find((f) => f.render_key === "siding_panel");
  const sidingOptions = useMemo(() => (sidingFeature ? options.filter((o) => o.feature_id === sidingFeature.feature_id) : []), [sidingFeature, options]);
  const [sidingOptionId, setSidingOptionId] = useState(null);

  // ─── ADD-ONS STATE ───────────────────────────────────────
  const [addOnItems, setAddOnItems] = useState(() => {
    const initial = {};
    // Default installation surface to "Concrete" on first load
    const surfaceDefault = buildInstallationSurfaceDefault(features, options);
    if (surfaceDefault) initial[surfaceDefault.featureId] = surfaceDefault;
    return initial;
  });

  // Initialize add-ons from style defaults when style changes
  const [prevStyleForDefaults, setPrevStyleForDefaults] = useState(selectedStyleId);
  if (prevStyleForDefaults !== selectedStyleId) {
    setPrevStyleForDefaults(selectedStyleId);
    // Build addOnItems from styleDefaults for the current style
    const newAddOns = {};
    const currentDefaults = (styleDefaults ?? []).filter((d) => d.style_id === selectedStyleId);
    for (const def of currentDefaults) {
      const feat = features.find((f) => f.feature_id === def.feature_id);
      if (!feat) continue;
      const opt = options.find((o) => o.option_id === def.option_id);
      if (!opt) continue;
      newAddOns[def.feature_id] = {
        featureId: def.feature_id,
        featureName: feat.name,
        description: opt.name,
        price: Number(opt.price),
      };
    }
    // Default installation surface to "Concrete" whenever defaults are reset
    const surfaceDefault = buildInstallationSurfaceDefault(features, options);
    if (surfaceDefault) newAddOns[surfaceDefault.featureId] = surfaceDefault;
    // Concrete surface requires no anchor package — drop any seeded anchor package
    // so it is never counted in the estimate.
    const seededAnchorFeat = features.find((f) => f.name === "Anchor Package" || f.render_key === "anchor_package");
    if (seededAnchorFeat && surfaceDefault?.description === DEFAULT_INSTALLATION_SURFACE) {
      delete newAddOns[seededAnchorFeat.feature_id];
    }
    setAddOnItems(newAddOns);
  }

  // ─── DOORS & WINDOWS STATE ───────────────────────────────
  const doorWindowFeature = features.find((f) => f.pricing_type === "PER_ITEM");
  const [doorWindowSelections, setDoorWindowSelections] = useState({ left: [], back: [], right: [], front: [] });

  // ─── COLORS STATE ────────────────────────────────────────
  const colorFeature = features.find((f) => f.pricing_type === "COLOR");
  const [colorSelections, setColorSelections] = useState({});

  // ─── LEAN-TO STATE ───────────────────────────────────────
  const [leantos, setLeantos] = useState([]);

  // Lean-to feature UI selections (display only — not wired to pricing/3D yet)
  const [leantoUiOptions, setLeantoUiOptions] = useState({});
  const updateLtUi = useCallback((sideKey, patch) => {
    setLeantoUiOptions((prev) => ({ ...prev, [sideKey]: { ...(prev[sideKey] ?? LT_UI_DEFAULTS), ...patch } }));
  }, []);

  // Lean-to card collapse state (UI only — keyed by side_key; missing entry = expanded)
  const [collapsedLeantos, setCollapsedLeantos] = useState({});
  const toggleLeantoCollapsed = useCallback((sideKey) => {
    setCollapsedLeantos((prev) => ({ ...prev, [sideKey]: !prev[sideKey] }));
  }, []);

  // ─── STORAGE STATE (Center Storage — UI only, not wired to pricing/3D yet) ──
  const [storageAdded, setStorageAdded] = useState(false);
  const [storageLocation, setStorageLocation] = useState("none");
  const [storageCollapsed, setStorageCollapsed] = useState(false);
  const [storageDepth, setStorageDepth] = useState(9); // default 9' per the mockup

  const compatibleLeantoStyleIds = useMemo(() => {
    return [...new Set((leantoCompat ?? []).filter((c) => c.style_id === selectedStyleId).map((c) => c.leanto_style_id))];
  }, [leantoCompat, selectedStyleId]);
  const availableLeantoStyles = useMemo(() => {
    const seenNames = new Set();
    return (leantoStyles ?? []).filter((s) => {
      if (!compatibleLeantoStyleIds.includes(s.leanto_style_id)) return false;
      if (seenNames.has(s.name)) return false;
      seenNames.add(s.name);
      return true;
    });
  }, [leantoStyles, compatibleLeantoStyleIds]);

  const getLeantoWidths = useCallback((leantoStyleId) => {
    const fromMatrix = [...new Set((leantoPrices ?? [])
      .filter((p) => p.leanto_style_id === leantoStyleId && p.style_id === selectedStyleId && p.width_ft != null)
      .map((p) => Number(p.width_ft)))].sort((a, b) => a - b);
    return fromMatrix.length > 0 ? fromMatrix : FALLBACK_LT_WIDTHS;
  }, [leantoPrices, selectedStyleId]);

  const getLeantoHeights = useCallback((leantoStyleId) => {
    const fromMatrix = [...new Set((leantoPrices ?? [])
      .filter((p) => p.leanto_style_id === leantoStyleId && p.style_id === selectedStyleId && p.height_ft != null)
      .map((p) => Number(p.height_ft)))].sort((a, b) => a - b);
    return fromMatrix.length > 0 ? fromMatrix : FALLBACK_LT_HEIGHTS;
  }, [leantoPrices, selectedStyleId]);

  // ─── IDEAROOM-STYLE: SECTION / WALL / MODE ───────────────
  // "section" = center (main building) or a lean-to side
  const [activeSection, setActiveSection] = useState("center");
  const [activeWall, setActiveWall] = useState("right");
  const [rightPanelMode, setRightPanelMode] = useState("building");
  const [editingItemIdx, setEditingItemIdx] = useState(null);
  const [constraintWarning, setConstraintWarning] = useState(null);
  const [leantoFocusTick, setLeantoFocusTick] = useState(0);

  // Reset editing and warnings when wall/section changes
  const [prevWallSection, setPrevWallSection] = useState(`${activeSection}|${activeWall}`);
  const currentWallSection = `${activeSection}|${activeWall}`;
  if (prevWallSection !== currentWallSection) {
    setPrevWallSection(currentWallSection);
    setEditingItemIdx(null);
    setConstraintWarning(null);
  }

  // Change section and reset wall to a sensible default
  const changeSection = useCallback((sectionKey) => {
    setActiveSection(sectionKey);
    setActiveWall(sectionKey === "center" ? "right" : "outer");
  }, []);

  // ─── SIDES & ENDS: wall mode presets ─────────────────────
  // Plain function (only used in onClick handlers; no memoization needed).
  const applyMode = (mode) => {
    setWallMode(mode);
    if (!panelFeature) return;
    if (mode === "custom") {
      // Custom selections are panel_pricing_ids; clear any stale option_ids from
      // a previous preset mode so they can't collide with panel_pricing_ids.
      setWallSelections({});
      markWallsTouched([]);
      return;
    }
    const newSelections = {};
    for (const loc of panelLocations) {
      let targetType = "open";
      if (mode === "enclosed") targetType = "enclosed";
      else if (mode === "gable") targetType = loc.location_type === "end" ? "gable" : "open";
      const opt = panelOptions.find(
        (o) => o.feature_id === panelFeature.feature_id && o.location_type === loc.location_type && o.render_type === targetType
      );
      if (opt) newSelections[loc.location_id] = opt.option_id;
    }
    markWallsTouched(Object.keys(newSelections));
    setWallSelections(newSelections);
  };

  // ─── FEATURE CATEGORIES (Roofing, Concrete, etc.) ────────
  const otherFeatures = useMemo(() => features.filter((f) => !f.is_required && !["PANEL", "PER_ITEM", "COLOR"].includes(f.pricing_type) && f.render_key !== "siding_panel"), [features]);
  const currentStyleKey = styles.find((s) => s.style_id === selectedStyleId)?.render_key ?? "regular";
  const styleProfile = useMemo(() => getStyleProfile(currentStyleKey), [currentStyleKey]);
  // Roof Extension is only offered on Loafing Shed buildings.
  const isLoafingShed =
    String(currentStyleKey ?? "").toLowerCase().replace(/[-\s]/g, "_").includes("loafing") ||
    String(selectedStyle?.name ?? "").toLowerCase().includes("loafing");
  const filteredOtherFeatures = useMemo(() => {
    const dwCatId = doorWindowFeature?.category_id;
    let filtered = dwCatId ? otherFeatures.filter((f) => f.category_id !== dwCatId) : otherFeatures;
    filtered = filtered.filter((f) => isFeatureAllowed(styleProfile, f.render_key));
    // Exclude roof_pitch and roof_overhang — they live in the Style tab now
    // Exclude installation_surface — it lives in the Style tab under Building Style
    // Exclude doors & windows category — they have their own tab
    // Exclude Roofing category — no longer shown under the Materials tab
    // Exclude gutter/downspout features — configured via the Style tab's Gutters section
    filtered = filtered.filter((f) => f.render_key !== "roof_pitch" && f.render_key !== "roof_overhang" && f.name !== "Installation Surface" && f.render_key !== "installation_surface");
    filtered = filtered.filter((f) => {
      const cat = (f.category_name || f.category || "").toLowerCase();
      // DB data varies ("Gutter", "Gutter System"; render_key often null), so
      // match name/render_key/category with a normalized substring, same as
      // the gutterFeature lookup used for pricing below.
      const name = String(f.name ?? "").toLowerCase().replace(/[-\s]/g, "_");
      const key = String(f.render_key ?? "").toLowerCase().replace(/[-\s]/g, "_");
      const isGutterRelated =
        name.includes("gutter") || key.includes("gutter") || cat.includes("gutter") ||
        name.includes("downspout") || key.includes("downspout") || cat.includes("downspout");
      return !cat.includes("door") && !cat.includes("window") && !cat.includes("roofing") && !isGutterRelated;
    });
    return filtered;
  }, [otherFeatures, doorWindowFeature, styleProfile]);
  const categories = useMemo(() => [...new Set(filteredOtherFeatures.map((f) => f.category).filter(Boolean))], [filteredOtherFeatures]);

  // ─── SECTIONS LIST (Center + lean-tos) ───────────────────
  const sections = useMemo(() => {
    const list = [{ key: "center", label: "Center Section" }];
    for (const lt of leantos) {
      const sideLabel = (leantoSides ?? []).find((s) => s.side_key === lt.side_key)?.name ?? lt.side_key;
      list.push({ key: lt.side_key, label: `${sideLabel} Section` });
    }
    return list;
  }, [leantos, leantoSides]);

  // Walls available for current section
  const wallsForSection = useMemo(() => {
    if (activeSection === "center") {
      return [
        { key: "left", label: "Left Wall" },
        { key: "back", label: "Back Wall" },
        { key: "right", label: "Right Wall" },
        { key: "front", label: "Front Wall" },
      ];
    }
    // Lean-to walls
    return [
      { key: "outer", label: "Outer Wall" },
      { key: "left_end", label: "Left End" },
      { key: "right_end", label: "Right End" },
    ];
  }, [activeSection]);

  // Reset wall when section changes

  // ─── PRICING CALCULATIONS ────────────────────────────────
  const basePrice = useMemo(() => {
    if (!baseFeature) return 0;
    if (regionBasePriceResult?.base_price != null) return Number(regionBasePriceResult.base_price);
    return 0; // Pricing requires region + style configured
  }, [baseFeature, regionBasePriceResult]);

  const roofStyleBasePrice = useMemo(() => {
    return Number(roofStyleBasePriceResult?.base_price ?? 0);
  }, [roofStyleBasePriceResult]);

  // Roof Overhang upcharge — Base Structure Price × multiplier factor from
  // metal_s_feature_option (e.g. multiplier 0.15 → basePrice × 0.15).
  // 0 when no width/length band matches or no factor is configured.
  const roofOverhangUpcharge = useMemo(() => {
    const factor = Number(roofOverhangMultiplier);
    if (!factor) return 0;
    return basePrice * factor;
  }, [basePrice, roofOverhangMultiplier]);

  // Roof Pitch upcharge — (W × H × L) × multiplier factor from
  // metal_s_feature_option.multiplier (DB-driven — no factor is hardcoded).
  // 0 when no width band matches or no factor is configured.
  const roofPitchUpcharge = useMemo(() => {
    const factor = Number(roofPitchMultiplier);
    if (!factor) return 0;
    return width * height * length * factor;
  }, [width, height, length, roofPitchMultiplier]);

  // The enclosed-wall price lookup is scoped to the "Base Structure Wall"
  // feature (resolved by name), not the generic PANEL "Sides & Ends" feature.
  const baseStructureWallFeature = useMemo(
    () => features.find((f) => String(f.name ?? "").toLowerCase().includes("base structure wall")),
    [features]
  );

  // Flat side/end/gable wall prices looked up from metal_m_panel_pricing
  // using the Base Structure's building size (width × height), region, panel
  // type, and siding style. Gable wall pricing matches metal_m_panel_pricing
  // rows on all four parameters (siding style defaults to Horizontal).
  const wallPanelPrices = useMemo(() => {
    if (!baseStructureWallFeature || (wallMode !== "enclosed" && wallMode !== "gable")) {
      return { side: 0, end: 0, gableEnd: 0 };
    }
    const prices = lookupWallPanelPrices({
      panelPricing,
      panelTypes,
      panelPriceRegions,
      featureId: baseStructureWallFeature.feature_id,
      regionId: selectedRegion?.region_id ?? null,
      width,
      height,
      sidingStyle: DEFAULT_SIDING_STYLE,
    });
    return {
      side: Number(prices.sidePrice) || 0,
      end: Number(prices.endPrice) || 0,
      gableEnd: Number(prices.gableEndPrice) || 0,
    };
  }, [wallMode, baseStructureWallFeature, panelPricing, panelTypes, panelPriceRegions, selectedRegion, width, height]);

  const panelPrice = useMemo(() => {
    if (!panelFeature) return 0;
    if (wallMode === "enclosed") {
      const side = Number(wallPanelPrices.side);
      const end = Number(wallPanelPrices.end);
      const sideCount = panelLocations.filter((l) => l.location_type === "side").length;
      const endCount = panelLocations.filter((l) => l.location_type === "end").length;
      return sideCount * side + endCount * end;
    }
    if (wallMode === "gable") {
      const endCount = panelLocations.filter((l) => l.location_type === "end").length;
      return endCount * Number(wallPanelPrices.gableEnd);
    }
    const locs = panelLocations.filter((l) => l.feature_id === panelFeature.feature_id);
    if (wallMode === "custom") {
      // Custom walls are priced flat from metal_m_panel_pricing rows (panel type
      // "Custom"); each selection is a panel_pricing_id.
      return calcCustomTotalWallPrice(wallSelections, locs, panelPricing);
    }
    const opts = panelOptions.filter((o) => o.feature_id === panelFeature.feature_id);
    return calcTotalPanelPrice(wallSelections, locs, opts, width, length);
  }, [panelFeature, wallMode, wallPanelPrices, panelLocations, panelOptions, panelPricing, wallSelections, width, length]);

  const addOnTotal = useMemo(() => {
    return Object.values(addOnItems).reduce((sum, item) => sum + (item?.price ?? 0), 0);
  }, [addOnItems]);

  const doorWindowTotal = useMemo(() => {
    let total = Object.values(doorWindowSelections).flat().reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    // Lean-to openings
    for (const lt of leantos) {
      if (lt.openings) {
        for (const items of Object.values(lt.openings)) {
          for (const item of items) total += (Number(item.price) || 0);
        }
      }
    }
    return total;
  }, [doorWindowSelections, leantos]);

  const colorUpchargeTotal = useMemo(() => {
    let total = 0;
    for (const [groupId, optionId] of Object.entries(colorSelections)) {
      const opt = colorOptions.find((o) => o.color_option_id === optionId);
      if (opt) total += Number(opt.upcharge);
    }
    return total;
  }, [colorSelections, colorOptions]);

  const leantoTotal = useMemo(() => {
    let total = 0;
    for (const lt of leantos) {
      const match = (leantoPrices ?? []).find(
        (p) => p.leanto_style_id === lt.leanto_style_id && p.style_id === selectedStyleId && p.width_ft === lt.width_ft && p.height_ft === lt.height_ft
      );
      if (match) total += Number(match.price);
    }
    return total;
  }, [leantos, leantoPrices, selectedStyleId]);

  // ─── GUTTER & DOWNSPOUT PRICING ───────────────────────────
  // Rate comes from metal_m_feature_rate (Gutter feature, linear_ft) — no
  // hardcoded fallback. Not called when no gutters are selected or when the
  // database has no active rate.
  // Match the active gutter feature by name/render_key. DB data varies
  // ("Gutter", "Gutter System"; render_key often null), so compare
  // case-insensitively with a substring fallback. features is active-only.
  const gutterFeature = features.find((f) => {
    const name = String(f.name ?? "").toLowerCase().replace(/[-\s]/g, "_");
    const key = String(f.render_key ?? "").toLowerCase().replace(/[-\s]/g, "_");
    return name.includes("gutter") || key.includes("gutter");
  });
  const gutterRatePerLF = lookupFeatureRate(rates, gutterFeature?.feature_id, "linear_ft");
  // Rate-based gutter run (calculateGutterPricing). Its rate-based
  // downspoutPrice is overridden below by computeDownspoutPrice.
  const gutterPricing = useMemo(() => {
    if (guttersSelection !== "Gutters" || gutterRatePerLF == null) return null;
    return calculateGutterPricing({
      buildingLength: length,
      sidewallHeights: [height, ...leantos.filter((lt) => lt.side_key === "left" || lt.side_key === "right").map((lt) => lt.height_ft)],
      gutterSelection: RAIN_GUTTER_SIDE_KEY[rainGuttersSelection] ?? "left",
      downspoutCount,
      ratePerLF: gutterRatePerLF,
    });
  }, [guttersSelection, rainGuttersSelection, downspoutCount, length, height, leantos, gutterRatePerLF]);

  // ─── DOWNSPOUT PRICE (metal_s_feature_option base price) ─
  // Price = basePrice × (tallestSidewallHeight + 1.5) × downspoutCount, where
  // basePrice is the metal_s_feature_option.price of the downspout option row
  // (lookupDownspoutBasePrice) and tallestSidewallHeight (feet) spans the
  // center section leg height plus any left/right lean-tos. The count comes
  // from the "Number of Downspouts" UI field. Downspouts are only priced when
  // gutters are selected; a missing base price or sidewall height yields $0.
  const downspoutBasePrice = lookupDownspoutBasePrice(features, options);
  const downspoutPrice = useMemo(() => {
    if (guttersSelection !== "Gutters") return 0;
    const heights = [height, ...leantos.filter((lt) => lt.side_key === "left" || lt.side_key === "right").map((lt) => lt.height_ft)]
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 0);
    return computeDownspoutPrice({
      basePrice: downspoutBasePrice,
      tallestSidewallHeight: heights.length ? Math.max(...heights) : null,
      downspoutCount: uiDownspoutCount,
    });
  }, [guttersSelection, height, leantos, downspoutBasePrice, uiDownspoutCount]);

  // Combined gutter + downspout pricing for the totals and the estimate
  // drawer: the gutter run keeps calculateGutterPricing's rate-based price;
  // the downspout line uses computeDownspoutPrice (metal_s_feature_option
  // base price) instead of the legacy rate-based value.
  const effectiveGutterPricing = useMemo(() => {
    if (!gutterPricing && downspoutPrice <= 0) return null;
    return {
      gutterLF: gutterPricing?.gutterLF ?? 0,
      gutterPrice: gutterPricing?.gutterPrice ?? 0,
      downspoutLF: gutterPricing?.downspoutLF ?? 0,
      downspoutPrice,
    };
  }, [gutterPricing, downspoutPrice]);
  const gutterTotal = (effectiveGutterPricing?.gutterPrice ?? 0) + (effectiveGutterPricing?.downspoutPrice ?? 0);

  const subtotal = basePrice + roofStyleBasePrice + roofOverhangUpcharge + roofPitchUpcharge + panelPrice + addOnTotal + doorWindowTotal + colorUpchargeTotal + leantoTotal + legHeightPrice + gutterTotal;

  // Region multiplier is already baked into basePrice, roofStyleBasePrice,
  // legHeightPrice, and the flat wall price (enclosed/gable, region-linked rows).
  // Only apply the multiplier to the remaining non-base components.
  // Gutter/downspout prices are region-invariant (same in all regions).
  const grandTotal = useMemo(() => {
    const isFlatWallPricing = wallMode === "enclosed" || wallMode === "gable";
    const regionScoped = basePrice + roofStyleBasePrice + roofOverhangUpcharge + roofPitchUpcharge + legHeightPrice + gutterTotal + (isFlatWallPricing ? panelPrice : 0);
    const regionAdjusted = (isFlatWallPricing ? 0 : panelPrice) + addOnTotal + doorWindowTotal + colorUpchargeTotal + leantoTotal;
    return regionScoped + applyRegionMultiplier(regionAdjusted, selectedRegion);
  }, [selectedRegion, basePrice, roofStyleBasePrice, roofOverhangUpcharge, roofPitchUpcharge, legHeightPrice, gutterTotal, panelPrice, wallMode, addOnTotal, doorWindowTotal, colorUpchargeTotal, leantoTotal]);

  const regionAdjustment = grandTotal - subtotal;

  // Estimate drawer
  const [showEstimateDrawer, setShowEstimateDrawer] = useState(false);

  // ─── DEPOSIT / DISCOUNTS & ADJUSTMENTS STATE ───────────────
  const [depositMode, setDepositMode] = useState("standard"); // standard | customAmount | customPercentage
  const [customDepositAmount, setCustomDepositAmount] = useState(0);
  const [customDepositPercentage, setCustomDepositPercentage] = useState(0);

  const [dealerDiscountMode, setDealerDiscountMode] = useState("amount"); // amount | percentage
  const [dealerDiscountAmount, setDealerDiscountAmount] = useState(0);
  const [dealerDiscountPercentage, setDealerDiscountPercentage] = useState(0);

  // ─── SALES TAX MODE STATE ─────────────────────────────────
  const [salesTaxMode, setSalesTaxMode] = useState("standard"); // standard | exempt | percentage
  const [customTaxPercentage, setCustomTaxPercentage] = useState(7);

  // ─── SERVICES STATE (UI only, not wired to data) ────────────
  const [buildOverFee, setBuildOverFee] = useState(true);
  const [cutLegsOnSite, setCutLegsOnSite] = useState(false);
  const [extraLaborFees, setExtraLaborFees] = useState(false);
  const [engineeringPlans, setEngineeringPlans] = useState(false);

  // Reset dimensions on style change + apply DB defaults
  const [prevStyleId, setPrevStyleId] = useState(selectedStyleId);
  if (prevStyleId !== selectedStyleId) {
    setPrevStyleId(selectedStyleId);
    // Use DB default dimensions from the style row
    const dbW = selectedStyle?.default_width;
    const dbL = selectedStyle?.default_length;
    setWidth(dbW && widths.includes(dbW) ? dbW : widths[0] ?? width);
    setLength(dbL && lengths.includes(dbL) ? dbL : lengths[0] ?? length);
    setHeight(heights.includes(10) ? 10 : heights[0] ?? 10);
    // Wall mode from DB has_walls flag
    const defaultMode = selectedStyle?.has_walls ? "enclosed" : "open";
    setWallMode(defaultMode);
    // Rebuild wall selections to match new mode
    if (panelFeature && panelLocations.length > 0 && panelOptions.length > 0 && defaultMode !== "custom") {
      const newSelections = {};
      for (const loc of panelLocations) {
        let targetType = "open";
        if (defaultMode === "enclosed") targetType = "enclosed";
        else if (defaultMode === "gable") targetType = loc.location_type === "end" ? "gable" : "open";
        const opt = panelOptions.find(
          (o) => o.feature_id === panelFeature.feature_id && o.location_type === loc.location_type && o.render_type === targetType
        );
        if (opt) newSelections[loc.location_id] = opt.option_id;
      }
      setWallSelections(newSelections);
    }
    // Reset all other configuration options to their defaults
    setSidingOptionId(null);
    setDoorWindowSelections({ left: [], back: [], right: [], front: [] });
    setColorSelections({});
    setLeantos([]);
    setLeantoUiOptions({});
    setCollapsedLeantos({});
    setStorageAdded(false);
    setStorageLocation("none");
    setStorageCollapsed(false);
    setStorageDepth(9);
    setActiveSection("center");
    setActiveWall("right");
    setEditingItemIdx(null);
    setConstraintWarning(null);
    setTouchedWallIds(new Set());
    // Reset Sales Tool state
    setDepositMode("standard");
    setCustomDepositAmount(0);
    setCustomDepositPercentage(0);
    setDealerDiscountMode("amount");
    setDealerDiscountAmount(0);
    setDealerDiscountPercentage(0);
    setSalesTaxMode("standard");
    setCustomTaxPercentage(7);
    // Reset Services state
    setBuildOverFee(true);
    setCutLegsOnSite(false);
    setExtraLaborFees(false);
    setEngineeringPlans(false);
  }

  const effectiveTaxRate = useMemo(() => {
    if (salesTaxMode === "exempt") return 0;
    if (salesTaxMode === "percentage") {
      const pct = Number(customTaxPercentage) || 0;
      return Math.max(0, Math.min(pct, 100)) / 100;
    }
    return salesTaxRate; // standard
  }, [salesTaxMode, customTaxPercentage, salesTaxRate]);

  const computedSalesTaxAmount = useMemo(() => {
    return Math.round(grandTotal * effectiveTaxRate * 100) / 100;
  }, [grandTotal, effectiveTaxRate]);

  const computedDepositAmount = useMemo(() => {
    if (depositMode === "standard") return 0;
    if (depositMode === "customAmount") return Number(customDepositAmount) || 0;
    if (depositMode === "customPercentage") {
      return Math.round((grandTotal * (Number(customDepositPercentage) || 0)) / 100 * 100) / 100;
    }
    return 0;
  }, [depositMode, customDepositAmount, customDepositPercentage, grandTotal]);

  const computedDealerDiscount = useMemo(() => {
    if (depositMode === "standard" || computedDepositAmount <= 0) return 0;
    if (dealerDiscountMode === "amount") return Math.min(Number(dealerDiscountAmount) || 0, computedDepositAmount);
    if (dealerDiscountMode === "percentage") {
      return Math.min(
        Math.round((computedDepositAmount * (Number(dealerDiscountPercentage) || 0)) / 100 * 100) / 100,
        computedDepositAmount
      );
    }
    return 0;
  }, [depositMode, computedDepositAmount, dealerDiscountMode, dealerDiscountAmount, dealerDiscountPercentage]);

  const isDealerDiscountInvalid = useMemo(() => {
    if (dealerDiscountMode === "amount") {
      return Number(dealerDiscountAmount) > computedDepositAmount;
    }
    if (dealerDiscountMode === "percentage") {
      return Number(dealerDiscountPercentage) > 100 || (computedDepositAmount <= 0 && Number(dealerDiscountPercentage) > 0);
    }
    return false;
  }, [dealerDiscountMode, dealerDiscountAmount, dealerDiscountPercentage, computedDepositAmount]);

  const depositAmountDueNow = useMemo(() => {
    return Math.max(0, computedDepositAmount - computedDealerDiscount);
  }, [computedDepositAmount, computedDealerDiscount]);

  const dueUponDeliveryAmount = useMemo(() => {
    const taxAmount = Math.round(grandTotal * effectiveTaxRate * 100) / 100;
    const totalEstimate = grandTotal + taxAmount;
    return Math.max(0, totalEstimate - depositAmountDueNow);
  }, [grandTotal, effectiveTaxRate, depositAmountDueNow]);

  const estimate = useMemo(() => buildEstimate({
    selectedStyle,
    width,
    length,
    height,
    legHeightPrice,
    basePrice,
    roofStyleBasePrice,
    wallSelections,
    panelFeature,
    panelLocations,
    panelOptions,
    panelPricing,
    panelTypes,
    wallMode,
    wallPanelPrices,
    sidingStyle: DEFAULT_SIDING_STYLE,
    colorGroups,
    colorOptions,
    colorSelections,
    addOnItems,
    features,
    doorWindowSelections,
    doorWindowItems,
    leantos,
    leantoPrices,
    selectedStyleId,
    selectedRegion,
    zipCode,
    zipCity,
    zipStateCode,
    subtotal,
    grandTotal,
    regionAdjustment,
    taxRate: effectiveTaxRate,
    deposit: computedDepositAmount,
    discount: computedDealerDiscount,
    roofing,
    roofOverhang,
    roofOverhangUpcharge,
    roofPitch,
    roofPitchUpcharge,
    gutterPricing: effectiveGutterPricing,
    gutterSideLabel: rainGuttersSelection,
    // Downspouts are only listed when gutters are selected — passing 0 for
    // "No Gutters" keeps the default count from showing a stray row.
    downspoutCount: guttersSelection === "Gutters" ? uiDownspoutCount : 0,
  }), [selectedStyle, width, length, height, legHeightPrice, basePrice, roofStyleBasePrice, wallSelections, panelFeature, panelLocations, panelOptions, panelPricing, panelTypes, wallMode, wallPanelPrices, colorGroups, colorOptions, colorSelections, addOnItems, features, doorWindowSelections, doorWindowItems, leantos, leantoPrices, selectedStyleId, selectedRegion, zipCode, zipCity, zipStateCode, subtotal, grandTotal, regionAdjustment, effectiveTaxRate, computedDepositAmount, computedDealerDiscount, roofing, roofOverhang, roofOverhangUpcharge, roofPitch, roofPitchUpcharge, effectiveGutterPricing, rainGuttersSelection, guttersSelection, uiDownspoutCount]);

  // ─── WALL PANEL INIT ─────────────────────────────────────
  const [wallSelectionsInited, setWallSelectionsInited] = useState(false);
  if (!wallSelectionsInited && panelLocations.length > 0 && panelOptions.length > 0) {
    setWallSelectionsInited(true);
    // Default walls from the selected style's has_walls flag:
    // carports (has_walls=false) → all Open (no panel → no cost),
    // garages/barns (has_walls=true) → Enclosed.
    const defaultMode = selectedStyle?.has_walls ? "enclosed" : "open";
    const initial = {};
    for (const loc of panelLocations) {
      const opt = panelOptions.find(
        (o) => o.feature_id === panelFeature?.feature_id && o.location_type === loc.location_type && o.render_type === defaultMode
      ) || panelOptions.find(
        (o) => o.feature_id === panelFeature?.feature_id && o.location_type === loc.location_type
      );
      if (opt) initial[loc.location_id] = opt.option_id;
    }
    setWallSelections(initial);
  }

  // ─── ADD-ON HANDLER ──────────────────────────────────────
  const updateAddOn = useCallback((featureId, item) => {
    setAddOnItems((prev) => {
      const next = { ...prev };
      if (!item) delete next[featureId];
      else next[featureId] = item;
      return next;
    });
  }, []);

  // ─── ANCHOR PACKAGE (driven by Installation Surface) ─────
  const surfaceFeature = features.find((f) => f.name === "Installation Surface" || f.render_key === "installation_surface");
  const anchorPackageFeature = features.find((f) => f.name === "Anchor Package" || f.render_key === "anchor_package");

  const syncAnchorPackage = useCallback((surfaceItem) => {
    if (!anchorPackageFeature) return;
    const surfaceName = surfaceItem?.description ?? null;
    // Concrete (or no) surface needs no anchor package — clear any existing one
    // so it never contributes to the estimate.
    if (!surfaceName || surfaceName === DEFAULT_INSTALLATION_SURFACE) {
      updateAddOn(anchorPackageFeature.feature_id, null);
      return;
    }
    const match = lookupOptionByDimensions(options, anchorPackageFeature.feature_id, width, length);
    if (match) {
      updateAddOn(anchorPackageFeature.feature_id, {
        featureId: anchorPackageFeature.feature_id,
        featureName: anchorPackageFeature.name,
        description: match.name,
        price: Number(match.price),
      });
    } else {
      // No size band matches this building — no anchor charge
      updateAddOn(anchorPackageFeature.feature_id, null);
    }
  }, [anchorPackageFeature, options, width, length, updateAddOn]);

  // Handler for the Installation Surface selector — updates the surface
  // add-on and re-syncs the anchor package price for non-concrete surfaces.
  const handleInstallationSurfaceChange = useCallback((featureId, item) => {
    updateAddOn(featureId, item);
    syncAnchorPackage(item);
  }, [updateAddOn, syncAnchorPackage]);

  // Re-lookup the anchor package price when width/length change while a
  // non-concrete installation surface is active.
  useEffect(() => {
    const surfaceItem = surfaceFeature ? addOnItems[surfaceFeature.feature_id] : null;
    if (surfaceItem?.description && surfaceItem.description !== DEFAULT_INSTALLATION_SURFACE) {
      syncAnchorPackage(surfaceItem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, length]);

  // ─── ROOF OVERHANG MULTIPLIER (metal_s_feature_option) ─────
  // The overhang options carry a `multiplier` scoped by width/length bands
  // (min_width/max_width, min_length/max_length — null bounds = unbounded).
  const roofOverhangFeature = useMemo(
    () => features.find((f) => f.render_key === "roof_overhang"),
    [features]
  );

  // Look up the metal_s_feature_option row for an overhang selection matching
  // the building's width/length. Option names are matched by overhang SIZE, not
  // literally: the UI renders `12"` (inch mark) while DB rows may be named
  // `12'` (foot mark) / `12` / `12 inch`, etc. Normalizing to the numeric
  // value keeps both spellings equivalent.
  const lookupRoofOverhangOption = useCallback((overhangName, w, l) => {
    if (!roofOverhangFeature || !overhangName) return null;
    const wantSize = normalizeOverhangName(overhangName);
    const candidates = options
      .filter((o) => o.feature_id === roofOverhangFeature.feature_id && o.is_active !== false && normalizeOverhangName(o.name) === wantSize)
      .sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)) || ((a.option_id ?? 0) - (b.option_id ?? 0)));
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
  }, [roofOverhangFeature, options]);

  // Handler for the Roof Overhang selector — stores the selection and looks
  // up its multiplier factor from metal_s_feature_option.
  const handleRoofOverhangChange = useCallback((overhangName) => {
    setRoofOverhang(overhangName);
    const match = lookupRoofOverhangOption(overhangName, width, length);
    setRoofOverhangMultiplier(match?.multiplier != null ? Number(match.multiplier) : 0);
  }, [lookupRoofOverhangOption, width, length]);

  // Re-lookup the overhang multiplier when the selection, dimensions, or
  // style change (width/length bands may resolve to a different option row).
  useEffect(() => {
    const match = lookupRoofOverhangOption(roofOverhang, width, length);
    setRoofOverhangMultiplier(match?.multiplier != null ? Number(match.multiplier) : 0);
  }, [selectedStyleId, roofOverhang, width, length, lookupRoofOverhangOption]);

  // ─── ROOF PITCH MULTIPLIER (metal_s_feature_option) ──────
  // The pitch options carry a `multiplier` scoped by width bands
  // (min_width/max_width — null bounds = unbounded). Upcharge is computed as
  // (W × H × L) × multiplier — the factor always comes from the DB row.
  const roofPitchFeature = useMemo(() => findRoofPitchFeature(features), [features]);

  // Distinct pitch choices for the selectors — straight from the DB option
  // rows (never hardcoded in the UI).
  const roofPitchOptions = useMemo(() => getRoofPitchOptionNames(features, options), [features, options]);

  // Look up the metal_s_feature_option row for a pitch selection matching the
  // building's width/length. Option names are matched by pitch RISE, not
  // literally: the UI renders `4/12` while DB rows may be named `4:12` or `4`.
  // Normalizing to the numeric rise keeps all spellings equivalent.
  const lookupRoofPitchOption = useCallback((pitchName, w, l) => {
    if (!roofPitchFeature || !pitchName) return null;
    const wantRise = normalizePitchName(pitchName);
    const candidates = options
      .filter((o) => o.feature_id === roofPitchFeature.feature_id && o.is_active !== false && normalizePitchName(o.name) === wantRise)
      .sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)) || ((a.option_id ?? 0) - (b.option_id ?? 0)));
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
  }, [roofPitchFeature, options]);

  // Handler for the Roof Pitch selector — stores the selection and looks up
  // its multiplier factor from metal_s_feature_option.
  const handleRoofPitchChange = useCallback((pitchName) => {
    setRoofPitch(pitchName);
    const match = lookupRoofPitchOption(pitchName, width, length);
    setRoofPitchMultiplier(match?.multiplier != null ? Number(match.multiplier) : 0);
  }, [lookupRoofPitchOption, width, length]);

  // Re-lookup the pitch multiplier when the selection, dimensions, or style
  // change (width bands may resolve to a different option row).
  useEffect(() => {
    const match = lookupRoofPitchOption(roofPitch, width, length);
    setRoofPitchMultiplier(match?.multiplier != null ? Number(match.multiplier) : 0);
  }, [selectedStyleId, roofPitch, width, length, lookupRoofPitchOption]);

  // Siding panel pricing — update add-on when siding option changes
  const changeSidingOption = useCallback((optId) => {
    setSidingOptionId(optId);
    if (!sidingFeature) return;
    if (!optId) { updateAddOn(sidingFeature.feature_id, null); return; }
    const opt = sidingOptions.find((o) => o.option_id === optId);
    if (!opt) { updateAddOn(sidingFeature.feature_id, null); return; }
    updateAddOn(sidingFeature.feature_id, { featureId: sidingFeature.feature_id, featureName: sidingFeature.name, description: opt.name, price: Number(opt.price) });
  }, [sidingFeature, sidingOptions, updateAddOn]);

  // ─── DOOR/WINDOW ADD/REMOVE (section-aware + constraints) ──
  const addItemToWall = (item) => {
    // ── Engineering constraint check ──
    const wallW = getWallWidthFt(activeWall, activeSection, width, length, leantos);
    const wallH = getWallHeightFt(activeSection, height, leantos, activeWall);
    const validation = validateItemForWall(item, currentWallItems, wallW, wallH);
    if (!validation.ok) {
      setConstraintWarning(validation.reason);
      return;
    }
    setConstraintWarning(null);

    if (activeSection === "center") {
      setDoorWindowSelections((prev) => ({
        ...prev,
        [activeWall]: [...(prev[activeWall] || []), { item_id: item.item_id, name: item.name, price: item.price }]
      }));
    } else {
      // Lean-to
      const ltIdx = leantos.findIndex((lt) => lt.side_key === activeSection);
      if (ltIdx < 0) return;
      setLeantos((prev) => prev.map((entry, i) => {
        if (i !== ltIdx) return entry;
        const openings = entry.openings || { outer: [], left_end: [], right_end: [] };
        return {
          ...entry,
          openings: { ...openings, [activeWall]: [...(openings[activeWall] || []), { item_id: item.item_id, name: item.name, price: item.price }] }
        };
      }));
    }
  };

  const removeItemFromWall = (removeIdx) => {
    if (activeSection === "center") {
      setDoorWindowSelections((prev) => {
        const list = [...(prev[activeWall] || [])];
        list.splice(removeIdx, 1);
        return { ...prev, [activeWall]: list };
      });
    } else {
      const ltIdx = leantos.findIndex((lt) => lt.side_key === activeSection);
      if (ltIdx < 0) return;
      setLeantos((prev) => prev.map((entry, i) => {
        if (i !== ltIdx) return entry;
        const openings = entry.openings || { outer: [], left_end: [], right_end: [] };
        const list = [...(openings[activeWall] || [])];
        list.splice(removeIdx, 1);
        return { ...entry, openings: { ...openings, [activeWall]: list } };
      }));
    }
  };

  // Items on current wall
  const currentWallItems = useMemo(() => {
    if (activeSection === "center") return doorWindowSelections[activeWall] || [];
    const found = leantos.find((x) => x.side_key === activeSection);
    if (!found || !found.openings) return [];
    return found.openings[activeWall] || [];
  }, [activeSection, activeWall, doorWindowSelections, leantos]);

  const replaceItemOnWall = (replaceIdx, newItem) => {
    // Validate the replacement (exclude the item being replaced from existing)
    const wallW = getWallWidthFt(activeWall, activeSection, width, length, leantos);
    const wallH = getWallHeightFt(activeSection, height, leantos, activeWall);
    const otherItems = currentWallItems.filter((_, i) => i !== replaceIdx);
    const validation = validateItemForWall(newItem, otherItems, wallW, wallH);
    if (!validation.ok) {
      setConstraintWarning(validation.reason);
      return;
    }
    setConstraintWarning(null);

    if (activeSection === "center") {
      setDoorWindowSelections((prev) => {
        const list = [...(prev[activeWall] || [])];
        list[replaceIdx] = { item_id: newItem.item_id, name: newItem.name, price: newItem.price };
        return { ...prev, [activeWall]: list };
      });
    } else {
      const ltIdx = leantos.findIndex((lt) => lt.side_key === activeSection);
      if (ltIdx < 0) return;
      setLeantos((prev) => prev.map((entry, i) => {
        if (i !== ltIdx) return entry;
        const openings = entry.openings || { outer: [], left_end: [], right_end: [] };
        const list = [...(openings[activeWall] || [])];
        list[replaceIdx] = { item_id: newItem.item_id, name: newItem.name, price: newItem.price };
        return { ...entry, openings: { ...openings, [activeWall]: list } };
      }));
    }
  };

  const duplicateItemOnWall = (dupIdx) => {
    const item = currentWallItems[dupIdx];
    if (!item) return;
    addItemToWall({ item_id: item.item_id, name: item.name, price: item.price });
  };

  // ─── HEADER LABEL ────────────────────────────────────────
  const headerLabel = `${selectedStyle?.name ?? "Structure"} (${width}×${length}×${height})`;

  // Walls map used for openings validation
  const walls3d = useMemo(() => {
    if (!panelFeature) return {};
    const locs = panelLocations.filter((l) => l.feature_id === panelFeature.feature_id);
    const result = {};
    for (const loc of locs) {
      let wallType = false;
      if (wallMode === "custom") {
        // Custom selections are panel_pricing_ids; derive the render type from the
        // row's option_name (metal_m_panel_pricing has no render_type column).
        const row = findCustomWallRow(panelPricing, wallSelections[loc.location_id]);
        if (row) wallType = deriveCustomRenderType(row);
      } else {
        const optId = wallSelections[loc.location_id];
        const opt = panelOptions.find((o) => o.option_id === optId);
        if (opt && opt.render_type !== "open") wallType = opt.render_type ?? "enclosed";
      }
      if (loc.name.includes("Front")) result.front = wallType;
      else if (loc.name.includes("Back")) result.back = wallType;
      else if (loc.name.includes("Left")) result.left = wallType;
      else if (loc.name.includes("Right")) result.right = wallType;
    }
    return result;
  }, [panelFeature, panelLocations, panelOptions, panelPricing, wallSelections, wallMode]);

  // Disable body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ─── ITEM TYPES from DB ──────────────────────────────────
  const itemTypes = useMemo(() => {
    if (!doorWindowItems || doorWindowItems.length === 0) return [];
    return [...new Set(doorWindowItems.map((i) => i.item_type))];
  }, [doorWindowItems]);

  // ─── ADD LEAN-TO HELPER ──────────────────────────────────
  const addLeanTo = (sideKey) => {
    const defaultStyle = availableLeantoStyles[0];
    if (!defaultStyle) return;
    const usedSides = new Set(leantos.map((x) => x.side_key));
    if (usedSides.has(sideKey)) return;
    const isSideNew = sideKey === "left" || sideKey === "right";
    const ltWidths = getLeantoWidths(defaultStyle.leanto_style_id).filter((v) => v < (isSideNew ? width : length));
    const ltHeights = getLeantoHeights(defaultStyle.leanto_style_id).filter((v) => v < height);
    const maxLen = isSideNew ? length : width;
    const defaultWallMode = "open";
    setLeantos((prev) => [...prev, {
      leanto_style_id: defaultStyle.leanto_style_id,
      render_key: defaultStyle.render_key,
      side_key: sideKey,
      width_ft: ltWidths[0] ?? 10,
      height_ft: ltHeights[0] ?? 6,
      length_ft: maxLen,
      wallMode: defaultWallMode,
      walls: applyLtWallMode(defaultWallMode),
      openings: { outer: [], left_end: [], right_end: [] },
    }]);
    setLeantoUiOptions((prev) => ({ ...prev, [sideKey]: { ...LT_UI_DEFAULTS } }));
    setActiveSection(sideKey);
    setActiveWall("outer");
  };

  const removeLeanTo = (sideKey) => {
    setLeantos((prev) => prev.filter((lt) => lt.side_key !== sideKey));
    setLeantoUiOptions((prev) => {
      const next = { ...prev };
      delete next[sideKey];
      return next;
    });
    setCollapsedLeantos((prev) => {
      const next = { ...prev };
      delete next[sideKey];
      return next;
    });
    setActiveSection("center");
    setActiveWall("right");
  };

  // ─── RENDER ──────────────────────────────────────────────
  return (
    <div className="d-flex" style={{ height: "calc(100vh - 56px)", overflow: "hidden", margin: 0 }}>
      {/* ═══ LEFT: 3D Preview ═══ */}
      <div style={{ flex: "0 0 70%", position: "relative", background: "#f5f5f5" }}>
        {/* 3D preview placeholder */}
        <div className="d-flex align-items-center justify-content-center h-100 w-100">
          <div className="text-center">
            <AppIcon icon="cube" className="fs-1 text-muted mb-2" />
            <h5 className="text-muted">This feature is coming soon.</h5>
          </div>
        </div>

        {/* Top-left label */}
        <div style={{ position: "absolute", top: 16, left: 16 }}>
          <h5 className="mb-0 fw-bold" style={{ color: "#333" }}>{headerLabel}</h5>
        </div>

        </div>

      {/* ═══ RIGHT: Configuration Panel ═══ */}
      <div style={{ flex: "0 0 30%", display: "flex", flexDirection: "column", borderLeft: "1px solid #ddd", position: "relative", minWidth: 0 }} className="bg-white">
        {/* Fixed header */}
        <div className="p-3 border-bottom" style={{ flexShrink: 0 }}>
          <div className="fw-bold" style={{ fontSize: "1.1rem", color: "#222" }}>{selectedStyle?.name} ({width}×{length}×{height})</div>
          
          {/* Fixed location panel (above buttons) */}
          <div className="mt-2 p-2 bg-light rounded-2 border">
            <div className="d-flex justify-content-between align-items-start gap-2">
              <div className="small">
                {zipCode ? (
                  <>
                    <div className="fw-semibold">
                      <h4 className="mb-0 fw-bold" style={{ color: "#333" }}>Deliver To: </h4> <br />
                      <AppIcon icon="map-marker-alt" className="me-1 text-muted" style={{ fontSize: 11 }} />
                      {zipCode}{zipCity ? ` · ${zipCity}` : ""}{zipStateCode ? `, ${zipStateCode}` : ""}
                    </div>
                    <div className="text-muted">
                      {selectedRegion ? `${selectedRegion.name} (${selectedRegion.state_code})` : "No region identified — default pricing applies"}
                    </div>
                    {salesTaxRate !== 0.07 && (
                      <div className="text-muted small">
                        Sales Tax: {(salesTaxRate * 100).toFixed(2)}%
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-muted">Enter ZIP to continue</div>
                )}
              </div>
              <button
                className="btn btn-sm btn-outline-secondary"
                style={{ flexShrink: 0 }}
                onClick={() => { setShowZipModal(true); setZipDraft(zipCode ?? ""); setZipError(null); setZipNotFoundDigits(null); }}
              >
                Change ZIP
              </button>
            </div>
          </div>

          {/* Mode buttons */}
          <div className="psb-tabs mt-2">
            {[
              { mode: "building", icon: "building", label: "Style" },
              { mode: "leantos", icon: "layer-group", label: "Sides & Ends" },
              { mode: "openings", icon: "door-open", label: "Doors & Windows" },
              { mode: "colors", icon: "palette", label: "Colors" },
              { mode: "materials", icon: "gear", label: "Materials" },
              { mode: "salestax", icon: "receipt", label: "Sales Tool" },
              { mode: "services", icon: "shield", label: "Services, Financing & Warranty" },
            ].map(({ mode, icon, label }) => (
              <Button key={mode} type="button" variant="ghost"
                className={`psb-tab-btn ${rightPanelMode === mode ? "is-active" : ""}`}
                onClick={() => setRightPanelMode(mode)}>
                <AppIcon icon={icon} /> {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>

        {/* ─── TAB: BUILDING (Style + Size) ──── */}
        {rightPanelMode === "building" && (
          <div className="p-3">
            {/* Style */}
            <div className="fw-semibold mb-2">Building Style</div>
            <div className="row row-cols-3 g-2 mb-3">
              {styles.map((style) => (
                <div key={style.style_id} className="col">
                  <div
                    className={`card h-100 text-center p-1 ${selectedStyleId === style.style_id ? "border-primary border-2" : ""}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => handleStyleChange(style.style_id)}
                  >
                    <img src={getStyleIconPath(style)} alt={style.name} className="d-block mx-auto" style={{ width: 175, height: 175, maxWidth: "100%", objectFit: "contain" }} />
                    <div className="small" style={{ fontSize: "0.75rem" }}>{style.name}</div>
                  </div>
                </div>
              ))}
            </div>

            <SectionDivider />
            {/* Dimensions */}
            <div className="fw-semibold mb-2">Dimensions</div>
            <div className="row g-2 mb-3">
              <div className="col-4">
                <label className="form-label small mb-0">Width</label>
                <select className="form-select form-select-sm" value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}>
                  {[...new Set([width, ...widths])].sort((a, b) => a - b).map((w) => <option key={w} value={w}>{w}&apos;</option>)}
                </select>
              </div>
              <div className="col-4">
                <label className="form-label small mb-0">Length</label>
                <select className="form-select form-select-sm" value={length}
                  onChange={(e) => setLength(Number(e.target.value))}>
                  {[...new Set([length, ...lengths])].sort((a, b) => a - b).map((l) => <option key={l} value={l}>{l}&apos;</option>)}
                </select>
              </div>
              <DimensionSpinner label="Leg Height" value={height} options={heights} onChange={setHeight} />
            </div>

            {/* Installation Surface */}
            {(() => {
              const surfaceFeat = features.find((f) => f.name === "Installation Surface" || f.render_key === "installation_surface");
              if (!surfaceFeat) return null;
              return (<>
                <SectionDivider />
                <FeatureSelector feature={surfaceFeat} options={options} rates={rates} addOnItems={addOnItems} updateAddOn={handleInstallationSurfaceChange} width={width} length={length} panelLocations={panelLocations} />
              </>);
            })()}

            <SectionDivider />
            {/* Roofing */}
            <div className="mb-3">
              <div className="fw-semibold mb-2">
                Roofing:{" "}
                {roofing === "Horizontal" ? "A-Frame Horizontal" : "A-Frame Vertical"}
              </div>
              <div className="d-flex flex-column gap-2">
                {[
                  { value: "Vertical", label: "A-Frame Vertical" },
                  { value: "Horizontal", label: "A-Frame Horizontal" },
                ].map((opt) => (
                  <div key={opt.value} className="form-check d-flex align-items-center">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="roofing"
                      id={`roofing-${opt.value}`}
                      value={opt.value}
                      checked={!!roofing && roofing === opt.value}
                      onChange={() => setRoofing(opt.value)}
                      style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                    />
                    <label className="form-check-label" htmlFor={`roofing-${opt.value}`}>
                      {opt.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <SectionDivider />
            {/* Roof Pitch */}
            <div className="mb-3">
              <div className="fw-semibold mb-2">
                Roof Pitch: {roofPitch || "—"}
                {roofPitchUpcharge > 0 && (
                  <span className="text-muted fw-normal ms-2">+{formatCurrency(roofPitchUpcharge)}</span>
                )}
              </div>
              <div className="d-flex flex-column gap-2">
                {roofPitchOptions.length === 0 && (
                  <div className="text-muted small">No roof pitch options configured.</div>
                )}
                {roofPitchOptions.map((pitch) => (
                  <div key={pitch} className="form-check d-flex align-items-center">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="roof-pitch"
                      id={`roof-pitch-${pitch.replace("/", "-")}`}
                      value={pitch}
                      checked={!!roofPitch && roofPitch === pitch}
                      onChange={() => handleRoofPitchChange(pitch)}
                      style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                    />
                    <label className="form-check-label" htmlFor={`roof-pitch-${pitch.replace("/", "-")}`}>
                      {pitch}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <SectionDivider />
            {/* Roof Overhang */}
            <div className="mb-3">
              <div className="fw-semibold mb-2">Roof Overhang: {roofOverhang || '6"'}</div>
              <div className="d-flex flex-column gap-2">
                {['6"', '12"', '18"'].map((overhang) => (
                  <div key={overhang} className="form-check d-flex align-items-center">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="roof-overhang"
                      id={`roof-overhang-${overhang.replace('"', "")}`}
                      value={overhang}
                      checked={!!roofOverhang && roofOverhang === overhang}
                      onChange={() => handleRoofOverhangChange(overhang)}
                      style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                    />
                    <label className="form-check-label" htmlFor={`roof-overhang-${overhang.replace('"', "")}`}>
                      {overhang}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {isLoafingShed && (<>
              <SectionDivider />
              {/* Roof Extension (UI only — not wired to state/pricing yet) */}
              <div className="mb-3">
                <div className="text-muted mb-2">Roof Extension: Roof Extension</div>
                <div className="d-flex flex-column gap-2">
                  {["None", "Roof Extension"].map((opt) => {
                    const id = `roof-extension-${opt.toLowerCase().replace(/\s+/g, "-")}`;
                    return (
                      <div key={opt} className="form-check d-flex align-items-center">
                        <input
                          className="form-check-input"
                          type="radio"
                          name="roof-extension"
                          id={id}
                          value={opt}
                          defaultChecked={opt === "Roof Extension"}
                          style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                        />
                        <label className="form-check-label" htmlFor={id}>
                          {opt}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>)}

            <SectionDivider />
            {/* Gutters (UI state only — not wired to pricing yet) */}
            <div className="mb-3">
              <div className="fw-semibold mb-2">Gutters</div>
              <div className="d-flex flex-column gap-2">
                {["No Gutters", "Gutters"].map((opt) => {
                  const id = `gutters-${opt.toLowerCase().replace(/\s+/g, "-")}`;
                  return (
                    <div key={opt} className="form-check d-flex align-items-center">
                      <input
                        className="form-check-input"
                        type="radio"
                        name="gutters"
                        id={id}
                        value={opt}
                        checked={guttersSelection === opt}
                        onChange={() => setGuttersSelection(opt)}
                        style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                      />
                      <label className="form-check-label" htmlFor={id}>
                        {opt}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            {guttersSelection === "Gutters" && (<>
              <SectionDivider />
              {/* Rain Gutters (drives gutter pricing) */}
              <div className="mb-3">
                <div className="text-muted mb-2">Rain Gutters: {rainGuttersSelection}</div>
                <div className="d-flex flex-column gap-2">
                  {["Left Side Gutters", "Right Side Gutters", "Both Sides Gutters"].map((opt) => {
                    const id = `rain-gutters-${opt.toLowerCase().replace(/\s+/g, "-")}`;
                    return (
                      <div key={opt} className="form-check d-flex align-items-center">
                        <input
                          className="form-check-input"
                          type="radio"
                          name="rain-gutters"
                          id={id}
                          value={opt}
                          checked={rainGuttersSelection === opt}
                          onChange={() => {
                            setRainGuttersSelection(opt);
                            // The gutter side re-seeds the downspout default
                            // (standard carport only): Both Sides → 4, one side → 2.
                            if (isStandardCarportStyle(selectedStyle)) {
                              setUiDownspoutCount(getDefaultDownspoutCount(selectedStyle, opt));
                            }
                          }}
                          style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                        />
                        <label className="form-check-label" htmlFor={id}>
                          {opt}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              <SectionDivider />
              {/* Number of Downspouts — drives the downspout price (computeDownspoutPrice) and the estimate */}
              <div className="mb-3">
                <label className="text-muted mb-2" htmlFor="downspout-count">Number of Downspouts</label>
                <input
                  id="downspout-count"
                  type="number"
                  className="form-control"
                  min={0}
                  max={10}
                  step={1}
                  value={uiDownspoutCount}
                  onChange={(e) => {
                    const n = Math.trunc(Number(e.target.value) || 0);
                    setUiDownspoutCount(Math.min(10, Math.max(0, n)));
                  }}
                />
              </div>
            </>)}
          </div>
        )}

        {/* ─── TAB: SIDES & ENDS (Walls + Lean-Tos) ────────────────────────────── */}
        {rightPanelMode === "leantos" && (
          <div className="p-3">
            {/* Walls — main building sides & ends */}
            <div className="fw-semibold mb-2">Walls: {wallMode || 'Open'}</div>
            <div className="mb-3">
              <div className="d-flex gap-1 flex-wrap">
                {["open", "enclosed", "gable", "custom"].map((m) => (
                  <button key={m}
                    className={`btn btn-sm flex-fill ${wallMode === m ? "btn-dark" : "btn-outline-secondary"}`}
                    onClick={() => applyMode(m)}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {wallMode === "custom" && panelFeature && <SectionDivider />}
            {wallMode === "custom" && panelFeature && (
              <div className="mb-3">
                <div className="small fw-semibold mb-2">Per-Wall Panels</div>
                {panelLocations.map((loc) => {
                  // Custom wall options come from metal_m_panel_pricing where the
                  // panel type is "Custom" (matched to this wall's location_type).
                  const locOpts = getCustomWallOptions({
                    panelPricing,
                    panelTypes,
                    locationType: loc.location_type,
                  });
                  return (
                    <div key={loc.location_id} className="mb-2">
                      <label className="form-label small mb-0">{loc.name}</label>
                      <select className="form-select form-select-sm"
                        value={wallSelections[loc.location_id] ?? ""}
                        onChange={(e) => changeWallSelection(loc.location_id, e.target.value)}>
                        <option value="">Open (No Panel)</option>
                        {locOpts.map((o) => (
                          <option key={o.panel_pricing_id} value={o.panel_pricing_id}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            <SectionDivider />
            {/* Storage — center storage (UI only, not wired to pricing/3D yet) */}
            {!storageAdded ? (
              <div className="mb-3">
                <div className="text-muted small mb-2">Center Storage: none</div>
                <button type="button" className="btn btn-outline-dark rounded-pill w-100 fw-semibold"
                  onClick={() => { setStorageAdded(true); setStorageCollapsed(false); setStorageLocation("none"); setStorageDepth(9); }}>
                  Add Storage
                </button>
              </div>
            ) : (
              <div className="mb-3 p-2 border rounded bg-light">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div className="fw-semibold small d-flex align-items-center gap-1" style={{ cursor: "pointer" }}
                    onClick={() => setStorageCollapsed((c) => !c)}
                    title={storageCollapsed ? "Expand" : "Collapse"}>
                    <AppIcon icon={storageCollapsed ? "chevron-down" : "chevron-up"} style={{ fontSize: 10 }} />
                    Center Storage: {storageLocation}, {storageDepth}&apos; Storage Depth
                  </div>
                  <button className="btn btn-link btn-sm text-danger p-0"
                    onClick={() => { setStorageAdded(false); setStorageLocation("none"); setStorageCollapsed(false); setStorageDepth(9); }}>
                    Remove
                  </button>
                </div>

                {!storageCollapsed && (
                  <div>
                    <div className="text-muted small mb-2">
                      Location: {STORAGE_LOCATIONS.find((o) => o.value === storageLocation)?.label ?? "None"}
                    </div>
                    {STORAGE_LOCATIONS.map((o) => (
                      <div className="form-check" key={o.value}>
                        <input className="form-check-input" type="radio" name="storage-location" id={`storage-loc-${o.value}`}
                          checked={storageLocation === o.value}
                          onChange={() => setStorageLocation(o.value)} />
                        <label className="form-check-label" htmlFor={`storage-loc-${o.value}`}>{o.label}</label>
                      </div>
                    ))}

                    {/* Depth — placeholder */}
                    <div className="mb-2">
                      <div className="text-muted small mb-1">Depth: {storageDepth}&apos;</div>
                      <select className="form-select form-select-sm" value={storageDepth}
                        onChange={(e) => setStorageDepth(Number(e.target.value))}>
                        {STORAGE_DEPTHS.map((d) => <option key={d} value={d}>{d}&apos;</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            <SectionDivider />
            <div className="fw-semibold mb-2">Add or Edit Lean-to&apos;s</div>

            {/* Visual wall picker — compact cross layout */}
            {availableLeantoStyles.length > 0 && (() => {
              const usedSides = new Set(leantos.map((x) => x.side_key));
              const S = ({ sk, lb }) => {
                const on = usedSides.has(sk);
                const img = getLeantoSideImagePath((leantoSides ?? []).find((s) => s.side_key === sk));
                return (
                  <div
                    className="psb-lts-side"
                    onClick={() => { if (on) { setActiveSection(sk); setLeantoFocusTick((t) => t + 1); } else { addLeanTo(sk); setLeantoFocusTick((t) => t + 1); } }}
                    title={on ? `Remove ${lb}` : `Add ${lb}`}
                  >
                    <div className={`psb-lts-tile ${on ? "is-on" : ""}`}>
                      {img && (
                        <img src={img} alt={lb} className="psb-lts-img" />
                      )}
                      <span className={`psb-lts-badge ${on ? "is-on" : ""}`}>
                        <AppIcon icon={on ? "check" : "plus"} style={{ fontSize: 10 }} />
                      </span>
                    </div>
                    <div className="psb-lts-label">{lb}</div>
                  </div>
                );
              };
              return (
                <div className="d-flex flex-column align-items-center gap-2 mb-2">
                  <S sk="back" lb="Back" />
                  <div className="d-flex gap-3">
                    <S sk="left" lb="Left" />
                    <S sk="right" lb="Right" />
                  </div>
                  <S sk="front" lb="Front" />
                </div>
              );
            })()}

            {leantos.length > 0 && <SectionDivider />}
            {leantos.map((lt, ltIdx) => {
              const sideLabel = (leantoSides ?? []).find((s) => s.side_key === lt.side_key)?.name ?? lt.side_key;
              const isSide = lt.side_key === "left" || lt.side_key === "right";
              const ltWidths = getLeantoWidths(lt.leanto_style_id);
              const ltHeights = getLeantoHeights(lt.leanto_style_id);
              const maxLen = isSide ? length : width;
              const ltLengths = FALLBACK_LT_LENGTHS.filter((v) => v <= maxLen);
              if (!ltLengths.includes(maxLen)) ltLengths.push(maxLen);
              ltLengths.sort((a, b) => a - b);
              const currentWallMode = lt.wallMode || "open";
              const ltUi = leantoUiOptions[lt.side_key] ?? LT_UI_DEFAULTS;
              // Normalize stale Wrap values (e.g. "None" from before the option rename) to the default
              if (!LT_WRAP_OPTIONS.includes(ltUi.wrap)) ltUi.wrap = LT_UI_DEFAULTS.wrap;
              // Normalize stale/absent pitch values to a DB-listed pitch option
              if (!roofPitchOptions.some((p) => normalizePitchName(p) === normalizePitchName(ltUi.roofPitch))) ltUi.roofPitch = roofPitchOptions[0] ?? ltUi.roofPitch;
              const setLtUi = (patch) => updateLtUi(lt.side_key, patch);
              const isLtCollapsed = !!collapsedLeantos[lt.side_key];
              return (
                <div key={lt.side_key} className="mb-3 p-2 border rounded bg-light" style={{ cursor: "pointer" }}
                  onClick={() => { setActiveSection(lt.side_key); setLeantoFocusTick((t) => t + 1); }}>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <div className="fw-semibold small d-flex align-items-center gap-1" style={{ cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); toggleLeantoCollapsed(lt.side_key); }}
                      title={isLtCollapsed ? "Expand" : "Collapse"}>
                      <AppIcon icon={isLtCollapsed ? "chevron-down" : "chevron-up"} style={{ fontSize: 10 }} />
                      {sideLabel} Lean-To
                    </div>
                    <button className="btn btn-link btn-sm text-danger p-0" onClick={(e) => { e.stopPropagation(); removeLeanTo(lt.side_key); }}>Remove</button>
                  </div>

                  {!isLtCollapsed && (<>
                  {/* Lean-to style selector */}
                  {availableLeantoStyles.length > 1 && (
                    <div className="mb-2">
                      <div className="d-flex gap-1 flex-wrap">
                        {availableLeantoStyles.map((s) => (
                          <button key={s.leanto_style_id}
                            className={`btn btn-sm ${lt.leanto_style_id === s.leanto_style_id ? "btn-dark" : "btn-outline-secondary"}`}
                            style={{ fontSize: 11 }}
                            onClick={() => setLeantos((prev) => prev.map((item, i) => i === ltIdx ? {
                              ...item,
                              leanto_style_id: s.leanto_style_id,
                              render_key: s.render_key,
                              wallMode: s.render_key === "enclosed" ? "enclosed" : "open",
                              walls: applyLtWallMode(s.render_key === "enclosed" ? "enclosed" : "open"),
                            } : item))}>
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Wall mode */}
                  <div className="mb-2">
                    <label className="form-label small mb-1 fw-semibold">Walls</label>
                    <div className="d-flex gap-1 flex-wrap">
                      {LT_WALL_MODES.map((m) => (
                        <button key={m.key}
                          className={`btn btn-sm ${currentWallMode === m.key ? "btn-dark" : "btn-outline-secondary"}`}
                          onClick={() => {
                            const newWalls = applyLtWallMode(m.key);
                            setLeantos((prev) => prev.map((item, i) => i === ltIdx ? {
                              ...item,
                              wallMode: m.key,
                              ...(newWalls ? { walls: newWalls } : {}),
                            } : item));
                          }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Per-wall customization (only shown in custom mode) */}
                  {currentWallMode === "custom" && (
                    <div className="mb-2 ps-1">
                      {["outer", "left_end", "right_end"].map((wk) => {
                        const wLabel = wk === "outer" ? "Outer" : wk === "left_end" ? "Left End" : "Right End";
                        const wVal = lt.walls?.[wk] || "open";
                        return (
                          <div key={wk} className="d-flex align-items-center gap-2 mb-1">
                            <span className="small" style={{ width: 70 }}>{wLabel}</span>
                            {["enclosed", "open", "gable"].map((opt) => (
                              <button key={opt}
                                className={`btn btn-sm py-0 px-2 ${wVal === opt ? "btn-dark" : "btn-outline-secondary"}`}
                                onClick={() => setLeantos((prev) => prev.map((item, i) => i === ltIdx ? {
                                  ...item,
                                  walls: { ...item.walls, [wk]: opt },
                                } : item))}>
                                {opt === "enclosed" ? "Enclosed" : opt === "open" ? "Open" : "Gable"}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Dimensions */}
                  <div className="row g-2">
                    <div className="col-4">
                      <label className="form-label small mb-0">Width</label>
                      <select className="form-select form-select-sm" value={lt.width_ft}
                        onChange={(e) => setLeantos((prev) => prev.map((item, i) => i === ltIdx ? { ...item, width_ft: Number(e.target.value) } : item))}>
                        {ltWidths.filter((v) => v < (isSide ? width : length)).map((w) => <option key={w} value={w}>{w}&apos;</option>)}
                      </select>
                    </div>
                    <div className="col-4">
                      <label className="form-label small mb-0">Length</label>
                      <select className="form-select form-select-sm" value={lt.length_ft}
                        onChange={(e) => setLeantos((prev) => prev.map((item, i) => i === ltIdx ? { ...item, length_ft: Number(e.target.value) } : item))}>
                        {ltLengths.map((v) => <option key={v} value={v}>{v}&apos;</option>)}
                      </select>
                    </div>
                    <div className="col-4">
                      <label className="form-label small mb-0">Leg Height</label>
                      <select className="form-select form-select-sm" value={lt.height_ft}
                        onChange={(e) => setLeantos((prev) => prev.map((item, i) => i === ltIdx ? { ...item, height_ft: Number(e.target.value) } : item))}>
                        {ltHeights.filter((v) => v < height).map((h) => <option key={h} value={h}>{h}&apos;</option>)}
                      </select>
                    </div>
                  </div>

                  {/* ── Feature options (UI only — not wired to pricing/3D yet) ── */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <SectionDivider />
                    {/* Roof Pitch */}
                    <LtRadioGroup sideKey={lt.side_key} field="roof-pitch" label="Roof Pitch" value={ltUi.roofPitch}
                      options={roofPitchOptions} onChange={(v) => setLtUi({ roofPitch: v })} />

                    <SectionDivider />
                    {/* Wrap */}
                    <LtRadioGroup sideKey={lt.side_key} field="wrap" label="Wrap" value={ltUi.wrap}
                      options={LT_WRAP_OPTIONS} onChange={(v) => setLtUi({ wrap: v })} />
                  </div>
                  </>)}
                </div>
              );
            })}

            {availableLeantoStyles.length > 0 && leantos.length < (leantoSides ?? []).length && (
              <div className="text-muted small text-center mt-1">Click a side above to add or remove a lean-to.</div>
            )}
          </div>
        )}

        {/* ─── TAB: OPENINGS (Section → Wall → Items) ─── */}
        {rightPanelMode === "openings" && (
          <div className="p-3">
            <div className="fw-bold mb-1">Doors &amp; Windows</div>
            <p className="text-muted small mb-2">
              Add items using the buttons below. Then, select the item on the wall to change its style, size, or features.
            </p>

            <SectionDivider />
            {/* Section selector */}
            <div className="mb-3">
              <div className="fw-semibold small mb-1">Section</div>
              <div className="d-flex gap-1 flex-wrap">
                {sections.map((sec) => (
                  <button key={sec.key}
                    className={`btn btn-sm ${activeSection === sec.key ? "btn-dark" : "btn-outline-secondary"}`}
                    onClick={() => changeSection(sec.key)}>
                    {sec.label}
                  </button>
                ))}
              </div>
            </div>

            <SectionDivider />
            {/* Wall selector */}
            <div className="mb-3">
              <div className="fw-semibold small mb-1">Wall</div>
              <div className="d-flex gap-1">
                {wallsForSection.map((w) => {
                  const isOpen = activeSection === "center" && walls3d[w.key] === false;
                  return (
                    <button key={w.key}
                      className={`btn btn-sm flex-fill ${activeWall === w.key ? "btn-dark" : isOpen ? "btn-outline-secondary opacity-50" : "btn-outline-secondary"}`}
                      onClick={() => setActiveWall(w.key)}>
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Guard: wall is open — no items allowed */}
            {activeSection === "center" && walls3d[activeWall] === false ? (
              <div className="alert alert-secondary small py-2">
                This wall is open. Change the wall mode in the <strong>Building</strong> tab to add items.
              </div>
            ) : (
            <>
            {/* Constraint warning */}
            {constraintWarning && (
              <div className="alert alert-warning small py-2 d-flex align-items-start gap-2 mb-2" role="alert">
                <AppIcon icon="ban" className="mt-1 text-warning" />
                <div>
                  <strong>Can&apos;t add:</strong> {constraintWarning}
                  <button className="btn btn-link btn-sm p-0 ms-2 text-muted" onClick={() => setConstraintWarning(null)}>dismiss</button>
                </div>
              </div>
            )}
            <SectionDivider />
            {/* Add Items to Wall — IdeaRoom-style icon cards */}
            <div className="mb-3">
              <div className="fw-semibold small mb-2">Add Items to Wall</div>
              <div className="d-flex flex-wrap gap-2">
                {itemTypes.map((type) => {
                  if (!isAccessoryAllowed(styleProfile, type)) return null;
                  const items = doorWindowItems.filter((i) => i.item_type === type);
                  if (items.length === 0) return null;
                  const label = type === "rollup_door" ? "Rollup Door" : type.charAt(0).toUpperCase() + type.slice(1);
                  return (
                    <ItemCard key={type} type={type} label={label} items={items} onAdd={addItemToWall} />
                  );
                })}
              </div>
            </div>

            {/* Items on current wall */}
            {currentWallItems.length > 0 && <SectionDivider />}
            {currentWallItems.length > 0 && (
              <div className="mb-3">
                <div className="fw-semibold small mb-1">Items on wall ({currentWallItems.length})</div>
                {currentWallItems.map((item, idx) => {
                  const wallW = getWallWidthFt(activeWall, activeSection, width, length, leantos);
                  const wallH = getWallHeightFt(activeSection, height, leantos, activeWall);
                  const dims = parseItemDimensions(item.name);
                  const tooWide = dims && dims.widthFt > wallW - FRAME_CLEARANCE_FT * 2;
                  const tooTall = dims && dims.heightFt > wallH - HEIGHT_CLEARANCE_FT;
                  const hasViolation = tooWide || tooTall;
                  const isEditing = editingItemIdx === idx;
                  const dbItem = isEditing ? doorWindowItems.find(i => i.item_id === item.item_id) : null;
                  const variants = isEditing && dbItem ? doorWindowItems.filter(i => i.item_type === dbItem.item_type) : [];
                  return (
                  <div key={idx} className="mb-1">
                    <div
                      className={`d-flex justify-content-between align-items-center py-1 ps-2 border-start border-3 ${hasViolation ? "border-danger" : "border-primary"}`}
                      style={{ background: hasViolation ? "#fff5f5" : undefined }}
                      title={hasViolation ? `⚠ ${tooWide ? "Too wide" : "Too tall"} for this wall — remove or resize the building` : ""}>
                      <span className="small">{hasViolation && <AppIcon icon="ban" className="text-danger me-1" style={{ fontSize: 10 }} />}{item.name}</span>
                      <div className="d-flex align-items-center gap-3">
                        <AppIcon icon="pen" className={isEditing ? "text-primary" : "text-muted"} style={{ fontSize: 14, cursor: "pointer", padding: 2 }} onClick={() => setEditingItemIdx(isEditing ? null : idx)} />
                        <AppIcon icon="copy" className="text-muted" style={{ fontSize: 14, cursor: "pointer", padding: 2 }} onClick={() => duplicateItemOnWall(idx)} title="Duplicate" />
                        <AppIcon icon="trash" className="text-danger" style={{ fontSize: 14, cursor: "pointer", padding: 2 }} onClick={() => removeItemFromWall(idx)} />
                      </div>
                    </div>
                    {isEditing && variants.length > 0 && (
                      <div className="ps-3 py-1" style={{ background: "#f8f9fa", borderRadius: "0 0 4px 4px" }}>
                        <select className="form-select form-select-sm" value={item.item_id}
                          onChange={(e) => {
                            const variant = doorWindowItems.find(i => i.item_id === Number(e.target.value));
                            if (variant) { replaceItemOnWall(idx, variant); setEditingItemIdx(null); }
                          }}>
                          {variants.map((v) => <option key={v.item_id} value={v.item_id}>{v.name} — ${v.price}</option>)}
                        </select>
                        {constraintWarning && (
                          <div className="text-warning small mt-1"><AppIcon icon="ban" className="me-1" />{constraintWarning}</div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            {/* Total removed — shown only in quote modal */}
            </>
            )}
          </div>
        )}

        {/* ─── TAB: COLORS (Colors + Siding) ────────── */}
        {rightPanelMode === "colors" && (
          <div className="p-3">
            <div className="fw-semibold mb-2">Colors</div>
            <p className="psb-color-note mb-3">Actual colors may vary slightly from the screen color shown. Contact us for a sample.</p>
            {colorGroups.map((group) => {
              const groupOpts = colorOptions.filter((o) => o.color_group_id === group.color_group_id);
              const selectedOptId = colorSelections[group.color_group_id];
              const selectedOpt = groupOpts.find((o) => o.color_option_id === selectedOptId);
              return (
                <div key={group.color_group_id} className="mb-4">
                  <div className="psb-color-group-title">{group.name}</div>
                  <div className="psb-color-selected-label mb-2">
                    <span className="fw-semibold">Selected:</span> {selectedOpt?.name ?? "None"}
                  </div>
                  <div className="psb-color-grid">
                    {groupOpts.map((opt) => (
                      <div key={opt.color_option_id}
                        className={`psb-color-swatch${selectedOptId === opt.color_option_id ? " is-selected" : ""}`}
                        data-name={opt.name}
                        aria-label={opt.name}
                        role="button"
                        style={{ background: opt.hex_code }}
                        onClick={() => setColorSelections((prev) => ({ ...prev, [group.color_group_id]: opt.color_option_id }))}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {sidingFeature && (
              <>
                <SectionDivider />
                <div className="fw-semibold mb-2 mt-3">Siding Direction</div>
                <select className="form-select form-select-sm"
                  value={sidingOptionId ?? ""} onChange={(e) => changeSidingOption(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Default</option>
                  {sidingOptions.map((o) => (
                    <option key={o.option_id} value={o.option_id}>{o.name}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}

        {/* ─── TAB: MATERIALS (Add-Ons) ────────── */}
        {rightPanelMode === "materials" && (
          <div className="p-3">
            {/* Features & Add-Ons */}
            <div className="fw-semibold mb-2">Features &amp; Add-Ons</div>
            {categories.length === 0 && <p className="text-muted small">No add-on features available for this style.</p>}
            {categories.map((cat) => {
              const catFeats = filteredOtherFeatures.filter((f) => f.category === cat);
              return (
                <div key={cat} className="mb-3">
                  <SectionDivider />
                  <div className="small fw-semibold text-uppercase text-muted mb-1">{cat}</div>
                  {catFeats.map((feat) => (
                    <FeatureSelector key={feat.feature_id} feature={feat} options={options}
                      rates={rates} addOnItems={addOnItems} updateAddOn={updateAddOn}
                      width={width} length={length} panelLocations={panelLocations} />
                  ))}
                </div>
              );
            })}

          </div>
        )}

{/* ─── TAB: SALES TOOL ───────────────────────── */}
        {rightPanelMode === "salestax" && (
          <div className="p-3">
            {/* DISCOUNTS & ADJUSTMENTS */}
            <div className="fw-semibold text-uppercase text-muted small mb-2">Discounts & Adjustments</div>

            <SectionDivider />
            {/* Deposits */}
            <div className="mb-3">
              <div className="fw-semibold mb-2">Deposits</div>

              <div className="d-flex flex-column gap-2">
                {/* Standard (no deposit) */}
                <div className="form-check d-flex align-items-center">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="depositMode"
                    id="depositStandard"
                    value="standard"
                    checked={depositMode === "standard"}
                    onChange={() => setDepositMode("standard")}
                    style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                  />
                  <label className="form-check-label" htmlFor="depositStandard">
                    Standard
                  </label>
                </div>

                {/* Custom Amount */}
                <div className="form-check d-flex align-items-center">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="depositMode"
                    id="depositCustomAmount"
                    value="customAmount"
                    checked={depositMode === "customAmount"}
                    onChange={() => setDepositMode("customAmount")}
                    style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                  />
                  <label className="form-check-label w-100" htmlFor="depositCustomAmount">
                    Custom Amount
                  </label>
                </div>
                {depositMode === "customAmount" && (
                  <div className="input-group input-group-sm mb-2">
                    <span className="input-group-text">$</span>
                    <input
                      type="number"
                      className="form-control"
                      min="0"
                      step="0.01"
                      value={customDepositAmount}
                      onChange={(e) => setCustomDepositAmount(Math.max(0, Number(e.target.value)))}
                    />
                  </div>
                )}

                {/* Custom Percentage */}
                <div className="form-check d-flex align-items-center">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="depositMode"
                    id="depositCustomPercentage"
                    value="customPercentage"
                    checked={depositMode === "customPercentage"}
                    onChange={() => setDepositMode("customPercentage")}
                    style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                  />
                  <label className="form-check-label w-100" htmlFor="depositCustomPercentage">
                    Custom Percentage
                  </label>
                </div>
                {depositMode === "customPercentage" && (
                  <div className="input-group input-group-sm mb-2">
                    <input
                      type="number"
                      className="form-control"
                      min="0"
                      max="100"
                      step="0.01"
                      value={customDepositPercentage}
                      onChange={(e) => setCustomDepositPercentage(Math.max(0, Math.min(100, Number(e.target.value))))}
                    />
                    <span className="input-group-text">%</span>
                  </div>
                )}
              </div>

              {/* Deposit Amount Display */}
              <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                <span className="fw-bold">Deposit Amount:</span>
                <span className="fw-bold fs-5 text-primary">{formatCurrency(computedDepositAmount)}</span>
              </div>
            </div>

            <SectionDivider />
            {/* Dealer Deposit Discount */}
            <div className="mb-3">
              <div className="fw-semibold mb-2">Dealer Deposit Discount</div>

              <div className="d-flex flex-column gap-2">
                {/* Deposit Discount Amount */}
                <div className="form-check d-flex align-items-center">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="dealerDiscountMode"
                    id="dealerDiscountAmount"
                    value="amount"
                    checked={dealerDiscountMode === "amount"}
                    onChange={() => setDealerDiscountMode("amount")}
                    style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                  />
                  <label className="form-check-label w-100" htmlFor="dealerDiscountAmount">
                    Deposit Discount Amount
                  </label>
                </div>
                {dealerDiscountMode === "amount" && (
                  <div className="input-group input-group-sm mb-2">
                    <span className="input-group-text">$</span>
                    <input
                      type="number"
                      className={`form-control ${isDealerDiscountInvalid ? "is-invalid" : ""}`}
                      min="0"
                      step="0.01"
                      value={dealerDiscountAmount}
                      onChange={(e) => setDealerDiscountAmount(Math.max(0, Number(e.target.value)))}
                    />
                  </div>
                )}
                {isDealerDiscountInvalid && dealerDiscountMode === "amount" && (
                  <div className="text-danger small mb-2">
                    Dealer Discount cannot exceed the deposit amount
                  </div>
                )}

                {/* Deposit Discount Percentage */}
                <div className="form-check d-flex align-items-center">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="dealerDiscountMode"
                    id="dealerDiscountPercentage"
                    value="percentage"
                    checked={dealerDiscountMode === "percentage"}
                    onChange={() => setDealerDiscountMode("percentage")}
                    style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                  />
                  <label className="form-check-label w-100" htmlFor="dealerDiscountPercentage">
                    Deposit Discount Percentage
                  </label>
                </div>
                {dealerDiscountMode === "percentage" && (
                  <div className="input-group input-group-sm mb-2">
                    <input
                      type="number"
                      className={`form-control ${isDealerDiscountInvalid ? "is-invalid" : ""}`}
                      min="0"
                      max="100"
                      step="0.01"
                      value={dealerDiscountPercentage}
                      onChange={(e) => setDealerDiscountPercentage(Math.max(0, Math.min(100, Number(e.target.value))))}
                    />
                    <span className="input-group-text">%</span>
                  </div>
                )}
                {isDealerDiscountInvalid && dealerDiscountMode === "percentage" && (
                  <div className="text-danger small mb-2">
                    Dealer Discount cannot exceed the deposit amount
                  </div>
                )}
              </div>

              {/* Dealer Discount Amount Display */}
              <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                <span className="fw-bold">Deposit Discount Amount:</span>
                <span className="fw-bold fs-5 text-primary">{formatCurrency(computedDealerDiscount)}</span>
              </div>
            </div>

            <SectionDivider />
            {/* Sales Tax */}
            <div className="mb-3">
              <div className="fw-semibold mb-2">Sales Tax</div>

              <div className="d-flex flex-column gap-2">
                {/* Standard */}
                <div className="form-check d-flex align-items-center">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="salesTaxMode"
                    id="salesTaxStandard"
                    value="standard"
                    checked={salesTaxMode === "standard"}
                    onChange={() => setSalesTaxMode("standard")}
                    style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                  />
                  <label className="form-check-label w-100" htmlFor="salesTaxStandard">
                    Standard ({(salesTaxRate * 100).toFixed(2)}%)
                  </label>
                </div>

                {/* Exempt */}
                <div className="form-check d-flex align-items-center">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="salesTaxMode"
                    id="salesTaxExempt"
                    value="exempt"
                    checked={salesTaxMode === "exempt"}
                    onChange={() => setSalesTaxMode("exempt")}
                    style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                  />
                  <label className="form-check-label w-100" htmlFor="salesTaxExempt">
                    Exempt
                  </label>
                </div>

                {/* Percentage */}
                <div className="form-check d-flex align-items-center">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="salesTaxMode"
                    id="salesTaxPercentage"
                    value="percentage"
                    checked={salesTaxMode === "percentage"}
                    onChange={() => setSalesTaxMode("percentage")}
                    style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
                  />
                  <label className="form-check-label w-100" htmlFor="salesTaxPercentage">
                    Percentage
                  </label>
                </div>
                {salesTaxMode === "percentage" && (
                  <div className="input-group input-group-sm mb-2">
                    <input
                      type="number"
                      className="form-control"
                      min="0"
                      max="100"
                      step="0.01"
                      value={customTaxPercentage}
                      onChange={(e) => setCustomTaxPercentage(Math.max(0, Math.min(100, Number(e.target.value))))}
                    />
                    <span className="input-group-text">%</span>
                  </div>
                )}
              </div>

              {/* Sales Tax Amount Display */}
              <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                <span className="fw-bold">Sales Tax:</span>
                <span className="fw-bold fs-5 text-primary">{formatCurrency(computedSalesTaxAmount)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB: SERVICES, FINANCING & WARRANTY ─── */}
        {rightPanelMode === "services" && (
          <div className="p-3">
            {/* Services Section */}
            <div className="mb-4">
              <div className="fw-semibold mb-3">Services</div>

              <div className="d-flex flex-column gap-2">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="svcBuildOverFee"
                    checked={buildOverFee}
                    onChange={(e) => setBuildOverFee(e.target.checked)}
                  />
                  <label className="form-check-label w-100" htmlFor="svcBuildOverFee">
                    Build Over Fee
                  </label>
                </div>

                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="svcCutLegsOnSite"
                    checked={cutLegsOnSite}
                    onChange={(e) => setCutLegsOnSite(e.target.checked)}
                  />
                  <label className="form-check-label w-100" htmlFor="svcCutLegsOnSite">
                    Cut Legs on Site
                  </label>
                </div>

                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="svcExtraLaborFees"
                    checked={extraLaborFees}
                    onChange={(e) => setExtraLaborFees(e.target.checked)}
                  />
                  <label className="form-check-label w-100" htmlFor="svcExtraLaborFees">
                    Extra Labor Fees
                  </label>
                </div>

                <div className="d-flex align-items-center gap-2">
                  <div className="form-check flex-grow-1 mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="svcEngineeringPlans"
                      checked={engineeringPlans}
                      onChange={(e) => setEngineeringPlans(e.target.checked)}
                    />
                    <label className="form-check-label w-100" htmlFor="svcEngineeringPlans">
                      Engineering Plans
                    </label>
                  </div>
                  <i
                    className="bi bi-info-circle text-muted"
                    title="Engineering plans are optional and may be required for permitting in your area."
                    style={{ cursor: "help" }}
                  />
                </div>
              </div>
            </div>

            <SectionDivider />
            <div className="text-muted text-center py-5">
              Financing and warranty options coming soon.
            </div>
          </div>
        )}
</div>

        {/* ─── FOOTER: Running Total ────────────────────────────────── */}
        <div className="border-top bg-light p-3" style={{ flexShrink: 0 }}>
          <div className="d-flex justify-content-between align-items-center">
            <span className="small text-muted">Subtotal</span>
            <span className="fw-semibold">{formatCurrency(grandTotal)}</span>
          </div>
          {effectiveTaxRate > 0 && (
            <div className="d-flex justify-content-between align-items-center">
              <span className="small text-muted">
                Est. Tax ({(effectiveTaxRate * 100).toFixed(2)}%)
              </span>
              <span className="fw-semibold">
                {formatCurrency(computedSalesTaxAmount)}
              </span>
            </div>
          )}

          {(() => {
            const totalEstimate = grandTotal + computedSalesTaxAmount;
            const showDepositBreakdown = depositMode !== "standard" && computedDepositAmount > 0;
            return (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2 mt-1">
                  <span className="fw-bold fs-6">Total Estimate</span>
                  <span className="fw-bold text-danger fs-5">
                    {formatCurrency(totalEstimate)}
                  </span>
                </div>
                {showDepositBreakdown && (
                  <>
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="fw-bold fs-6">Due Today</span>
                      <span className="fw-bold text-danger fs-5">
                        {formatCurrency(computedDepositAmount)}
                      </span>
                    </div>
                    {computedDealerDiscount > 0 && (
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="small text-muted">Deposit Discounts</span>
                        <span className="fw-semibold">-{formatCurrency(computedDealerDiscount)}</span>
                      </div>
                    )}
                    <div className="d-flex justify-content-between align-items-center mb-2 mt-1">
                      <span className="fw-bold fs-6">Deposit Amount Due Now</span>
                      <span className="fw-bold text-danger fs-5">
                        {formatCurrency(depositAmountDueNow)}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between align-items-center mb-2 mt-1">
                      <span className="fw-bold fs-6">Due upon delivery</span>
                      <span className="fw-bold text-danger fs-5">
                        {formatCurrency(dueUponDeliveryAmount)}
                      </span>
                    </div>
                  </>
                )}
              </>
            );
          })()}
          <button
            className="btn btn-danger w-100 fw-bold"
            onClick={() => setShowEstimateDrawer(true)}
            disabled={!zipUnlocked}
          >
            View Estimate Summary
          </button>
        </div>
      </div>

      {/* ═══ ESTIMATE DETAILS DRAWER ═══ */}
      <EstimateDetailsDrawer
        show={showEstimateDrawer}
        onHide={() => setShowEstimateDrawer(false)}
        estimate={estimate}
        hideZeroAmounts
      />

      {/* ═══ ZIP GATE MODAL ═══ */}
      {/* Non-dismissible overlay until a valid US ZIP is confirmed. */}
      {showZipModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ zIndex: 10000, background: "rgba(0,0,0,0.65)" }}>
          {/* Backdrop click is ignored — must enter a valid ZIP to proceed. */}
          <div className="bg-white rounded-3 shadow-lg p-4" style={{ maxWidth: 420, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-3">
              <AppIcon icon="map-marker-alt" className="fs-3 text-muted mb-2" />
              <h5 className="fw-bold mb-1">Delivery Location</h5>
              <p className="text-muted small mb-0">
                Please provide the ZIP code for the location where your custom building will be delivered.
                Please note that the configurator is currently in testing mode and if there are any discrepencies,
                Premium Steel Buildings reserves the right to ajust pricing or modify the order if needed.
              </p>
            </div>

            <form onSubmit={submitZip}>
              <div className="mb-3">
               <br/>  <br/>
                <input
                  id="zipInput"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  autoComplete="postal-code"
                  className={`form-control ${zipError ? "is-invalid" : ""}`}
                  placeholder="Enter Your ZIP Code (e.g. 48084)"
                  value={zipDraft}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                    setZipDraft(v);
                    if (zipError) setZipError(null);
                  }}
                  autoFocus
                />
                {zipError && <div className="invalid-feedback d-block">{zipError}</div>}
              </div>

              <button
                type="submit"
                className="btn btn-dark w-100 py-2 fw-semibold"
                disabled={zipSubmitting || zipDraft.length < 5}
              >
                {zipSubmitting ? "Looking up…" : "Continue"}
              </button>
              {zipNotFoundDigits && (
                <button
                  type="button"
                  className="btn btn-outline-success w-100 py-2 fw-semibold mt-3"
                  onClick={openAddZipModal}
                  disabled={zipSubmitting}
                >
                  <AppIcon icon="plus" className="me-1" /> Add ZIP Code
                </button>
              )}
            </form>
          </div>
        </div>
      )}
      {/* ═══ ADD ZIP CODE MODAL ═══ */}
      {/* Shown when the entered ZIP is missing from metal_s_zip_codes.
          Step "form": details pre-filled from lookupZipDetailsAction (editable).
          Step "confirm": read-only confirmation of the API data result
          (merged with manual edits) before the row is saved. */}
      {showAddZipModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ zIndex: 10001, background: "rgba(0,0,0,0.65)" }}>
          <div className="bg-white rounded-3 shadow-lg p-4" style={{ maxWidth: 460, width: "90%", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-3">
              <AppIcon icon="map-marker-alt" className="fs-3 text-muted mb-2" />
              <h5 className="fw-bold mb-1">{addZipStep === "confirm" ? "Confirm ZIP Code Details" : "Add ZIP Code"}</h5>
              <p className="text-muted small mb-0">
                {addZipStep === "confirm"
                  ? "Please confirm the details below. The ZIP code will be added to the database and used for pricing and delivery."
                  : "This ZIP code is not in our database yet. Review the details below (filled from the ZIP lookup API where available), then continue to confirm."}
              </p>
            </div>

            {addZipLookupLoading && (
              <div className="alert alert-info py-2 small mb-3">Looking up ZIP code details…</div>
            )}
            {addZipLookupNote && addZipStep === "form" && !addZipLookupLoading && (
              <div className="alert alert-warning py-2 small mb-3">{addZipLookupNote}</div>
            )}
            {addZipError && (
              <div className="alert alert-danger py-2 small mb-3">{addZipError}</div>
            )}

            {addZipStep === "form" ? (
              <div>
                <div className="mb-2">
                  <label className="form-label small mb-0">ZIP Code <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    className="form-control form-control-sm"
                    value={addZipDraft.zipCode}
                    onChange={(e) => updateAddZipField("zipCode", e.target.value.replace(/\D/g, "").slice(0, 5))}
                    disabled={addZipSaving}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label small mb-0">Region <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={addZipDraft.region}
                    onChange={(e) => updateAddZipField("region", e.target.value)}
                    placeholder="Region / State (e.g. Michigan)"
                    disabled={addZipSaving}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label small mb-0">City</label>
                  <input type="text" className="form-control form-control-sm" value={addZipDraft.city} onChange={(e) => updateAddZipField("city", e.target.value)} placeholder="City (optional)" disabled={addZipSaving} />
                </div>
                <div className="mb-2">
                  <label className="form-label small mb-0">County</label>
                  <input type="text" className="form-control form-control-sm" value={addZipDraft.county} onChange={(e) => updateAddZipField("county", e.target.value)} placeholder="County (optional)" disabled={addZipSaving} />
                </div>
                <div className="row g-2 mb-2">
                  <div className="col">
                    <label className="form-label small mb-0">Latitude</label>
                    <input type="number" step="0.000001" className="form-control form-control-sm" value={addZipDraft.latitude} onChange={(e) => updateAddZipField("latitude", e.target.value)} placeholder="Optional" disabled={addZipSaving} />
                  </div>
                  <div className="col">
                    <label className="form-label small mb-0">Longitude</label>
                    <input type="number" step="0.000001" className="form-control form-control-sm" value={addZipDraft.longitude} onChange={(e) => updateAddZipField("longitude", e.target.value)} placeholder="Optional" disabled={addZipSaving} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="small">
                {[
                  { label: "ZIP Code", value: addZipDraft.zipCode, source: null },
                  { label: "City", value: addZipDraft.city, source: addZipDraft.sources.city },
                  { label: "County", value: addZipDraft.county, source: addZipDraft.sources.county },
                  {
                    label: "Region",
                    value: addZipDraft.region
                      ? (addZipDraft.stateCode ? `${addZipDraft.region} (${addZipDraft.stateCode})` : addZipDraft.region)
                      : "",
                    source: addZipDraft.sources.region,
                  },
                  { label: "Latitude", value: addZipDraft.latitude, source: addZipDraft.sources.latitude },
                  { label: "Longitude", value: addZipDraft.longitude, source: addZipDraft.sources.longitude },
                ].map((row) => (
                  <div key={row.label} className="d-flex justify-content-between align-items-center border-bottom py-1 gap-3">
                    <span className="text-muted">{row.label}</span>
                    <span className="text-end">
                      {row.value !== "" && row.value != null ? row.value : <span className="text-muted fst-italic">—</span>}
                      {row.source && (
                        <span className={`badge ms-2 ${row.source === "api" ? "text-bg-light border" : "text-bg-secondary"}`}>
                          {row.source === "api" ? "from lookup API" : "manual entry"}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                <div className="text-muted fst-italic mt-2">
                  Confirm these details to add this ZIP code to the database.
                </div>
              </div>
            )}

            <div className="d-flex justify-content-end gap-2 mt-3">
              {addZipStep === "confirm" ? (
                <>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => { setAddZipStep("form"); setAddZipError(null); }}
                    disabled={addZipSaving}
                  >
                    Back to Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-success btn-sm px-3"
                    onClick={confirmAddZip}
                    disabled={addZipSaving}
                  >
                    {addZipSaving ? "Saving…" : "Confirm & Add"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={closeAddZipModal}
                    disabled={addZipSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-success btn-sm px-3"
                    onClick={reviewAddZip}
                    disabled={addZipSaving || addZipLookupLoading}
                  >
                    Review &amp; Add
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// ─── DIMENSION TEXT FIELD (Width / Length / Leg Height) ────
// Plain text field for the dimension value. Typed input is snapped to the
// nearest valid price-table value (`options`) on blur/Enter so the committed
// value is always one the pricing lookups already understand (the lookups match
// exact / range values from the price matrix). Invalid or empty input reverts
// to the current value.
function DimensionSpinner({ label, value, options, onChange }) {
  const list = useMemo(() => [...options].sort((a, b) => a - b), [options]);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const nearestIdx = (n) => {
    let best = 0;
    let bestDist = Infinity;
    list.forEach((v, i) => {
      const d = Math.abs(v - n);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  };

  const commit = (raw) => {
    if (list.length === 0) { setDraft(String(value)); return; }
    const s = String(raw ?? "").trim();
    if (s === "") { setDraft(String(value)); return; }
    const n = Number(s);
    if (!Number.isFinite(n)) { setDraft(String(value)); return; }
    const snapped = list[nearestIdx(n)];
    setDraft(String(snapped));
    onChange(snapped);
  };

  return (
    <div className="col-4">
      <label className="form-label small mb-0">{label}</label>
      <div className="input-group input-group-sm">
        <input
          type="text"
          className="form-control text-center"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        />
      </div>
    </div>
  );
}

// ─── SECTION DIVIDER ─────────────────────────────────────

function SectionDivider() {
  return <div className="border-top my-3" />;
}

// ─── LEAN-TO CARD RADIO GROUP (UI only — not wired to pricing/3D yet) ───
// Mirrors the base-structure feature radios (form-check + same inline styles).
function LtRadioGroup({ sideKey, field, label, value, options, onChange }) {
  return (
    <div className="mb-2">
      <div className="fw-semibold small mb-1">{label}: {value}</div>
      <div className="d-flex flex-column gap-1">
        {options.map((opt) => {
          const id = `lt-${sideKey}-${field}-${String(opt).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          return (
            <div key={opt} className="form-check d-flex align-items-center">
              <input
                className="form-check-input"
                type="radio"
                name={`lt-${sideKey}-${field}`}
                id={id}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }}
              />
              <label className="form-check-label" htmlFor={id}>
                {opt}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ITEM CARD (IdeaRoom-style visual add button) ──────────

function ItemCard({ type, label, items, onAdd }) {
  return (
    <div style={{ position: "relative" }}>
      <div
        className="text-center border rounded p-2 d-flex flex-column align-items-center justify-content-center"
        style={{ width: 72, height: 80, cursor: "pointer", background: "#fff", transition: "background 0.15s" }}
        onClick={() => onAdd(items[0])}
      >
        <div style={{ position: "absolute", top: 4, right: 4, background: "#28a745", color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 11, lineHeight: "16px", textAlign: "center" }}>+</div>
        <div className="d-flex justify-content-center mb-1" style={{ color: "#555" }}>
          {ITEM_ICONS[type] || <AppIcon icon="plus" className="fs-4" />}
        </div>
        <div style={{ fontSize: "0.65rem", lineHeight: 1.2 }}>{label}</div>
      </div>
    </div>
  );
}

// ─── TOOLBAR BUTTON ────────────────────────────────────────

function ToolbarBtn({ icon, title }) {
  return (
    <button className="btn btn-sm btn-light" title={title} style={{ width: 32, height: 32, padding: 0 }}>
      <AppIcon icon={icon} />
    </button>
  );
}

// ─── FEATURE SELECTOR (dispatcher) ─────────────────────────

function FeatureSelector({ feature, rates, options, addOnItems, updateAddOn, width, length, panelLocations }) {
  const onUpdate = useCallback((item) => updateAddOn(feature.feature_id, item), [feature.feature_id, updateAddOn]);
  switch (feature.pricing_type) {
    case "RATE":
      return <RateSelector feature={feature} rates={rates} onUpdate={onUpdate} />;
    case "FIXED":
      return <FixedSelector feature={feature} options={options} onUpdate={onUpdate} addOnItems={addOnItems} />;
    case "PER_WALL":
      return <PerWallSelector feature={feature} rates={rates} onUpdate={onUpdate} buildingWidth={width} buildingLength={length} />;
    default:
      return null;
  }
}

// ─── RATE SELECTOR ─────────────────────────────────────────

function RateSelector({ feature, rates, onUpdate }) {
  const fId = feature.feature_id;
  const rateRow = rates.find((r) => r.feature_id === fId);
  const [enabled, setEnabled] = useState(false);
  const [measurement, setMeasurement] = useState("");
  const unitLabel = rateRow?.unit === "sqft" ? "sq ft" : "linear ft";

  const handleChange = (en, val) => {
    if (!en || !rateRow) { onUpdate(null); return; }
    const parsed = parseFloat(val);
    if (isNaN(parsed) || parsed <= 0) { onUpdate(null); return; }
    const price = parsed * Number(rateRow.rate);
    onUpdate({ featureId: fId, featureName: feature.name, description: `${parsed} ${unitLabel} × $${rateRow.rate}/${unitLabel}`, price });
  };

  return (
    <div className="mb-3">
      <div className="form-check mb-2">
        <input className="form-check-input" type="checkbox" checked={enabled}
          onChange={(e) => { setEnabled(e.target.checked); handleChange(e.target.checked, measurement); }}
          id={`chk-${fId}`} />
        <label className="form-check-label fw-semibold" htmlFor={`chk-${fId}`}>{feature.name}</label>
        {feature.description && <div className="text-muted small">{feature.description}</div>}
      </div>
      {enabled && rateRow && (
        <div className="d-flex align-items-center gap-2 mb-2">
          <input type="number" min="0" step="0.5" className="form-control form-control-sm" style={{ width: 120 }}
            placeholder={unitLabel} value={measurement}
            onChange={(e) => { setMeasurement(e.target.value); handleChange(true, e.target.value); }} />
          <span className="text-muted small">{unitLabel} × ${rateRow.rate}</span>
        </div>
      )}
    </div>
  );
}

// ─── FIXED SELECTOR ────────────────────────────────────────

function FixedSelector({ feature, options: allOptions, onUpdate, addOnItems }) {
  const fId = feature.feature_id;
  const featureOptions = allOptions.filter((o) => o.feature_id === fId);
  const currentItem = addOnItems?.[fId];
  // Selection is derived from the parent's add-on state so external resets
  // (e.g. style-change defaults) stay in sync with the priced items.
  const selectedId = currentItem
    ? featureOptions.find((o) => o.name === currentItem.description)?.option_id ?? null
    : null;

  const handleSelect = (optionId) => {
    const newId = optionId === selectedId ? null : optionId;
    if (!newId) { onUpdate(null); return; }
    const opt = featureOptions.find((o) => o.option_id === newId);
    if (!opt) { onUpdate(null); return; }
    onUpdate({ featureId: fId, featureName: feature.name, description: opt.name, price: Number(opt.price) });
  };

  const isSingleOption = featureOptions.length === 1;

  return (
    <div className="mb-3">
      <div className="fw-semibold mb-1">{feature.name}</div>
      {feature.description && <div className="text-muted small mb-2">{feature.description}</div>}
      <div className="d-flex flex-column gap-1">
        {featureOptions.map((opt) => (
          <div key={opt.option_id} className="form-check d-flex align-items-center">
            <input className="form-check-input" type={isSingleOption ? "checkbox" : "radio"} name={`fixed-${fId}`}
              checked={selectedId === opt.option_id} onChange={() => handleSelect(opt.option_id)}
              id={`opt-${opt.option_id}`}
              style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem", marginTop: 0, flexShrink: 0 }} />
            <label className="form-check-label d-flex justify-content-between w-100" htmlFor={`opt-${opt.option_id}`}>
              <span>{opt.name}</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PER-WALL SELECTOR ────────────────────────────────────

function PerWallSelector({ feature, rates, onUpdate, buildingWidth, buildingLength }) {
  const fId = feature.feature_id;
  const rateRow = rates.find((r) => r.feature_id === fId);
  const [selected, setSelected] = useState({ roof: false, left: false, right: false, front: false, back: false });

  const calcPrice = (sel) => {
    if (!rateRow) return 0;
    const rate = Number(rateRow.rate);
    let total = 0;
    if (sel.roof) total += (buildingWidth + buildingLength) * 2 * rate;
    if (sel.left) total += buildingLength * rate;
    if (sel.right) total += buildingLength * rate;
    if (sel.front) total += buildingWidth * rate;
    if (sel.back) total += buildingWidth * rate;
    return total;
  };

  const handleToggle = (wall) => {
    const next = { ...selected, [wall]: !selected[wall] };
    setSelected(next);
    const price = calcPrice(next);
    const enabledWalls = Object.entries(next).filter(([, v]) => v).map(([k]) => k);
    if (enabledWalls.length === 0) { onUpdate(null); return; }
    onUpdate({ featureId: fId, featureName: feature.name, description: enabledWalls.join(", "), price });
  };

  return (
    <div className="mb-3">
      <div className="fw-semibold mb-1">{feature.name}</div>
      {feature.description && <div className="text-muted small mb-2">{feature.description}</div>}
      {["roof", "left", "front", "right", "back"].map((wall) => (
        <div key={wall} className="form-check">
          <input className="form-check-input" type="checkbox" checked={selected[wall]}
            onChange={() => handleToggle(wall)} id={`pw-${fId}-${wall}`} />
          <label className="form-check-label" htmlFor={`pw-${fId}-${wall}`}>
            {wall.charAt(0).toUpperCase() + wall.slice(1)}{wall === "roof" ? "" : " Wall"}
          </label>
        </div>
      ))}
      {rateRow && <div className="text-muted small mt-1">${rateRow.rate}/linear ft</div>}
    </div>
  );
}
