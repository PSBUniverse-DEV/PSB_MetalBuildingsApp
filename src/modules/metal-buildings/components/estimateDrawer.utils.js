import { calcPanelOptionPrice } from "../data/metalBuildings.data";
import { getStyleProfile } from "../data/styleProfiles";
import { buildOrderForm } from "./orderForm.utils";

const DOOR_WINDOW_DOOR_TYPES = new Set([
  "door",
  "rollup_door",
  "walk_in_door",
  "walk-in_door",
  "frame_out",
  "frameout",
  "ramp",
]);

const DOOR_WINDOW_WINDOW_TYPES = new Set([
  "window",
  "vent",
  "louver",
  "accessory",
]);

const STRUCTURAL_ADDON_MAPPINGS = [
  { label: "Installation Surface", keywords: ["installation", "surface"] },
  { label: "Roof Pitch", keywords: ["pitch"] },
  { label: "Roof Overhang", keywords: ["overhang"] },
  { label: "Trusses", keywords: ["truss"] },
  { label: "Gauge", keywords: ["gauge"] },
  { label: "Brace", keywords: ["brace"] },
  { label: "Engineer Certified", keywords: ["certif", "engineer"] },
];

function findFeatureById(features, featureId) {
  return features?.find((f) => f.feature_id === featureId) ?? null;
}

