"use client";
// ═══════════════════════════════════════════════════════════
// ConfiguratorViewV1 — Calculation-focused configurator.
// 3D preview removed; the preview area shows a placeholder.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from "react";
import AppIcon from "@/shared/components/ui/AppIcon";
import {
  getUniqueDimensionValues,
  getLegHeightValues,
  applyRegionMultiplier,
  calcPanelOptionPrice,
  calcTotalPanelPrice,
  formatCurrency,
  lookupLegHeightPrice as lookupLegHeightPriceClient,
} from "../data/metalBuildings.data";
import EstimateDetailsDrawer from "../components/EstimateDetailsDrawer";
import { buildEstimate } from "../components/estimateDrawer.utils";
import { getStyleProfile, isFeatureAllowed, isAccessoryAllowed } from "../data/styleProfiles";
import { findRegionByZipCode, lookupRegionBasePrice, lookupRoofStyleBasePrice, lookupLegHeightPrice } from "../data/metalBuildings.actions";
import useTaxRate from "@/shared/hooks/useTaxRate";

const ICON_PATH_BASE = "/images/metal-buildings";
const ICON_FALLBACK = ICON_PATH_BASE + "/icon-carportview-psb.png";

function getStyleIconPath(style) {
  if (style?.icon_path) {
    return String(style.icon_path).replace(/^\/public\//i, "/");
  }
  const renderKey = (style?.render_key || "").toLowerCase();
  const profile = getStyleProfile(renderKey);
  const label = (profile?.label || "").toLowerCase();
  const keyMap = {
    regular: "regular",
    aframe: "aframe",
    a_frame: "aframe",
    aframe_vertical: "aframe",
    vertical: "aframe",
    rib_type: "psb",
    truss: "truss",
    garage: "garage",
    barn: "barn",
    leanto: "leanto",
    lean_to: "leanto",
    loafing_shed: "loafing-shed",
  };
  let key = keyMap[renderKey];
  if (!key && label) {
    if (label.includes("a-frame")) key = "aframe";
    else if (label.includes("regular")) key = "regular";
    else if (label.includes("barn")) key = "barn";
    else if (label.includes("garage")) key = "garage";
    else if (label.includes("lean")) key = "leanto";
    else if (label.includes("loafing")) key = "loafing-shed";
    else if (label.includes("truss")) key = "truss";
    else if (label.includes("rib")) key = "psb";
  }
  if (!key) key = renderKey || "psb";
  return ICON_PATH_BASE + "/icon-carportview-" + key + ".png";
}

const FALLBACK_LT_WIDTHS = [6, 8, 10, 12, 14, 16, 18, 20, 24];
const FALLBACK_LT_HEIGHTS = [4, 5, 6, 7, 8, 9, 10, 12];
const FALLBACK_LT_LENGTHS = [10, 12, 14, 16, 18, 20, 24, 30, 36, 40, 45, 50, 60];

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

// ─── MAIN COMPONENT ─────────────────────────────────────────

export default function ConfiguratorView({ data }) {
  const { styles, features, matrixPrices, legHeightPrices, panelLocations, panelOptions, rates, options, doorWindowItems, colorGroups, colorOptions, leantoStyles, leantoSides, leantoPrices, leantoCompat, styleDefaults } = data;

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

  const submitZip = async (e) => {
    e?.preventDefault();
    setZipError(null);
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
          setZipError("We currently do not serve your area.");
        } else {
          setZipError("Please enter a valid 5-digit ZIP code.");
        }
        return;
      }
      // Accept the ZIP and auto-select the linked region (may be null if
      // the zip's region is inactive — default pricing applies).
      setZipCode(result.zipCode);
      setZipCity(result.city);
      setZipStateCode(result.region?.state_code ?? null);
      setSelectedRegion(result.region ?? null);
      setShowZipModal(false);

      // Automatically fetch the sales tax rate for this ZIP.
      getTaxRate(digits);
    } catch (err) {
      console.error("ZIP lookup failed:", err);
      setZipError("Something went wrong looking up that ZIP. Please try again.");
    } finally {
      setZipSubmitting(false);
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
  const DEFAULT_ROOF_PITCH = "3/12";
  const DEFAULT_ROOF_OVERHANG = '6"';

  const [roofing, setRoofing] = useState(DEFAULT_ROOFING);
  const [roofPitch, setRoofPitch] = useState(DEFAULT_ROOF_PITCH);
  const [roofOverhang, setRoofOverhang] = useState(DEFAULT_ROOF_OVERHANG);

  // Reset style-driven options to defaults whenever building style changes
  useEffect(() => {
    setRoofing(DEFAULT_ROOFING);
    setRoofPitch(DEFAULT_ROOF_PITCH);
    setRoofOverhang(DEFAULT_ROOF_OVERHANG);
  }, [selectedStyleId]);

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
    setWallSelections((prev) => ({ ...prev, [locationId]: Number(optionId) }));
    markWallsTouched([locationId]);
  }, [markWallsTouched]);

  // ─── PANEL STATE ─────────────────────────────────────────

  // Siding direction
  const sidingFeature = features.find((f) => f.render_key === "siding_panel");
  const sidingOptions = useMemo(() => (sidingFeature ? options.filter((o) => o.feature_id === sidingFeature.feature_id) : []), [sidingFeature, options]);
  const [sidingOptionId, setSidingOptionId] = useState(null);

  // ─── ADD-ONS STATE ───────────────────────────────────────
  const [addOnItems, setAddOnItems] = useState({});

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
    if (mode === "custom" || !panelFeature) return;
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
  const filteredOtherFeatures = useMemo(() => {
    const dwCatId = doorWindowFeature?.category_id;
    let filtered = dwCatId ? otherFeatures.filter((f) => f.category_id !== dwCatId) : otherFeatures;
    filtered = filtered.filter((f) => isFeatureAllowed(styleProfile, f.render_key));
    // Exclude roof_pitch and roof_overhang — they live in the Style tab now
    // Exclude installation_surface — it lives in the Style tab under Building Style
    // Exclude doors & windows category — they have their own tab
    filtered = filtered.filter((f) => f.render_key !== "roof_pitch" && f.render_key !== "roof_overhang" && f.name !== "Installation Surface" && f.render_key !== "installation_surface");
    filtered = filtered.filter((f) => {
      const cat = (f.category_name || f.category || "").toLowerCase();
      return !cat.includes("door") && !cat.includes("window");
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

  const panelPrice = useMemo(() => {
    if (!panelFeature) return 0;
    const locs = panelLocations.filter((l) => l.feature_id === panelFeature.feature_id);
    const opts = panelOptions.filter((o) => o.feature_id === panelFeature.feature_id);
    return calcTotalPanelPrice(wallSelections, locs, opts, width, length);
  }, [panelFeature, panelLocations, panelOptions, wallSelections, width, length]);

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

  const subtotal = basePrice + roofStyleBasePrice + panelPrice + addOnTotal + doorWindowTotal + colorUpchargeTotal + leantoTotal + legHeightPrice;

  // Region multiplier is already baked into basePrice, roofStyleBasePrice,
  // and legHeightPrice (all region-scoped in the DB). Only apply the multiplier
  // to the non-base components (panels, add-ons, doors, colors, lean-to).
  const grandTotal = useMemo(() => {
    const otherComponents = panelPrice + addOnTotal + doorWindowTotal + colorUpchargeTotal + leantoTotal;
    return basePrice + roofStyleBasePrice + legHeightPrice + applyRegionMultiplier(otherComponents, selectedRegion);
  }, [selectedRegion, basePrice, roofStyleBasePrice, legHeightPrice, panelPrice, addOnTotal, doorWindowTotal, colorUpchargeTotal, leantoTotal]);

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
    subtotal,
    grandTotal,
    regionAdjustment,
    taxRate: effectiveTaxRate,
    deposit: computedDepositAmount,
    discount: computedDealerDiscount,
    roofing,
  }), [selectedStyle, width, length, height, legHeightPrice, basePrice, roofStyleBasePrice, wallSelections, panelFeature, panelLocations, panelOptions, colorGroups, colorOptions, colorSelections, addOnItems, features, doorWindowSelections, doorWindowItems, leantos, leantoPrices, selectedStyleId, selectedRegion, subtotal, grandTotal, regionAdjustment, effectiveTaxRate, computedDepositAmount, computedDealerDiscount, roofing]);

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
      const optId = wallSelections[loc.location_id];
      const opt = panelOptions.find((o) => o.option_id === optId);
      let wallType = false;
      if (opt && opt.render_type !== "open") wallType = opt.render_type ?? "enclosed";
      if (loc.name.includes("Front")) result.front = wallType;
      else if (loc.name.includes("Back")) result.back = wallType;
      else if (loc.name.includes("Left")) result.left = wallType;
      else if (loc.name.includes("Right")) result.right = wallType;
    }
    return result;
  }, [panelFeature, panelLocations, panelOptions, wallSelections]);

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
    setActiveSection(sideKey);
    setActiveWall("outer");
  };

  const removeLeanTo = (sideKey) => {
    setLeantos((prev) => prev.filter((lt) => lt.side_key !== sideKey));
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
                onClick={() => { setShowZipModal(true); setZipDraft(zipCode ?? ""); }}
              >
                Change ZIP
              </button>
            </div>
          </div>

          {/* Mode buttons */}
          <div className="d-flex gap-1 mt-2 flex-wrap">
            {[
              { mode: "building", icon: "building", label: "Style" },
              { mode: "leantos", icon: "layer-group", label: "Lean-To" },
              { mode: "openings", icon: "door-open", label: "Doors & Windows" },
              { mode: "colors", icon: "palette", label: "Colors" },
              { mode: "materials", icon: "gear", label: "Materials" },
              { mode: "salestax", icon: "receipt", label: "Sales Tool" },
              { mode: "services", icon: "shield", label: "Services, Financing & Warranty" },
            ].map(({ mode, icon, label }) => (
              <button key={mode}
                className={`btn btn-sm flex-fill ${rightPanelMode === mode ? "btn-dark" : "btn-outline-secondary"}`}
                onClick={() => setRightPanelMode(mode)}>
                <AppIcon icon={icon} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>

        {/* ─── TAB: BUILDING (Style + Size + Sides) ──── */}
        {rightPanelMode === "building" && (
          <div className="p-3">
            {/* Style */}
            <div className="fw-semibold mb-2">Building Style</div>
            <div className="row row-cols-2 g-2 mb-3">
              {styles.map((style) => (
                <div key={style.style_id} className="col">
                  <div
                    className={`card h-100 text-center p-1 ${selectedStyleId === style.style_id ? "border-primary border-2" : ""}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => handleStyleChange(style.style_id)}
                  >
                    <img src={getStyleIconPath(style)} alt={style.name} className="d-block mx-auto" style={{ width: 150, height: 150, objectFit: "contain" }} />
                    <div className="small" style={{ fontSize: "0.75rem" }}>{style.name}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Installation Surface */}
            {(() => {
              const surfaceFeat = features.find((f) => f.name === "Installation Surface" || f.render_key === "installation_surface");
              if (!surfaceFeat) return null;
              return <FeatureSelector feature={surfaceFeat} options={options} rates={rates} addOnItems={addOnItems} updateAddOn={updateAddOn} width={width} length={length} panelLocations={panelLocations} />;
            })()}

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
                  <div key={opt.value} className="form-check">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="roofing"
                      id={`roofing-${opt.value}`}
                      value={opt.value}
                      checked={!!roofing && roofing === opt.value}
                      onChange={() => setRoofing(opt.value)}
                    />
                    <label className="form-check-label" htmlFor={`roofing-${opt.value}`}>
                      {opt.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Roof Pitch */}
            <div className="mb-3">
              <div className="fw-semibold mb-2">Roof Pitch: {roofPitch || "3/12"}</div>
              <div className="d-flex flex-column gap-2">
                {["3/12", "4/12", "5/12", "6/12"].map((pitch) => (
                  <div key={pitch} className="form-check">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="roof-pitch"
                      id={`roof-pitch-${pitch.replace("/", "-")}`}
                      value={pitch}
                      checked={!!roofPitch && roofPitch === pitch}
                      onChange={() => setRoofPitch(pitch)}
                    />
                    <label className="form-check-label" htmlFor={`roof-pitch-${pitch.replace("/", "-")}`}>
                      {pitch}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Roof Overhang */}
            <div className="mb-3">
              <div className="fw-semibold mb-2">Roof Overhang: {roofOverhang || '6"'}</div>
              <div className="d-flex flex-column gap-2">
                {['6"', '12"', '18"'].map((overhang) => (
                  <div key={overhang} className="form-check">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="roof-overhang"
                      id={`roof-overhang-${overhang.replace('"', "")}`}
                      value={overhang}
                      checked={!!roofOverhang && roofOverhang === overhang}
                      onChange={() => setRoofOverhang(overhang)}
                    />
                    <label className="form-check-label" htmlFor={`roof-overhang-${overhang.replace('"', "")}`}>
                      {overhang}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Dimensions */}
            <div className="fw-semibold mb-2">Dimensions</div>
            <div className="row g-2 mb-3">
              <div className="col-4">
                <label className="form-label small mb-0">Width</label>
                <select className="form-select form-select-sm" value={width} onChange={(e) => setWidth(Number(e.target.value))}>
                  {widths.map((v) => <option key={v} value={v}>{v}&apos;</option>)}
                </select>
              </div>
              <div className="col-4">
                <label className="form-label small mb-0">Length</label>
                <select className="form-select form-select-sm" value={length} onChange={(e) => setLength(Number(e.target.value))}>
                  {lengths.map((v) => <option key={v} value={v}>{v}&apos;</option>)}
                </select>
              </div>
              <div className="col-4">
                <label className="form-label small mb-0">Leg Height</label>
                <select className="form-select form-select-sm" value={height} onChange={(e) => setHeight(Number(e.target.value))}>
                  {heights.map((v) => <option key={v} value={v}>{v}&apos;</option>)}
                </select>
              </div>
            </div>

            {/* Sides & Ends */}
            <div className="fw-semibold mb-2">Sides &amp; Ends</div>
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

            {wallMode === "custom" && panelFeature && (
              <div className="mb-3">
                <div className="small fw-semibold mb-2">Per-Wall Panels</div>
                {panelLocations.map((loc) => {
                  const locOpts = panelOptions.filter(
                    (o) => o.feature_id === panelFeature.feature_id && o.location_type === loc.location_type
                  );
                  return (
                    <div key={loc.location_id} className="mb-2">
                      <label className="form-label small mb-0">{loc.name}</label>
                      <select className="form-select form-select-sm"
                        value={wallSelections[loc.location_id] ?? ""}
                        onChange={(e) => changeWallSelection(loc.location_id, e.target.value)}>
                        <option value="">Open (No Panel)</option>
                        {locOpts.map((o) => (
                          <option key={o.option_id} value={o.option_id}>{o.name}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: LEAN-TO ────────────────────────────── */}
        {rightPanelMode === "leantos" && (
          <div className="p-3">
            <div className="fw-semibold mb-2">Lean-Tos</div>

            {/* Visual wall picker — compact cross layout */}
            {availableLeantoStyles.length > 0 && (() => {
              const usedSides = new Set(leantos.map((x) => x.side_key));
              const S = ({ sk, lb }) => {
                const on = usedSides.has(sk);
                return (
                  <div
                    className={`d-flex align-items-center justify-content-center border rounded ${on ? "border-primary bg-primary bg-opacity-10" : ""}`}
                    style={{ width: 52, height: 32, cursor: "pointer", fontSize: 11, fontWeight: 600, gap: 4 }}
                    onClick={() => { if (on) { setActiveSection(sk); setLeantoFocusTick((t) => t + 1); } else { addLeanTo(sk); setLeantoFocusTick((t) => t + 1); } }}
                    title={on ? `Remove ${lb}` : `Add ${lb}`}
                  >
                    <AppIcon icon={on ? "check" : "plus"} style={{ fontSize: 10 }}
                      className={on ? "text-primary" : "text-danger"} />
                    {lb}
                  </div>
                );
              };
              return (
                <div className="d-flex flex-column align-items-center gap-1 mb-2">
                  <S sk="back" lb="Back" />
                  <div className="d-flex gap-2">
                    <S sk="left" lb="Left" />
                    <S sk="right" lb="Right" />
                  </div>
                  <S sk="front" lb="Front" />
                </div>
              );
            })()}

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
              return (
                <div key={lt.side_key} className="mb-3 p-2 border rounded bg-light" style={{ cursor: "pointer" }}
                  onClick={() => { setActiveSection(lt.side_key); setLeantoFocusTick((t) => t + 1); }}>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <div className="fw-semibold small">{sideLabel} Lean-To</div>
                    <button className="btn btn-link btn-sm text-danger p-0" onClick={(e) => { e.stopPropagation(); removeLeanTo(lt.side_key); }}>Remove</button>
                  </div>

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
            <p className="text-muted small mb-3">Colors are approximate. Select colors for each part.</p>
            {colorGroups.map((group) => {
              const groupOpts = colorOptions.filter((o) => o.color_group_id === group.color_group_id);
              const selectedOptId = colorSelections[group.color_group_id];
              const selectedOpt = groupOpts.find((o) => o.color_option_id === selectedOptId);
              return (
                <div key={group.color_group_id} className="mb-3">
                  <div className="small fw-semibold mb-1">
                    {group.name}: <span className="text-muted fw-normal">{selectedOpt?.name ?? "None"}</span>
                  </div>
                  <div className="d-flex flex-wrap gap-1">
                    {groupOpts.map((opt) => (
                      <div key={opt.color_option_id}
                        title={opt.name}
                        style={{
                          width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
                          background: opt.hex_code,
                          border: selectedOptId === opt.color_option_id ? "3px solid #333" : "2px solid #ccc",
                          boxShadow: selectedOptId === opt.color_option_id ? "0 0 0 2px #333" : "none",
                        }}
                        onClick={() => setColorSelections((prev) => ({ ...prev, [group.color_group_id]: opt.color_option_id }))}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {sidingFeature && (
              <>
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

            {/* Deposits */}
            <div className="mb-3">
              <div className="fw-semibold mb-2">Deposits</div>

              <div className="d-flex flex-column gap-2">
                {/* Standard (no deposit) */}
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="depositMode"
                    id="depositStandard"
                    value="standard"
                    checked={depositMode === "standard"}
                    onChange={() => setDepositMode("standard")}
                  />
                  <label className="form-check-label" htmlFor="depositStandard">
                    Standard
                  </label>
                </div>

                {/* Custom Amount */}
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="depositMode"
                    id="depositCustomAmount"
                    value="customAmount"
                    checked={depositMode === "customAmount"}
                    onChange={() => setDepositMode("customAmount")}
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
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="depositMode"
                    id="depositCustomPercentage"
                    value="customPercentage"
                    checked={depositMode === "customPercentage"}
                    onChange={() => setDepositMode("customPercentage")}
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

            {/* Dealer Deposit Discount */}
            <div className="mb-3">
              <div className="fw-semibold mb-2">Dealer Deposit Discount</div>

              <div className="d-flex flex-column gap-2">
                {/* Deposit Discount Amount */}
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="dealerDiscountMode"
                    id="dealerDiscountAmount"
                    value="amount"
                    checked={dealerDiscountMode === "amount"}
                    onChange={() => setDealerDiscountMode("amount")}
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
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="dealerDiscountMode"
                    id="dealerDiscountPercentage"
                    value="percentage"
                    checked={dealerDiscountMode === "percentage"}
                    onChange={() => setDealerDiscountMode("percentage")}
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

            {/* Sales Tax */}
            <div className="mb-3">
              <div className="fw-semibold mb-2">Sales Tax</div>

              <div className="d-flex flex-column gap-2">
                {/* Standard */}
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="salesTaxMode"
                    id="salesTaxStandard"
                    value="standard"
                    checked={salesTaxMode === "standard"}
                    onChange={() => setSalesTaxMode("standard")}
                  />
                  <label className="form-check-label w-100" htmlFor="salesTaxStandard">
                    Standard ({(salesTaxRate * 100).toFixed(2)}%)
                  </label>
                </div>

                {/* Exempt */}
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="salesTaxMode"
                    id="salesTaxExempt"
                    value="exempt"
                    checked={salesTaxMode === "exempt"}
                    onChange={() => setSalesTaxMode("exempt")}
                  />
                  <label className="form-check-label w-100" htmlFor="salesTaxExempt">
                    Exempt
                  </label>
                </div>

                {/* Percentage */}
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="radio"
                    name="salesTaxMode"
                    id="salesTaxPercentage"
                    value="percentage"
                    checked={salesTaxMode === "percentage"}
                    onChange={() => setSalesTaxMode("percentage")}
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
            </form>
          </div>
        </div>
      )}
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
    <div className="mb-3 ps-2 border-start border-2">
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
  const [selectedId, setSelectedId] = useState(() => {
    if (currentItem) {
      const opt = featureOptions.find((o) => o.name === currentItem.description);
      return opt?.option_id ?? null;
    }
    return null;
  });

  const handleSelect = (optionId) => {
    const newId = optionId === selectedId ? null : optionId;
    setSelectedId(newId);
    if (!newId) { onUpdate(null); return; }
    const opt = featureOptions.find((o) => o.option_id === newId);
    if (!opt) { onUpdate(null); return; }
    onUpdate({ featureId: fId, featureName: feature.name, description: opt.name, price: Number(opt.price) });
  };

  const isSingleOption = featureOptions.length === 1;

  return (
    <div className="mb-3 ps-2 border-start border-2">
      <div className="fw-semibold mb-1">{feature.name}</div>
      {feature.description && <div className="text-muted small mb-2">{feature.description}</div>}
      <div className="d-flex flex-column gap-1">
        {featureOptions.map((opt) => (
          <div key={opt.option_id} className="form-check">
            <input className="form-check-input" type={isSingleOption ? "checkbox" : "radio"} name={`fixed-${fId}`}
              checked={selectedId === opt.option_id} onChange={() => handleSelect(opt.option_id)}
              id={`opt-${opt.option_id}`} />
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
    <div className="mb-3 ps-2 border-start border-2">
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
