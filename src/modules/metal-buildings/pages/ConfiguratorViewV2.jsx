"use client";
// ═══════════════════════════════════════════════════════════
// ConfiguratorViewV2 — IdeaRoom-style configurator UX
// Section → Wall → Add Items flow. Visual, clean, one context at a time.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import AppIcon from "@/shared/components/ui/AppIcon";
import {
  lookupMatrixPrice,
  getUniqueDimensionValues,
  applyRegionMultiplier,
  calcPanelOptionPrice,
  calcTotalPanelPrice,
  formatCurrency,
} from "../data/metalBuildings.data";
import { getStyleProfile, isFeatureAllowed, isAccessoryAllowed } from "../data/styleProfiles";

const BuildingPreview = dynamic(() => import("./BuildingPreviewV2"), { ssr: false });

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
  const { styles, regions, features, matrixPrices, panelLocations, panelOptions, rates, options, doorWindowItems, colorGroups, colorOptions, leantoStyles, leantoSides, leantoPrices, leantoCompat, styleDefaults } = data;

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
  const [selectedStyleId, setSelectedStyleId] = useState(styles[0]?.style_id ?? null);
  const [selectedRegion, setSelectedRegion] = useState(null);

  const baseFeature = features.find((f) => f.is_required);
  const baseFeatureId = baseFeature?.feature_id;

  // Helper: get the style row for current selection
  const selectedStyle = styles.find((s) => s.style_id === selectedStyleId);

  const widths = useMemo(() => getUniqueDimensionValues(matrixPrices, baseFeatureId, selectedStyleId, "width"), [matrixPrices, baseFeatureId, selectedStyleId]);
  const lengths = useMemo(() => getUniqueDimensionValues(matrixPrices, baseFeatureId, selectedStyleId, "length"), [matrixPrices, baseFeatureId, selectedStyleId]);
  const heights = useMemo(() => getUniqueDimensionValues(matrixPrices, baseFeatureId, selectedStyleId, "height"), [matrixPrices, baseFeatureId, selectedStyleId]);

  const initStyle = styles[0];
  const [width, setWidth] = useState(initStyle?.default_width ?? widths[0] ?? 12);
  const [length, setLength] = useState(initStyle?.default_length ?? lengths[0] ?? 20);
  const [height, setHeight] = useState(initStyle?.default_height ?? heights[0] ?? 6);

  // wallMode must be declared before prevStyleId handler uses setWallMode
  const [wallMode, setWallMode] = useState(initStyle?.has_walls ? "enclosed" : "open");

  // panelFeature + wallSelections must be declared before prevStyleId handler
  const panelFeature = features.find((f) => f.pricing_type === "PANEL");
  const [wallSelections, setWallSelections] = useState({});

  // Reset dimensions on style change + apply DB defaults
  const [prevStyleId, setPrevStyleId] = useState(selectedStyleId);
  if (prevStyleId !== selectedStyleId) {
    setPrevStyleId(selectedStyleId);
    // Use DB default dimensions from the style row
    const dbW = selectedStyle?.default_width;
    const dbL = selectedStyle?.default_length;
    const dbH = selectedStyle?.default_height;
    setWidth(dbW && widths.includes(dbW) ? dbW : widths[0] ?? width);
    setLength(dbL && lengths.includes(dbL) ? dbL : lengths[0] ?? length);
    setHeight(dbH && heights.includes(dbH) ? dbH : heights[0] ?? height);
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
  }

  // ─── PANEL STATE ─────────────────────────────────────────

  // Siding direction
  const sidingFeature = features.find((f) => f.render_key === "siding_panel");
  const sidingOptions = useMemo(() => (sidingFeature ? options.filter((o) => o.feature_id === sidingFeature.feature_id) : []), [sidingFeature, options]);
  const [sidingOptionId, setSidingOptionId] = useState(null);
  const sidingDirection = useMemo(() => {
    const opt = sidingOptions.find((o) => o.option_id === sidingOptionId);
    return opt?.name?.toLowerCase().includes("horizontal") ? "horizontal" : "vertical";
  }, [sidingOptions, sidingOptionId]);

  // ─── ADD-ONS STATE ───────────────────────────────────────
  const [addOnItems, setAddOnItems] = useState({});

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
  const [showQuoteModal, setShowQuoteModal] = useState(false);
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

  // Highlighted wall for 3D preview (openings tab uses activeWall, lean-to tab uses activeSection)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const highlightedWall = rightPanelMode === "openings"
    ? (activeSection === "center" ? activeWall : `${activeSection}:${activeWall}:${leantoFocusTick}`)
    : rightPanelMode === "leantos" && activeSection !== "center" ? `${activeSection}:${leantoFocusTick}`
    : null;

  // ─── SIDES & ENDS: wall mode presets ─────────────────────
  const applyMode = useCallback(
    (mode) => {
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
      setWallSelections(newSelections);
    },
    [panelFeature, panelLocations, panelOptions]
  );

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
    return lookupMatrixPrice(matrixPrices, baseFeature.feature_id, selectedStyleId, width, length, height) ?? 0;
  }, [baseFeature, matrixPrices, selectedStyleId, width, length, height]);

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

  const subtotal = basePrice + panelPrice + addOnTotal + doorWindowTotal + colorUpchargeTotal + leantoTotal;
  const grandTotal = applyRegionMultiplier(subtotal, selectedRegion);
  const regionAdjustment = grandTotal - subtotal;

  // ─── WALL PANEL INIT ─────────────────────────────────────
  const [wallSelectionsInited, setWallSelectionsInited] = useState(false);
  if (!wallSelectionsInited && panelLocations.length > 0 && panelOptions.length > 0) {
    setWallSelectionsInited(true);
    const initial = {};
    for (const loc of panelLocations) {
      // Default to enclosed
      const opt = panelOptions.find(
        (o) => o.feature_id === panelFeature?.feature_id && o.location_type === loc.location_type && o.render_type === "enclosed"
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
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
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

  // ─── 3D PREVIEW PROPS ────────────────────────────────────
  const roofStyle3d = selectedStyle?.render_key ?? "regular";
  const defaultRoofPitch = selectedStyle?.default_roof_pitch ?? 0.25;
  const headerLabel = `${selectedStyle?.name ?? "Structure"} (${width}×${length}×${height})`;

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

  const roofPitchRatio = useMemo(() => {
    const pitchFeature = features.find((f) => f.render_key === "roof_pitch");
    const item = pitchFeature ? Object.values(addOnItems).find((i) => i.featureId === pitchFeature.feature_id) : null;
    if (!item) return null;
    const match = item.description?.match(/([\d.]+)\/([\d.]+)/);
    if (match) return Number(match[1]) / Number(match[2]);
    return null;
  }, [addOnItems, features]);

  const roofOverhangFt = useMemo(() => {
    const ovFeature = features.find((f) => f.render_key === "roof_overhang");
    const item = ovFeature ? Object.values(addOnItems).find((i) => i.featureId === ovFeature.feature_id) : null;
    if (!item) return 0;
    const desc = item.description || "";
    const ftMatch = desc.match(/([\d.]+)\s*['\u2019]/);
    if (ftMatch) return Number(ftMatch[1]);
    const inMatch = desc.match(/([\d.]+)\s*["\u201D]/);
    if (inMatch) return Number(inMatch[1]) / 12;
    const numMatch = desc.match(/([\d.]+)/);
    if (numMatch) return Number(numMatch[1]);
    return 0;
  }, [addOnItems, features]);

  const clampedLeantos = useMemo(() => {
    return leantos.map((lt) => {
      const isSide = lt.side_key === "left" || lt.side_key === "right";
      const maxW = isSide ? width : length;
      const maxH = height;
      const maxLen = isSide ? length : width;
      const clampedWidth = lt.width_ft >= maxW ? Math.max(1, maxW - 1) : lt.width_ft;
      const clampedHeight = lt.height_ft >= maxH ? Math.max(1, maxH - 1) : lt.height_ft;
      const clampedLen = lt.length_ft > maxLen ? maxLen : lt.length_ft;
      if (clampedWidth !== lt.width_ft || clampedHeight !== lt.height_ft || clampedLen !== lt.length_ft) {
        return { ...lt, width_ft: clampedWidth, height_ft: clampedHeight, length_ft: clampedLen };
      }
      return lt;
    });
  }, [leantos, width, length, height]);

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
        <BuildingPreview
          width={width} length={length} height={height}
          roofStyle={roofStyle3d} roofPitch={roofPitchRatio} defaultRoofPitch={defaultRoofPitch}
          roofOverhang={roofOverhangFt} walls={walls3d} highlightedWall={highlightedWall}
          sidingDirection={sidingDirection}
          roofColor={(() => { const grp = colorGroups.find(g => g.render_target === "roof"); if (!grp) return "#cc0000"; const opt = colorOptions.find(o => o.color_option_id === colorSelections[grp.color_group_id]); return opt?.hex_code ?? "#cc0000"; })()}
          wallColor={(() => { const grp = colorGroups.find(g => g.render_target === "wall"); if (!grp) return "#e0e0e0"; const opt = colorOptions.find(o => o.color_option_id === colorSelections[grp.color_group_id]); return opt?.hex_code ?? "#e0e0e0"; })()}
          twoToneColor={(() => { const grp = colorGroups.find(g => g.render_target === "two_tone"); if (!grp) return null; const opt = colorOptions.find(o => o.color_option_id === colorSelections[grp.color_group_id]); if (!opt || opt.name === "None") return null; return opt.hex_code; })()}
          leantos={clampedLeantos} openings={doorWindowSelections}
          onWallClick={(wallKey) => { setRightPanelMode("openings"); setActiveSection("center"); setActiveWall(wallKey); }}
        />

        {/* Top-left label */}
        <div style={{ position: "absolute", top: 16, left: 16 }}>
          <h5 className="mb-0 fw-bold" style={{ color: "#333" }}>{headerLabel}</h5>
        </div>

        {/* Bottom Get Quote button */}
        <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)" }}>
          <button className="btn btn-danger fw-bold px-4 py-2" style={{ borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }} onClick={() => setShowQuoteModal(true)}>
            Get Quote
          </button>
        </div>
      </div>

      {/* ═══ RIGHT: Configuration Panel ═══ */}
      <div style={{ flex: "0 0 30%", overflowY: "auto", overflowX: "hidden", borderLeft: "1px solid #ddd", position: "relative" }} className="bg-white">
        {/* Header */}
        <div className="p-3 border-bottom">
          <div className="text-muted small">{selectedStyle?.name}</div>
          <div className="fw-bold">{width}×{length}×{height}</div>

          <div className="d-flex gap-1 mt-2 flex-wrap">
            {[
              { mode: "location", icon: "map-marker-alt", label: "Location" },
              { mode: "building", icon: "building", label: "Style" },
              { mode: "leantos", icon: "layer-group", label: "Lean-To" },
              { mode: "openings", icon: "door-open", label: "Doors & Windows" },
              { mode: "colors", icon: "palette", label: "Colors" },
              { mode: "materials", icon: "gear", label: "Materials" },
            ].map(({ mode, icon, label }) => (
              <button key={mode}
                className={`btn btn-sm flex-fill ${rightPanelMode === mode ? "btn-dark" : "btn-outline-secondary"}`}
                onClick={() => setRightPanelMode(mode)}>
                <AppIcon icon={icon} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── TAB: BUILDING (Style + Size + Sides) ──── */}
        {rightPanelMode === "building" && (
          <div className="p-3">
            {/* Style */}
            <div className="fw-semibold mb-2">Building Style</div>
            <div className="row row-cols-2 g-2 mb-3">
              {styles.map((style) => (
                <div key={style.style_id} className="col">
                  <div
                    className={`card h-100 text-center p-2 ${selectedStyleId === style.style_id ? "border-primary border-2" : ""}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedStyleId(style.style_id)}
                  >
                    <AppIcon icon="building" className="fs-4 d-block mb-1" />
                    <div className="small fw-semibold">{style.name}</div>
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
                        onChange={(e) => setWallSelections((prev) => ({ ...prev, [loc.location_id]: Number(e.target.value) }))}>
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

            {/* Roof Pitch — available for vertical, truss, garage, barn */}
            {["vertical", "truss", "garage", "barn"].includes(selectedStyle?.render_key) && (() => {
              const pitchFeat = features.find((f) => f.render_key === "roof_pitch");
              if (!pitchFeat) return null;
              return <FeatureSelector feature={pitchFeat} options={options} rates={rates} addOnItems={addOnItems} updateAddOn={updateAddOn} width={width} length={length} panelLocations={panelLocations} />;
            })()}

            {/* Roof Overhang — available for vertical, garage, barn */}
            {["vertical", "garage", "barn"].includes(selectedStyle?.render_key) && (() => {
              const ovFeat = features.find((f) => f.render_key === "roof_overhang");
              if (!ovFeat) return null;
              return <FeatureSelector feature={ovFeat} options={options} rates={rates} addOnItems={addOnItems} updateAddOn={updateAddOn} width={width} length={length} panelLocations={panelLocations} />;
            })()}
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

        {/* ─── TAB: LOCATION (Delivery) ────────── */}
        {rightPanelMode === "location" && (
          <div className="p-3">
            <div className="fw-semibold mb-2">Delivery Location</div>
            <div className="mb-3">
              <label className="form-label small mb-1">Region</label>
              <select className="form-select" value={selectedRegion ?? ""}
                onChange={(e) => setSelectedRegion(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Select a region…</option>
                {regions.map((r) => (
                  <option key={r.region_id} value={r.region_id}>{r.name}</option>
                ))}
              </select>
            </div>
            {selectedRegion && (
              <div className="text-muted small">
                Region: <strong>{regions.find((r) => r.region_id === selectedRegion)?.name}</strong>
              </div>
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

      </div>

      {/* ═══ QUOTE MODAL ═══ */}
      {showQuoteModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ zIndex: 9999, background: "rgba(0,0,0,0.5)" }} onClick={() => setShowQuoteModal(false)}>
          <div className="bg-white rounded-3 shadow-lg p-4" style={{ maxWidth: 460, width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="fw-bold mb-0">Quote Summary</h5>
              <button className="btn-close" onClick={() => setShowQuoteModal(false)} />
            </div>
            <div className="text-muted small mb-3">{selectedStyle?.name} — {width}&apos; × {length}&apos; × {height}&apos;</div>
            {basePrice > 0 && <QuoteLine label="Base Structure" price={basePrice} />}
            {panelPrice > 0 && <QuoteLine label="Panels" price={panelPrice} />}
            {leantoTotal > 0 && <QuoteLine label="Lean-Tos" price={leantoTotal} />}
            {doorWindowTotal > 0 && <QuoteLine label="Doors & Windows" price={doorWindowTotal} />}
            {colorUpchargeTotal > 0 && <QuoteLine label="Color Upgrades" price={colorUpchargeTotal} />}
            {addOnTotal > 0 && <QuoteLine label="Add-Ons" price={addOnTotal} />}
            {regionAdjustment !== 0 && <QuoteLine label="Delivery Adjustment" price={regionAdjustment} />}
            <hr />
            <div className="d-flex justify-content-between">
              <span className="fw-bold fs-5">Estimated Total</span>
              <span className="fw-bold text-danger fs-4">{formatCurrency(grandTotal)}</span>
            </div>
            <button className="btn btn-dark w-100 mt-3" onClick={() => setShowQuoteModal(false)}>Close</button>
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

// ─── QUOTE LINE ────────────────────────────────────────────

function QuoteLine({ label, price }) {
  return (
    <div className="d-flex justify-content-between mb-2">
      <span className="small">{label}</span>
      <span className="small fw-bold">{formatCurrency(price)}</span>
    </div>
  );
}

// ─── FEATURE SELECTOR (dispatcher) ─────────────────────────

function FeatureSelector({ feature, rates, options, addOnItems, updateAddOn, width, length, panelLocations }) {
  const onUpdate = useCallback((item) => updateAddOn(feature.feature_id, item), [feature.feature_id, updateAddOn]);
  switch (feature.pricing_type) {
    case "RATE":
      return <RateSelector feature={feature} rates={rates} onUpdate={onUpdate} />;
    case "FIXED":
      return <FixedSelector feature={feature} options={options} onUpdate={onUpdate} />;
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

function FixedSelector({ feature, options: allOptions, onUpdate }) {
  const fId = feature.feature_id;
  const featureOptions = allOptions.filter((o) => o.feature_id === fId);
  const [selectedId, setSelectedId] = useState(null);

  const handleSelect = (optionId) => {
    const newId = optionId === selectedId ? null : optionId;
    setSelectedId(newId);
    if (!newId) { onUpdate(null); return; }
    const opt = featureOptions.find((o) => o.option_id === newId);
    if (!opt) { onUpdate(null); return; }
    onUpdate({ featureId: fId, featureName: feature.name, description: opt.name, price: Number(opt.price) });
  };

  return (
    <div className="mb-3 ps-2 border-start border-2">
      <div className="fw-semibold mb-1">{feature.name}</div>
      {feature.description && <div className="text-muted small mb-2">{feature.description}</div>}
      <div className="d-flex flex-column gap-1">
        {featureOptions.map((opt) => (
          <div key={opt.option_id} className="form-check">
            <input className="form-check-input" type="radio" name={`fixed-${fId}`}
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