function matchesStructuralMapping(item, feature, mapping) {
  const haystack = `${feature?.name ?? ""} ${feature?.render_key ?? ""} ${item?.description ?? ""}`.toLowerCase();
  return mapping.keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

function findColorOption(colorGroups, colorOptions, colorSelections, groupName) {
  const group = colorGroups?.find(
    (g) => g.name?.toLowerCase() === groupName.toLowerCase()
  );
  if (!group) return null;
  const selectedId = colorSelections?.[group.color_group_id];
  if (!selectedId) return null;
  const option = colorOptions?.find(
    (o) => o.color_option_id === selectedId && o.color_group_id === group.color_group_id
  );
  return option ?? null;
}

function buildWallPanelItems({
  panelFeature,
  panelLocations,
  panelOptions,
  panelPricing,
  wallSelections,
  width,
  length,
  wallMode,
  wallPanelPrices,
  sidingStyle = "Horizontal",
}) {
  if (!panelFeature || !panelLocations?.length) return [];

  // "Enclosed" walls are priced flat from metal_m_panel_pricing (width × height),
  // per individual wall (left/right sidewalls, front/back end walls).
  if (wallMode === "enclosed") {
    const side = Number(wallPanelPrices?.side ?? 0);
    const end = Number(wallPanelPrices?.end ?? 0);
    const locs = panelLocations.filter((l) => l.location_type === "side" || l.location_type === "end");
    return locs
      .map((loc) => {
        const price = loc.location_type === "end" ? end : side;
        if (price <= 0) return null;
        const label = String(loc.name ?? "").replace(/\s*Gable\s*/gi, " ").trim();
        return { label, value: "Fully Enclosed", price };
      })
      .filter(Boolean);
  }

  // "Gable" mode prices only the end walls (front/back) from the flat gable-end
  // price; side walls stay open. Each priced end wall also shows a no-price
  // "<wall> Siding" row with the siding style used in the price lookup.
  if (wallMode === "gable") {
    const gableEnd = Number(wallPanelPrices?.gableEnd ?? 0);
    const locs = panelLocations.filter((l) => l.location_type === "end");
    return locs
      .flatMap((loc) => {
        if (gableEnd <= 0) return [];
        const label = String(loc.name ?? "").replace(/\s*Gable\s*/gi, " ").trim();
        return [
          { label, value: "Gable End", price: gableEnd },
          { label: `${label} Siding`, value: sidingStyle },
        ];
      });
  }

  // "Custom" mode (ConfiguratorViewV1): each wall's selection is a
  // metal_m_panel_pricing row (panel type "Custom"), priced flat from its `price`.
  // Only used when the caller supplies panelPricing (V1); otherwise the legacy
  // metal_s_panel_option path below handles the selection (e.g. ConfiguratorViewV2).
  if (wallMode === "custom" && panelPricing) {
    const locs = panelLocations.filter((l) => l.feature_id === panelFeature.feature_id);
    return locs
      .map((loc) => {
        const selectedId = wallSelections?.[loc.location_id];
        if (!selectedId) return null;
        const row = panelPricing.find((r) => r.panel_pricing_id === selectedId);
        if (!row) return null;
        const price = Number(row.price ?? 0);
        // Skip no-op / free rows (e.g. explicitly set "Open (No Panel)").
        if (price <= 0) return null;
        return {
          label: loc.name,
          value: row.option_name ?? "Custom Panel",
          price,
        };
      })
      .filter(Boolean);
  }

  if (!panelOptions?.length) return [];

  const locs = panelLocations.filter((l) => l.feature_id === panelFeature.feature_id);
  const opts = panelOptions.filter((o) => o.feature_id === panelFeature.feature_id);

  return locs
    .map((loc) => {
      const selectedOptId = wallSelections?.[loc.location_id];
      if (!selectedOptId) return null;
      // Show all selected wall panels that have a non-zero price.
      const opt = opts.find((o) => o.option_id === selectedOptId);
      if (!opt) return null;
      const price = calcPanelOptionPrice(opt, width, length);
      // Skip no-op / free rows (e.g. explicitly set "Open (No Panel)").
      if (price <= 0) return null;
      return {
        label: loc.name,
        value: opt.name,
        price,
      };
    })
    .filter(Boolean);
}

/**
 * "Add J-Trim (Sides)" rows for the estimate's Structure Details — one
 * "<Left|Right> Side J-Trim" row per side that has a lean-to (labels derive
 * from the lean-to side, not the DB wall names). Each row is inserted right
 * after that side's wall panel rows (panel + "… Siding"); when the side has no
 * wall rows it falls back to the end of the wall block. Rows are value-only
 * (no price), matching the "… Siding" rows. Returns the wall rows unchanged
 * unless the J-Trim option is set to "Add J-Trim (Sides)".
 */
function buildJTrimItems(wallItems, leantos, jTrimSelection) {
  if (jTrimSelection !== "Add J-Trim (Sides)") return wallItems;
  const items = [...wallItems];
  for (const sideKey of ["left", "right"]) {
    if (!leantos?.some((lt) => lt.side_key === sideKey)) continue;
    const row = {
      label: `${sideKey === "left" ? "Left" : "Right"} Side J-Trim`,
      value: jTrimSelection,
    };
    // Insert after the last wall row belonging to this side (its panel row and
    // any "<wall> Siding" row).
    let idx = -1;
    for (let i = items.length - 1; i >= 0; i--) {
      if (String(items[i].label ?? "").toLowerCase().includes(sideKey)) { idx = i; break; }
    }
    if (idx >= 0) items.splice(idx + 1, 0, row);
    else items.push(row);
  }
  return items;
}

function buildDoorWindowItems(doorWindowSelections, doorWindowItems) {
  const items = [];
  if (!doorWindowSelections) return items;

  for (const [wall, entries] of Object.entries(doorWindowSelections)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const wallLabel = wall.charAt(0).toUpperCase() + wall.slice(1);
    for (const entry of entries) {
      const dbItem = doorWindowItems?.find((i) => i.item_id === entry.item_id);
      const type = dbItem?.item_type ?? "";
      items.push({
        wall,
        wallLabel,
        item_id: entry.item_id,
        name: entry.name,
        price: Number(entry.price ?? 0),
        type,
      });
    }
  }
  return items;
}

function buildLeantoOpeningItems(leantos) {
  const items = [];
  if (!leantos?.length) return items;
  for (const lt of leantos) {
    if (!lt.openings) continue;
    const sideLabel = lt.side_key ? lt.side_key.charAt(0).toUpperCase() + lt.side_key.slice(1) : "";
    for (const [wallKey, entries] of Object.entries(lt.openings)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        items.push({
          label: entry.name,
          value: `${sideLabel} Lean-To ${wallKey}`,
          price: Number(entry.price ?? 0),
        });
      }
    }
  }
  return items;
}

function leantoSideLabel(sideKey) {
  return sideKey ? sideKey.charAt(0).toUpperCase() + sideKey.slice(1) : "";
}

/**
 * Build one estimate section per lean-to ("Left Lean", "Right Lean", …) with
 * the full lean-to detail rows:
 *   Base Price / Type / Roof Style / Roof Pitch / Gauge / Brace / Leg Height /
 *   Side Connection Fee.
 *
 * Rows without a data source are skipped so callers that don't supply the
 * per-lean-to UI state (e.g. ConfiguratorViewV2) degrade gracefully.
 */
