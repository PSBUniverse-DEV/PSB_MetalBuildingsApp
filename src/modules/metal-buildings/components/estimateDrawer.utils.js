import { calcPanelOptionPrice } from "../data/metalBuildings.data";

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

function findColorName(colorGroups, colorOptions, colorSelections, groupName) {
  const group = colorGroups?.find(
    (g) => g.name?.toLowerCase() === groupName.toLowerCase()
  );
  if (!group) return null;
  const selectedId = colorSelections?.[group.color_group_id];
  if (!selectedId) return null;
  const option = colorOptions?.find(
    (o) => o.color_option_id === selectedId && o.color_group_id === group.color_group_id
  );
  return option?.name ?? null;
}

function buildWallPanelItems({
  panelFeature,
  panelLocations,
  panelOptions,
  wallSelections,
  width,
  length,
  touchedWallLocationIds,
}) {
  if (!panelFeature || !panelLocations?.length || !panelOptions?.length) return [];

  const locs = panelLocations.filter((l) => l.feature_id === panelFeature.feature_id);
  const opts = panelOptions.filter((o) => o.feature_id === panelFeature.feature_id);

  return locs
    .map((loc) => {
      const selectedOptId = wallSelections?.[loc.location_id];
      if (!selectedOptId) return null;
      // Only show walls the user explicitly changed (skip auto-defaulted sides).
      if (!touchedWallLocationIds?.has(loc.location_id)) return null;
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

function buildLeantoItems({ leantos, leantoPrices, selectedStyleId }) {
  if (!leantos?.length) return [];
  return leantos
    .map((lt) => {
      const match = leantoPrices?.find(
        (p) =>
          p.leanto_style_id === lt.leanto_style_id &&
          p.style_id === selectedStyleId &&
          p.width_ft === lt.width_ft &&
          p.height_ft === lt.height_ft
      );
      const price = match ? Number(match.price) : 0;
      const sideLabel = lt.side_key ? lt.side_key.charAt(0).toUpperCase() + lt.side_key.slice(1) : "";
      return {
        label: `${sideLabel} Lean-To`,
        value: `${lt.width_ft}' × ${lt.length_ft ?? lt.width_ft}'`,
        price,
      };
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
    colorGroups,
    colorOptions,
    colorSelections,
    addOnItems = {},
    features = [],
    doorWindowSelections,
    doorWindowItems,
    leantos,
    leantoPrices,
    selectedStyleId,
    selectedRegion,
    touchedWallLocationIds,
    subtotal = 0,
    taxRate = 0.07,
  } = params;

  const styleName = selectedStyle?.name ?? 'Structure';
  const title = `${styleName} (${width}×${length}×${height})`;

  const structureItems = [];
  structureItems.push({ label: 'Style', value: styleName });
  structureItems.push({ label: 'Base Price', value: `${width}'×${length}'`, price: Number(basePrice) });

  const roofColor = findColorName(colorGroups, colorOptions, colorSelections, 'Roof');
  if (roofColor) structureItems.push({ label: 'Roof', value: roofColor });

  const trimColor = findColorName(colorGroups, colorOptions, colorSelections, 'Trim');
  if (trimColor) structureItems.push({ label: 'Trim Colors', value: trimColor });

  const sidingColor = findColorName(colorGroups, colorOptions, colorSelections, 'Siding');
  if (sidingColor) structureItems.push({ label: 'Siding', value: sidingColor });

  const structuralAddonIds = new Set();
  for (const mapping of STRUCTURAL_ADDON_MAPPINGS) {
    const match = Object.values(addOnItems).find((item) => {
      const feature = findFeatureById(features, item.featureId);
      return matchesStructuralMapping(item, feature, mapping);
    });
    if (match) {
      structuralAddonIds.add(match.featureId);
      structureItems.push({ label: mapping.label, value: match.description ?? match.featureName });
    }
  }

  structureItems.push({ label: 'Leg Height', value: `${height}'` });
  structureItems.push(...buildWallPanelItems({ panelFeature, panelLocations, panelOptions, wallSelections, width, length, touchedWallLocationIds }));
  structureItems.push(...buildLeantoItems({ leantos, leantoPrices, selectedStyleId }));

  const allDoorWindowItems = buildDoorWindowItems(doorWindowSelections, doorWindowItems);
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
  const taxAmount = Math.round(safeSubtotal * taxRate * 100) / 100;
  const total = safeSubtotal + taxAmount;

  const sections = [];
  if (structureItems.length) sections.push({ title: 'Structure Details', items: structureItems });
  if (doorItems.length) sections.push({ title: 'Doors & Ramps', items: doorItems });
  if (windowItems.length) sections.push({ title: 'Windows & Accessories', items: windowItems });
  if (additionalItems.length) sections.push({ title: 'Additional Options', items: additionalItems });

  return {
    title,
    yourPrice: safeSubtotal,
    disclaimer: 'Final pricing, including pricing adjustments, discounts, delivery, and taxes will be provided with final quote prior to purchase.',
    sections,
    summary: { subtotal: safeSubtotal, taxRate, taxAmount, total },
  };
}