function buildLeantoSections({
  leantos,
  leantoBasePrices,
  leantoStyles,
  leantoUiOptions,
  leantoRoofPrices,
  leantoConnectionFees,
  gaugeLabel,
  braceLabel,
}) {
  if (!leantos?.length) return [];
  return leantos
    .map((lt) => {
      const sideLabel = leantoSideLabel(lt.side_key);
      const pfx = `${sideLabel} Lean`;
      const ltUi = leantoUiOptions?.[lt.side_key] ?? {};
      const items = [];

      // Base Price — looked up from metal_m_feature_matrix_price ("Attached
      // Lean To" feature) by the lean-to's Size + selected region
      // (lookupLeantoBasePrice → leantoBasePrices map, keyed by side).
      items.push({
        label: `${pfx} Base Price`,
        value: `${lt.width_ft}'x${lt.length_ft ?? lt.width_ft}'`,
        price: Number(leantoBasePrices?.[lt.side_key] ?? 0),
      });

      // Type — the selected lean-to style name (metal_s_leanto_style).
      const styleName = leantoStyles?.find((s) => s.leanto_style_id === lt.leanto_style_id)?.name;
      if (styleName) items.push({ label: `${pfx} Type`, value: styleName });

      // Roof Style — per-lean-to selection, priced from the Roof Style matrix
      // (lookupRoofStyleBasePrice by the lean-to's width/length).
      if (ltUi.roofStyle) {
        items.push({
          label: `${pfx} Roof Style`,
          value: ltUi.roofStyle === "Horizontal" ? "A-Frame Horizontal" : "A-Frame Vertical",
          price: Number(leantoRoofPrices?.[lt.side_key] ?? 0),
        });
      }

      if (ltUi.roofPitch) items.push({ label: `${pfx} Roof Pitch`, value: ltUi.roofPitch });
      if (gaugeLabel) items.push({ label: `${pfx} Gauge`, value: gaugeLabel });
      if (braceLabel) items.push({ label: `${pfx} Brace`, value: braceLabel });
      items.push({ label: `${pfx} Leg Height`, value: `${lt.height_ft}'` });

      // Connection Fee — priced from the DB-configured "Connection Fee" options
      // (metal_s_feature_option, matched by the lean-to's Length + region via
      // lookupConnectionFee); omitted when the lean-to is set to "None".
      if (ltUi.sideConnection && ltUi.sideConnection !== "none") {
        items.push({ label: `${pfx} Side Connection Fee`, price: Number(leantoConnectionFees?.[lt.side_key] ?? 0) });
      }

      return { title: `${sideLabel} Lean`, items };
    })
    .filter(Boolean);
}


/**
 * Build a shaped estimate object for the EstimateDetailsDrawer from the
 * configurator's current state.
 */
export function buildEstimate(params) {
  const {
    selectedStyle,
    width,
    length,
    height,
    basePrice = 0,
    wallSelections,
    panelFeature,
    panelLocations,
    panelOptions,
    panelPricing,
    panelTypes,
    wallMode,
    wallPanelPrices,
    sidingStyle = "Horizontal",
    jTrimSelection = null,
    colorGroups,
    colorOptions,
    colorSelections,
    addOnItems = {},
    features = [],
    doorWindowSelections,
    doorWindowItems,
    leantos,
    leantoBasePrices = null,
    leantoStyles = [],
    leantoUiOptions = {},
    leantoRoofPrices = {},
    leantoConnectionFees = {},
    selectedRegion,
    subtotal = 0,
    grandTotal,
    regionAdjustment = 0,
    taxRate = 0.07,
    deposit = 0,
    discount = 0,
    roofing,
    roofOverhang,
    roofOverhangUpcharge = 0,
    roofPitch,
    roofPitchUpcharge = 0,
    roofStyleBasePrice = 0,
    legHeightPrice = 0,
    gutterPricing = null,
    gutterSideLabel = null,
    downspoutCount = 0,
    zipCode,
    zipCity,
    zipStateCode,
  } = params;

  const styleName = selectedStyle?.name ?? 'Structure';
  const title = `${styleName} (${width}×${length}×${height})`;

  const structureItems = [];
  structureItems.push({ label: 'Base Price', value: `${width}'×${length}'`, price: Number(basePrice) });

  const roofingLabel = roofing === 'Horizontal' ? 'A-Frame Horizontal' : 'A-Frame Vertical';
  if (roofing) structureItems.push({ label: 'Roofing Style', value: roofingLabel, price: Number(roofStyleBasePrice ?? 0) });

  // Roof Pitch — upcharge = (W × H × L) × multiplier factor from
  // metal_s_feature_option (DB-driven — no factor is hardcoded)
  if (roofPitch) structureItems.push({ label: 'Roof Pitch', value: roofPitch, price: Number(roofPitchUpcharge ?? 0) });

  // Roof Overhang — upcharge = Base Structure Price × multiplier factor
  // (e.g. 0.15 → basePrice × 0.15) from metal_s_feature_option
  if (roofOverhang) structureItems.push({ label: 'Roof Overhang', value: roofOverhang, price: Number(roofOverhangUpcharge ?? 0) });

  const roofColor = findColorOption(colorGroups, colorOptions, colorSelections, 'Roof');
  if (roofColor) structureItems.push({ label: 'Roof', value: roofColor.name, price: Number(roofColor.upcharge ?? 0) });

  const trimColor = findColorOption(colorGroups, colorOptions, colorSelections, 'Trim');
  if (trimColor) structureItems.push({ label: 'Trim Colors', value: trimColor.name, price: Number(trimColor.upcharge ?? 0) });

  const sidingColor = findColorOption(colorGroups, colorOptions, colorSelections, 'Siding');
  if (sidingColor) structureItems.push({ label: 'Siding', value: sidingColor.name, price: Number(sidingColor.upcharge ?? 0) });

  // Order Form Colors column (name + hex swatch).
  const colorRows = [
    roofColor && { label: 'Roof', value: roofColor.name, hex: roofColor.hex_code ?? null },
    trimColor && { label: 'Trim', value: trimColor.name, hex: trimColor.hex_code ?? null },
    sidingColor && { label: 'Siding', value: sidingColor.name, hex: sidingColor.hex_code ?? null },
  ].filter(Boolean);

  const structuralAddonIds = new Set();
  const structuralAddonLabels = {};
  for (const mapping of STRUCTURAL_ADDON_MAPPINGS) {
    const match = Object.values(addOnItems).find((item) => {
      const feature = findFeatureById(features, item.featureId);
      return matchesStructuralMapping(item, feature, mapping);
    });
    if (match) {
      structuralAddonIds.add(match.featureId);
      structuralAddonLabels[mapping.label] = match.description ?? match.featureName;
      structureItems.push({ label: mapping.label, value: match.description ?? match.featureName, price: Number(match.price ?? 0) });
    }
  }

  // Gauge / Brace labels mirrored onto each lean-to section. Fall back to the
  // style profile's structural defaults when no add-on is selected.
  const styleStructureDefaults = getStyleProfile(selectedStyle?.render_key)?.structureDefaults ?? {};
  const gaugeLabel = structuralAddonLabels["Gauge"] ?? styleStructureDefaults.gauge ?? null;
  const braceLabel = structuralAddonLabels["Brace"] ?? styleStructureDefaults.brace ?? null;

  structureItems.push({ label: 'Leg Height', value: `${height}'`, price: Number(legHeightPrice ?? 0) });
  // Wall panel rows, plus the "Add J-Trim (Sides)" rows — one "<Side> Side
  // J-Trim" row per side lean-to, placed right after that side's wall rows.
  const wallPanelItems = buildWallPanelItems({ panelFeature, panelLocations, panelOptions, panelPricing, wallSelections, width, length, wallMode, wallPanelPrices, sidingStyle });
  structureItems.push(...buildJTrimItems(wallPanelItems, leantos, jTrimSelection));

  // One section per lean-to ("Left Lean", …) with the full lean-to detail rows.
  const leantoSections = buildLeantoSections({
    leantos,
    leantoBasePrices,
    leantoStyles,
    leantoUiOptions,
    leantoRoofPrices,
    leantoConnectionFees,
    gaugeLabel,
    braceLabel,
  });

  // Gutters & downspouts — gutter run by calculateGutterPricing, downspout
  // price by computeDownspoutPrice (metal_s_feature_option base price).
  // Both rows live in "Structure Details", with Downspouts listed directly
  // below Rain Gutters. $0 gutter line items are never displayed; the downspout
  // item is always listed when downspouts are configured (count > 0) with its
  // own price (a $0 amount renders label-only via hideZeroAmounts).
  const gutterPrice = Number(gutterPricing?.gutterPrice ?? 0);
  const downspoutPrice = Number(gutterPricing?.downspoutPrice ?? 0);
  const safeDownspoutCount = Math.min(10, Math.max(0, Math.trunc(Number(downspoutCount) || 0)));
  if (gutterPrice > 0) {
    structureItems.push({ label: 'Rain Gutters', value: gutterSideLabel ?? undefined, price: gutterPrice });
  }
  if (downspoutPrice > 0 || safeDownspoutCount > 0) {
    structureItems.push({ label: `Downspouts (x${safeDownspoutCount})`, price: downspoutPrice });
  }

  const allDoorWindowItems = buildDoorWindowItems(doorWindowSelections, doorWindowItems);
  const leantoOpeningItems = buildLeantoOpeningItems(leantos);
  const doorItems = allDoorWindowItems
    .filter((i) => DOOR_WINDOW_DOOR_TYPES.has(i.type.toLowerCase()))
    .map((i) => ({ label: i.name, value: i.wallLabel, price: i.price }));
  const windowItems = allDoorWindowItems
    .filter((i) => DOOR_WINDOW_WINDOW_TYPES.has(i.type.toLowerCase()))
    .map((i) => ({ label: i.name, value: i.wallLabel, price: i.price }));
  const uncategorizedDoorWindowItems = allDoorWindowItems.filter(
    (i) => !DOOR_WINDOW_DOOR_TYPES.has(i.type.toLowerCase()) && !DOOR_WINDOW_WINDOW_TYPES.has(i.type.toLowerCase())
  );

  const additionalItems = [];
  for (const item of Object.values(addOnItems)) {
    if (structuralAddonIds.has(item.featureId)) continue;
    additionalItems.push({ label: item.featureName, value: item.description, price: Number(item.price ?? 0) });
  }
  for (const item of uncategorizedDoorWindowItems) {
    additionalItems.push({ label: item.name, value: item.wallLabel, price: item.price });
  }

  const regionName = selectedRegion?.name;
  if (regionName) structureItems.push({ label: 'Region', value: regionName });

  const safeSubtotal = Math.max(0, Number(subtotal));
  const safeGrandTotal = Math.max(0, Number(grandTotal ?? subtotal));
  const safeRegionAdjustment = Number(regionAdjustment ?? 0);
  const taxAmount = Math.round(safeGrandTotal * taxRate * 100) / 100;
  const total = safeGrandTotal + taxAmount;
  const safeDeposit = Math.max(0, Math.min(Number(deposit) || 0, total));
  const safeDiscount = Math.max(0, Math.min(Number(discount) || 0, safeDeposit));
  const depositDueNow = Math.max(0, safeDeposit - safeDiscount);
  const dueUponDelivery = Math.max(0, total - depositDueNow);

  const sections = [];
  if (structureItems.length) sections.push({ title: 'Structure Details', items: structureItems });
  sections.push(...leantoSections);
  if (doorItems.length) sections.push({ title: 'Doors & Ramps', items: doorItems });
  if (windowItems.length) sections.push({ title: 'Windows & Accessories', items: windowItems });
  if (leantoOpeningItems.length) sections.push({ title: 'Lean-To Openings', items: leantoOpeningItems });
  if (additionalItems.length) sections.push({ title: 'Additional Options', items: additionalItems });

  const orderForm = buildOrderForm({
    params: { selectedStyle, width, length, height, zipCode, zipCity, zipStateCode },
    sections,
    summary: { subtotal: safeSubtotal, grandTotal: safeGrandTotal, regionAdjustment: safeRegionAdjustment, taxRate, taxAmount, total, deposit: safeDeposit, discount: safeDiscount, depositDueNow, dueUponDelivery },
    colorRows,
  });

  return {
    title,
    yourPrice: safeGrandTotal,
    disclaimer: 'Final pricing, including pricing adjustments, discounts, delivery, and taxes will be provided with final quote prior to purchase.',
    sections,
    summary: { subtotal: safeSubtotal, grandTotal: safeGrandTotal, regionAdjustment: safeRegionAdjustment, taxRate, taxAmount, total, deposit: safeDeposit, discount: safeDiscount, depositDueNow, dueUponDelivery },
    orderForm,
  };
}
