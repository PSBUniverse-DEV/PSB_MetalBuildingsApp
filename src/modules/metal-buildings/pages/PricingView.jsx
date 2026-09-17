"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button, Card, Badge, Modal, Input, TableZ, TABLE_FILTER_TYPES, createFilterConfig, toastSuccess, toastError } from "@/shared/components/ui";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTableCells, faTags, faListCheck, faLayerGroup, faPalette, faPlus, faBan, faTrash, faCheck, faSync } from "@fortawesome/free-solid-svg-icons";
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from "../data/metalBuildings.data";
import {
  loadMatrixPrices,
  loadRate,
  loadOptions,
  createFeature,
  updateFeature,
  deleteFeature,
  upsertMatrixPrice,
  deleteMatrixPrice,
  upsertRate,
  upsertOption,
  deleteOption,
  loadPanelPricing,
  loadPanelTypes,
  upsertPanelPricing,
  deletePanelPricing,
  bulkLoadRegionPanelPriceMatrix,
  insertRegionPanelPriceMatrix,
  deleteRegionPanelPriceMatrix,
  loadColorGroups,
  loadColorOptions,
  upsertColorGroup,
  deleteColorGroup,
  upsertColorOption,
  deleteColorOption,
  bulkLoadRegionPriceMatrix,
  insertRegionPriceMatrix,
  deleteRegionPriceMatrix,
  loadLegHeightPrices,
  upsertLegHeightPrice,
  deleteLegHeightPrice,
  bulkLoadRegionLegPriceMatrix,
  insertRegionLegPriceMatrix,
  deleteRegionLegPriceMatrix,
  loadDoorWindowItems,
  loadDoorWindowItemsByType,
  upsertDoorWindowItem,
  deleteDoorWindowItem,
  bulkLoadRegionDoorWindow,
  insertRegionDoorWindow,
  deleteRegionDoorWindow,
} from "../data/metalBuildings.actions";
import "./pricing.css";

const TYPE_ICONS = {
  MATRIX: faTableCells,
  RATE: faTags,
  OPTIONS: faListCheck,
  PANEL: faLayerGroup,
  COLOR: faPalette,
};

// Roof Style is now a fixed selection of panel orientations.
const ROOF_STYLE_OPTIONS = ["Horizontal", "Vertical"];

// Siding Style is a fixed selection of panel orientations.
const SIDING_STYLE_OPTIONS = ["Horizontal", "Vertical"];

// Renders the dropdown options; keeps any pre-existing/legacy free-text value
// (e.g. "Regular", "A-Frame") visible so admins can see it and switch it.
function roofStyleOptions(currentValue) {
  const options = [...ROOF_STYLE_OPTIONS];
  const current = String(currentValue ?? "").trim();
  if (current && !options.includes(current)) options.push(current);
  return options;
}

function formatRegionNames(regions, regionIds) {
  const selected = new Set(regionIds ?? []);
  if (selected.size === 0) return "All regions";
  return regions
    .filter((r) => selected.has(r.region_id))
    .map((r) => `${r.name} (${r.state_code})`)
    .join(", ");
}

function RowViewModal({ show, onHide, title, fields }) {
  return (
    <Modal title={title} show={show} onHide={onHide} footer={<Button size="sm" onClick={onHide}>Close</Button>}>
      {fields && fields.length > 0 ? (
        <div className="row g-3">
          {fields.map((f) => (
            <div key={f.label} className={f.full ? "col-12" : "col-6"}>
              <div className="text-muted small text-uppercase" style={{ fontSize: "0.68rem", letterSpacing: "0.04em", fontWeight: 600 }}>{f.label}</div>
              <div className="text-break">{f.value ?? "—"}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted mb-0">No details available.</p>
      )}
    </Modal>
  );
}

export default function PricingView({ features: initialFeatures, styles, pricingTypes: pricingTypesData, categories: categoriesData, regions, legTypes }) {
  const [features, setFeatures] = useState(initialFeatures);
  const [selectedId, setSelectedId] = useState(features[0]?.feature_id ?? null);
  const [search, setSearch] = useState("");

  const pricingTypes = useMemo(() => pricingTypesData ?? [], [pricingTypesData]);
  const categories = categoriesData ?? [];

  const filtered = features.filter((f) => {
    return f.name.toLowerCase().includes(search.toLowerCase()) || (f.category_name || "").toLowerCase().includes(search.toLowerCase());
  });

  const grouped = useMemo(() => {
    const map = {};
    for (const f of filtered) {
      const key = f.pricing_type || "OTHER";
      if (!map[key]) map[key] = [];
      map[key].push(f);
    }
    // Order groups by pricingTypes order, then any remaining
    const order = pricingTypes.map((pt) => pt.code);
    const sorted = [];
    for (const code of order) {
      if (map[code]) sorted.push([code, map[code]]);
    }
    for (const [key, items] of Object.entries(map)) {
      if (!order.includes(key)) sorted.push([key, items]);
    }
    return sorted;
  }, [filtered, pricingTypes]);

  const selected = features.find((f) => f.feature_id === selectedId) ?? null;

  return (
    <div className="pricing-wrap">
      {/* ─── Sidebar ─── */}
      <aside className="pricing-sidebar">
        <div className="pricing-sidebar-header">
          <p className="pricing-sidebar-title">Features</p>
          <AddFeatureButton pricingTypes={pricingTypes} categories={categories} onCreated={(f) => { setFeatures((prev) => [...prev, f]); setSelectedId(f.feature_id); }} />
        </div>

        <div className="pricing-sidebar-search">
          <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="pricing-sidebar-list">
          {grouped.map(([type, items]) => (
            <div key={type} className="pricing-group">
              <div className="pricing-group-header">
                <FontAwesomeIcon icon={TYPE_ICONS[type] || faListCheck} className="pricing-group-icon" />
                <span>{type}</span>
                <span className="pricing-group-count">{items.length}</span>
              </div>
              {items.map((f) => (
                <button
                  key={f.feature_id}
                  className={`pricing-nav-item${selectedId === f.feature_id ? " active" : ""}`}
                  onClick={() => setSelectedId(f.feature_id)}
                >
                  <span className="nav-label">{f.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>


      </aside>

      {/* ─── Main ─── */}
      <main className="pricing-main">
        {selected ? (
          <FeatureDetail
            key={selected.feature_id}
            feature={selected}
            styles={styles}
            regions={regions}
            legTypes={legTypes}
            onUpdated={(f) => setFeatures((prev) => prev.map((x) => x.feature_id === f.feature_id ? f : x))}
            onDeleted={(id) => { setFeatures((prev) => prev.filter((x) => x.feature_id !== id)); setSelectedId(null); }}
          />
        ) : (
          <div className="pricing-empty">
            <FontAwesomeIcon icon={faTableCells} className="pricing-empty-icon" />
            <span className="pricing-empty-text">Select a feature to view pricing</span>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── FEATURE DETAIL ────────────────────────────────────────

function FeatureDetail({ feature, styles, regions, legTypes, onUpdated, onDeleted }) {
  const [matrixPrices, setMatrixPrices] = useState([]);
  const [rate, setRate] = useState(null);
  const [options, setOptions] = useState([]);
  const [panelPricing, setPanelPricing] = useState([]);
  const [colorGroups, setColorGroups] = useState([]);
  const [doorWindowItems, setDoorWindowItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const contentRef = useRef(null);

  // ─── Feature detection ────────────────────────────────────
  const isRoofStyleFeature = feature?.name?.toLowerCase().trim() === "roof style";
  // The DB row currently ships the legacy spelling "Leg Heigt".
  const normFeatureName = feature?.name?.toLowerCase().replace(/\s+/g, " ").trim();
  const isLegHeightFeature = normFeatureName === "leg height" || normFeatureName === "Building Leg Height";
  const isRollupDoorFeature = normFeatureName === "rollup door";
  const isDoorFeature = normFeatureName === "door" || normFeatureName === "walk-in door";
  const isRoofPitchFeature = feature?.render_key === "roof_pitch";
  const isRoofOverhangFeature = feature?.render_key === "roof_overhang";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        if (feature.pricing_type === "MATRIX") {
          const data = isLegHeightFeature ? await loadLegHeightPrices() : await loadMatrixPrices(feature.feature_id);
          if (!cancelled) setMatrixPrices(data);
        } else if (feature.pricing_type === "PANEL") {
          const data = await loadPanelPricing(feature.feature_id);
          if (!cancelled) setPanelPricing(data);
        } else if (feature.pricing_type === "RATE") {
          const data = await loadRate(feature.feature_id);
          if (!cancelled) setRate(data);
        } else if (feature.pricing_type === "COLOR") {
          const data = await loadColorGroups(feature.feature_id);
          if (!cancelled) setColorGroups(data);
        } else if (feature.pricing_type === "PER_ITEM") {
          const data = await loadDoorWindowItems(feature.feature_id);
          if (!cancelled) setDoorWindowItems(data);
        } else if (isRollupDoorFeature) {
          const data = await loadDoorWindowItemsByType("rollup_door");
          if (!cancelled) setDoorWindowItems(data);
        } else if (isDoorFeature) {
          const data = await loadDoorWindowItemsByType("door");
          if (!cancelled) setDoorWindowItems(data);
        } else {
          const data = await loadOptions(feature.feature_id);
          if (!cancelled) setOptions(data);
        }
      } catch (err) {
        toastError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [feature.feature_id, feature.pricing_type, isLegHeightFeature, isRollupDoorFeature, isDoorFeature]);

  // Keep the sticky table header offset equal to the height of the sticky
  // filter toolbar so the header sits just below the filters.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    let resizeObserver = null;
    let observedShell = null;

    const updateHeight = () => {
      if (observedShell) {
        content.style.setProperty("--pricing-filter-height", `${observedShell.offsetHeight}px`);
      } else {
        content.style.setProperty("--pricing-filter-height", "0px");
      }
    };

    const connectResizeObserver = (shell) => {
      if (resizeObserver) resizeObserver.disconnect();
      observedShell = shell;
      resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(shell);
      updateHeight();
    };

    const mutationObserver = new MutationObserver(() => {
      const shell = content.querySelector(".psb-ui-table-filters-shell--sticky");
      if (shell && shell !== observedShell) {
        connectResizeObserver(shell);
      } else if (!shell && observedShell) {
        resizeObserver.disconnect();
        observedShell = null;
        content.style.setProperty("--pricing-filter-height", "0px");
      }
    });

    mutationObserver.observe(content, { childList: true, subtree: true });

    const initialShell = content.querySelector(".psb-ui-table-filters-shell--sticky");
    if (initialShell) connectResizeObserver(initialShell);

    return () => {
      mutationObserver.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      content.style.removeProperty("--pricing-filter-height");
    };
  }, []);

  const toggleActive = async () => {
    try {
      const updated = await updateFeature(feature.feature_id, { is_active: !feature.is_active });
      onUpdated(updated);
      toastSuccess(`${feature.name} ${updated.is_active ? "activated" : "deactivated"}`);
    } catch (err) {
      toastError(err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteFeature(feature.feature_id);
      toastSuccess(`Feature "${feature.name}" deleted`);
      onDeleted(feature.feature_id);
    } catch (err) {
      toastError(err.message);
    }
  };

  const itemCount = feature.pricing_type === "MATRIX" ? matrixPrices.length
    : feature.pricing_type === "PANEL" ? panelPricing.length
    : feature.pricing_type === "COLOR" ? colorGroups.length
    : feature.pricing_type === "RATE" ? (rate ? 1 : 0)
    : (feature.pricing_type === "PER_ITEM" || isRollupDoorFeature || isDoorFeature) ? doorWindowItems.length
    : options.length;

  return (
    <>
      {/* Topbar */}
      <div className="pricing-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <p className="pricing-page-title">{feature.name}</p>
            <div className="pricing-detail-meta">
              <p className="pricing-page-sub">{feature.category_name} &middot; {feature.pricing_type_label || feature.pricing_type}</p>
              <span className={`pricing-status-dot ${feature.is_active ? "active" : "inactive"}`} title={feature.is_active ? "Active" : "Inactive"} />
            </div>
          </div>
        </div>
        <div className="pricing-actions-bar">
          <Button size="sm" variant="ghost" onClick={toggleActive} title={feature.is_active ? "Deactivate" : "Activate"}>
            <FontAwesomeIcon icon={feature.is_active ? faBan : faCheck} />
          </Button>
          {!confirmDelete ? (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} title="Delete feature">
              <FontAwesomeIcon icon={faTrash} />
            </Button>
          ) : (
            <>
              <Button variant="danger" size="sm" onClick={handleDelete}>Confirm</Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="pricing-content" ref={contentRef}>
        {loading ? (
          <p className="text-muted small">Loading pricing data…</p>
        ) : (
          <>
            {feature.pricing_type === "MATRIX" && isRoofStyleFeature && (
              <RoofStyleMatrixEditor featureId={feature.feature_id} prices={matrixPrices} styles={styles} regions={regions} onRefresh={async () => setMatrixPrices(await loadMatrixPrices(feature.feature_id))} />
            )}
            {feature.pricing_type === "MATRIX" && isLegHeightFeature && (
              <LegHeightMatrixEditor featureId={feature.feature_id} prices={matrixPrices} legTypes={legTypes} regions={regions} onRefresh={async () => setMatrixPrices(await loadLegHeightPrices())} />
            )}
            {feature.pricing_type === "MATRIX" && !isRoofStyleFeature && !isLegHeightFeature && (
              <MatrixEditor featureId={feature.feature_id} prices={matrixPrices} styles={styles} regions={regions} onRefresh={async () => setMatrixPrices(await loadMatrixPrices(feature.feature_id))} />
            )}
            {feature.pricing_type === "PANEL" && <PanelEditor featureId={feature.feature_id} panelPricing={panelPricing} regions={regions} onRefresh={async () => setPanelPricing(await loadPanelPricing(feature.feature_id))} />}
            {feature.pricing_type === "RATE" && <RateEditor featureId={feature.feature_id} rate={rate} onRefresh={async () => setRate(await loadRate(feature.feature_id))} />}
            {feature.pricing_type === "COLOR" && <ColorEditor featureId={feature.feature_id} groups={colorGroups} onRefresh={async () => setColorGroups(await loadColorGroups(feature.feature_id))} />}
            {feature.pricing_type === "PER_ITEM" && <DoorWindowEditor featureId={feature.feature_id} items={doorWindowItems} regions={regions} onRefresh={async () => setDoorWindowItems(await loadDoorWindowItems(feature.feature_id))} />}
            {isRollupDoorFeature && <DoorWindowEditor featureId={feature.feature_id} items={doorWindowItems} regions={regions} fixedType="rollup_door" onRefresh={async () => setDoorWindowItems(await loadDoorWindowItemsByType("rollup_door"))} />}
            {isDoorFeature && <DoorWindowEditor featureId={feature.feature_id} items={doorWindowItems} regions={regions} fixedType="door" onRefresh={async () => setDoorWindowItems(await loadDoorWindowItemsByType("door"))} />}
            {!["MATRIX", "PANEL", "RATE", "COLOR", "PER_ITEM"].includes(feature.pricing_type) && !isRollupDoorFeature && !isDoorFeature && <OptionsEditor featureId={feature.feature_id} options={options} isMultiplier={isRoofPitchFeature || isRoofOverhangFeature} allowedDimensions={isRoofOverhangFeature ? ["width", "length"] : undefined} onRefresh={async () => setOptions(await loadOptions(feature.feature_id))} />}
          </>
        )}
      </div>

      {/* Footer */}
      {!loading && (
        <div className="pricing-footer">
          <span className="pricing-footer-text">{itemCount} {itemCount === 1 ? "row" : "rows"}</span>
          <span className={`pricing-type-badge ${feature.pricing_type.toLowerCase()}`}>{feature.pricing_type}</span>
        </div>
      )}
    </>
  );
}

// ─── ROOF STYLE MATRIX EDITOR ────────────────────────────────

function roofStyleRowLabel(row) {
  const style = row?.roof_stye?.trim() || "—";
  const fmt = (min, max, unit) => {
    if (min != null && max != null) return `${min}–${max} ${unit}`;
    if (min != null) return `${min} ${unit}`;
    if (max != null) return `up to ${max} ${unit}`;
    return null;
  };
  const dims = [fmt(row?.width, row?.width_max, "W"), fmt(row?.length, row?.length_max, "L")].filter(Boolean);
  return dims.length ? `${style} (${dims.join(" x ")})` : style;
}

function RoofStyleMatrixEditor(props) {
  // Remount the editor whenever the underlying prices change.
  return <RoofStyleMatrixTable key={props.prices || "empty"} {...props} />;
}

function RoofStyleMatrixTable({ featureId, prices, regions, onRefresh }) {
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [viewRow, setViewRow] = useState(null);

  const [addForm, setAddForm] = useState({
    roof_stye: "",
    width: "", length: "", width_max: "", length_max: "", base_price: "", selectedRegionIds: [],
  });
  const [editForm, setEditForm] = useState({
    roof_stye: "", width: "", length: "", width_max: "", length_max: "", base_price: "", selectedRegionIds: [],
  });

  // ─── Region mappings ──────────────────────────────────────
  const [regionSelections, setRegionSelections] = useState({});
  const originalRegionRef = useRef({});

  useEffect(() => {
    let cancelled = false;
    const realIds = prices
      .filter((p) => typeof p.matrix_price_id === "number" && p.matrix_price_id > 0)
      .map((p) => p.matrix_price_id);
    if (realIds.length === 0) return;
    (async () => {
      try {
        const map = await bulkLoadRegionPriceMatrix(realIds);
        if (cancelled) return;
        originalRegionRef.current = { ...map };
        setRegionSelections((prev) => {
          const next = { ...prev };
          for (const [id, regionIds] of Object.entries(map)) {
            if (!next[id]) next[id] = [...regionIds];
          }
          return next;
        });
      } catch (err) { /* silently fail */ }
    })();
    return () => { cancelled = true; };
  }, [prices]);

  // ─── ADD ───────────────────────────────────────────────────

  const handleAdd = useCallback(async () => {
    const base_price = parseFloat(parseCurrencyInput(addForm.base_price));
    if (isNaN(base_price) || base_price <= 0) { toastError("Base Price is required"); return; }
    if (!addForm.roof_stye.trim()) { toastError("Roof Style is required"); return; }

    setSaving(true);
    try {
      const result = await upsertMatrixPrice({
        feature_id: featureId,
        width: addForm.width ? parseInt(addForm.width) : null,
        length: addForm.length ? parseInt(addForm.length) : null,
        height: null,
        width_max: addForm.width_max ? parseInt(addForm.width_max) : null,
        length_max: addForm.length_max ? parseInt(addForm.length_max) : null,
        roof_stye: addForm.roof_stye.trim(),
        base_price,
        leg_height_price: 0,
        enclosed_sides_price: 0,
        enclosed_ends_price: 0,
      });

      const realId = result?.matrix_price_id;
      if (realId && addForm.selectedRegionIds.length > 0) {
        for (const regionId of addForm.selectedRegionIds) {
          await insertRegionPriceMatrix(regionId, realId);
        }
      }

      toastSuccess("Price added");
      setAddForm({
        roof_stye: "",
        width: "", length: "", width_max: "", length_max: "", base_price: "", selectedRegionIds: [],
      });
      setAddOpen(false);
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [addForm, featureId, onRefresh]);

  // ─── EDIT ───────────────────────────────────────────────────

  const handleStartEdit = useCallback((row) => {
    setEditingId(row.matrix_price_id);
    const regIds = regionSelections[row.matrix_price_id] ?? originalRegionRef.current[String(row.matrix_price_id)] ?? [];
    setEditForm({
      roof_stye: row.roof_stye ?? "",
      width: row.width ?? "",
      length: row.length ?? "",
      width_max: row.width_max ?? "",
      length_max: row.length_max ?? "",
      base_price: row.base_price ?? "",
      selectedRegionIds: [...regIds],
    });
  }, [regionSelections]);

  const handleSave = useCallback(async () => {
    const base_price = parseFloat(parseCurrencyInput(editForm.base_price));
    if (isNaN(base_price) || base_price <= 0) { toastError("Base Price is required"); return; }
    if (!editForm.roof_stye.trim()) { toastError("Roof Style is required"); return; }

    setSaving(true);
    try {
      await upsertMatrixPrice({
        matrix_price_id: editingId,
        feature_id: featureId,
        width: editForm.width ? parseInt(editForm.width) : null,
        length: editForm.length ? parseInt(editForm.length) : null,
        height: null,
        width_max: editForm.width_max ? parseInt(editForm.width_max) : null,
        length_max: editForm.length_max ? parseInt(editForm.length_max) : null,
        roof_stye: editForm.roof_stye.trim(),
        base_price,
        leg_height_price: 0,
        enclosed_sides_price: 0,
        enclosed_ends_price: 0,
      });

      // Sync region mappings
      const currentRegions = new Set(editForm.selectedRegionIds);
      const originalRegions = new Set(originalRegionRef.current[String(editingId)] ?? []);
      for (const regionId of currentRegions) {
        if (!originalRegions.has(regionId)) {
          await insertRegionPriceMatrix(regionId, editingId);
        }
      }
      for (const regionId of originalRegions) {
        if (!currentRegions.has(regionId)) {
          await deleteRegionPriceMatrix(regionId, editingId);
        }
      }

      toastSuccess("Price updated");
      setEditingId(null);
      setEditForm({ roof_stye: "", width: "", length: "", width_max: "", length_max: "", base_price: "", selectedRegionIds: [] });
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [editForm, editingId, featureId, onRefresh]);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditForm({ roof_stye: "", width: "", length: "", width_max: "", length_max: "", base_price: "", selectedRegionIds: [] });
    setRegionSelections((prev) => {
      const original = originalRegionRef.current[String(editingId)];
      if (original) return { ...prev, [editingId]: [...original] };
      const next = { ...prev };
      delete next[editingId];
      return next;
    });
  }, [editingId]);

  // ─── DELETE ───────────────────────────────────────────────

  const handleDelete = useCallback(async (row) => {
    setSaving(true);
    try {
      await deleteMatrixPrice(row.matrix_price_id);
      toastSuccess("Price deleted");
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [onRefresh]);

  const roofStyleColumns = useMemo(() => [
    {
      key: "roof_stye", label: "Roof Style", width: 160, sortable: true,
      render: (row) => editingId === row.matrix_price_id
        ? <select className="form-select form-select-sm" value={editForm.roof_stye} onChange={(e) => setEditForm((p) => ({ ...p, roof_stye: e.target.value }))}>
            <option value="">Select…</option>
            {roofStyleOptions(editForm.roof_stye).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        : (row.roof_stye || "—"),
    },
    {
      key: "width", label: "Width", width: 150, sortable: true,
      sortValue: (row) => `${row.width ?? 0}-${row.width_max ?? 0}`,
      render: (row) => editingId === row.matrix_price_id
        ? (
          <div className="d-flex gap-1 align-items-center">
            <input type="number" className="form-control form-control-sm" style={{ width: 55 }} placeholder="Min" value={editForm.width} onChange={(e) => setEditForm((p) => ({ ...p, width: e.target.value.replace(/[^0-9]/g, "") }))} />
            <span>–</span>
            <input type="number" className="form-control form-control-sm" style={{ width: 55 }} placeholder="Max" value={editForm.width_max} onChange={(e) => setEditForm((p) => ({ ...p, width_max: e.target.value.replace(/[^0-9]/g, "") }))} />
          </div>
        )
        : `${row.width ?? "-"}–${row.width_max ?? "-"}`,
    },
    {
      key: "length", label: "Length", width: 150, sortable: true,
      sortValue: (row) => `${row.length ?? 0}-${row.length_max ?? 0}`,
      render: (row) => editingId === row.matrix_price_id
        ? (
          <div className="d-flex gap-1 align-items-center">
            <input type="number" className="form-control form-control-sm" style={{ width: 55 }} placeholder="Min" value={editForm.length} onChange={(e) => setEditForm((p) => ({ ...p, length: e.target.value.replace(/[^0-9]/g, "") }))} />
            <span>–</span>
            <input type="number" className="form-control form-control-sm" style={{ width: 55 }} placeholder="Max" value={editForm.length_max} onChange={(e) => setEditForm((p) => ({ ...p, length_max: e.target.value.replace(/[^0-9]/g, "") }))} />
          </div>
        )
        : `${row.length ?? "-"}–${row.length_max ?? "-"}`,
    },
    {
      key: "base_price", label: "Base Price", width: 130, sortable: true,
      render: (row) => editingId === row.matrix_price_id
        ? <input className="form-control form-control-sm" value={formatCurrencyInput(editForm.base_price)} onChange={(e) => setEditForm((p) => ({ ...p, base_price: parseCurrencyInput(e.target.value) }))} />
        : formatCurrency(row.base_price),
    },
    {
      key: "regions", label: "Regions", width: 260, sortable: false,
      render: (row) => {
        const rowId = row.matrix_price_id;
        const isEditing = editingId === rowId;
        const selected = new Set(isEditing ? (editForm.selectedRegionIds ?? []) : (regionSelections[rowId] ?? originalRegionRef.current[String(rowId)] ?? []));
        if (isEditing) {
          return (
            <div className="d-flex flex-wrap gap-1" style={{ maxWidth: 260 }}>
              {regions.map((r) => (
                <label key={r.region_id} className="form-check form-check-inline mb-0 me-1" style={{ fontSize: "0.8rem" }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={selected.has(r.region_id)}
                    onChange={(e) => {
                      setEditForm((prev) => ({
                        ...prev,
                        selectedRegionIds: e.target.checked
                          ? [...(prev.selectedRegionIds ?? []), r.region_id]
                          : (prev.selectedRegionIds ?? []).filter((id) => id !== r.region_id),
                      }));
                    }}
                  />
                  <span className="form-check-label">{r.name} ({r.state_code})</span>
                </label>
              ))}
            </div>
          );
        }
        if (selected.size === 0) return <span className="text-muted small">All regions</span>;
        const names = regions.filter((r) => selected.has(r.region_id)).map((r) => `${r.name} (${r.state_code})`);
        return <span className="small text-truncate d-inline-block" style={{ maxWidth: 250 }} title={names.join(", ")}>{names.join(", ")}</span>;
      },
    },
   
  ], [editingId, editForm, regionSelections, regions]);

  const roofStyleActions = useMemo(() => [
    { key: "view-roof-style", label: "View", type: "secondary", icon: "eye", onClick: (r) => setViewRow(r) },

    { key: "edit-price", label: "Edit", type: "secondary", icon: "pen", visible: (r) => editingId !== r.matrix_price_id, onClick: (r) => handleStartEdit(r) },
    { key: "save-price", label: "Save", type: "primary", icon: "floppy-disk", visible: (r) => editingId === r.matrix_price_id, onClick: () => handleSave(), disabled: saving },
    { key: "cancel-price", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => editingId === r.matrix_price_id, onClick: () => handleCancel(), disabled: saving },
    { key: "delete-price", label: "Delete", type: "danger", icon: "trash", visible: (r) => editingId !== r.matrix_price_id, confirm: true, confirmMessage: (r) => `Delete roof style row "${roofStyleRowLabel(r)}"? This cannot be undone.`, onClick: (r) => handleDelete(r), disabled: saving },
  ], [editingId, saving, handleStartEdit, handleSave, handleCancel, handleDelete]);

  const filterConfig = useMemo(() => createFilterConfig([
    { key: "roof_stye", label: "Roof Style", type: TABLE_FILTER_TYPES.SELECT, options: ROOF_STYLE_OPTIONS.map((value) => ({ label: value, value })) },
    { key: "base_price", label: "Base Price", type: TABLE_FILTER_TYPES.TEXT },
  ]), []);

  return (
    <div>
      
      <TableZ
        columns={roofStyleColumns}
        data={prices}
        rowIdKey="matrix_price_id"
        actions={roofStyleActions}
        filterConfig={filterConfig}
        sort={{ key: "width", direction: "asc" }}
        defaultFiltersExpanded={false}
        stickyFilters
        filterToolbarAction={(
          <div className="d-flex align-items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onRefresh} title="Refresh">
              <FontAwesomeIcon icon={faSync} />
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}><FontAwesomeIcon icon={faPlus} /> Add Range</Button>
          </div>
        )}
        emptyMessage="No roof style pricing rows yet."
        hideSearch
      />
      <Modal title="Add Roof Style Price" show={addOpen} onHide={() => setAddOpen(false)} size="lg">
        <div className="row g-2 mb-3">
          <div className="col-3">
            <label className="form-label small mb-1">Roof Style *</label>
            <select className="form-select form-select-sm" value={addForm.roof_stye} onChange={(e) => setAddForm({ ...addForm, roof_stye: e.target.value })}>
              <option value="">Select…</option>
              {roofStyleOptions(addForm.roof_stye).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="col-3">
            <label className="form-label small mb-1">Base Price ($) *</label>
            <input className="form-control form-control-sm" value={addForm.base_price} onChange={(e) => setAddForm({ ...addForm, base_price: formatCurrencyInput(e.target.value) })} />
          </div>
          
        </div>
        <div className="row g-2 mb-3">
          <div className="col">
            <label className="form-label small mb-1">Min Width</label>
            <input type="number" className="form-control form-control-sm" value={addForm.width} onChange={(e) => setAddForm({ ...addForm, width: e.target.value.replace(/[^0-9]/g, "") })} />
          </div>
          <div className="col">
            <label className="form-label small mb-1">Max Width</label>
            <input type="number" className="form-control form-control-sm" value={addForm.width_max} onChange={(e) => setAddForm({ ...addForm, width_max: e.target.value.replace(/[^0-9]/g, "") })} />
          </div>
          <div className="col">
            <label className="form-label small mb-1">Min Length</label>
            <input type="number" className="form-control form-control-sm" value={addForm.length} onChange={(e) => setAddForm({ ...addForm, length: e.target.value.replace(/[^0-9]/g, "") })} />
          </div>          
          <div className="col">
            <label className="form-label small mb-1">Max Length</label>
            <input type="number" className="form-control form-control-sm" value={addForm.length_max} onChange={(e) => setAddForm({ ...addForm, length_max: e.target.value.replace(/[^0-9]/g, "") })} />
          </div>
        </div>
         <br/><br/>
        <div className="row g-2 mb-3">
        
          <div className="col-12">
            <label className="form-label small mb-1">Regions (optional — none = all regions)</label>
            <div className="d-flex flex-wrap gap-1">
              {regions.map((r) => (
                <label key={r.region_id} className="form-check form-check-inline mb-0 me-1" style={{ fontSize: "0.8rem" }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={addForm.selectedRegionIds.includes(r.region_id)}
                    onChange={(e) => {
                      setAddForm((prev) => ({
                        ...prev,
                        selectedRegionIds: e.target.checked
                          ? [...prev.selectedRegionIds, r.region_id]
                          : prev.selectedRegionIds.filter((id) => id !== r.region_id),
                      }));
                    }}
                  />
                  <span className="form-check-label">{r.name} ({r.state_code})</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="d-flex justify-content-end">
          <Button size="sm" onClick={handleAdd} loading={saving}>Add Price </Button>
        </div>
      </Modal>
      <RowViewModal
        show={Boolean(viewRow)}
        onHide={() => setViewRow(null)}
        title="Roof Style Price"
        fields={viewRow ? [
          { label: "Roof Style", value: viewRow.roof_stye ?? "—" },
          { label: "Width", value: `${viewRow.width ?? "—"} – ${viewRow.width_max ?? "—"}` },
          { label: "Length", value: `${viewRow.length ?? "—"} – ${viewRow.length_max ?? "—"}` },
          { label: "Base Price", value: formatCurrency(viewRow.base_price) },
          { label: "Regions", value: formatRegionNames(regions, regionSelections[viewRow.matrix_price_id] ?? originalRegionRef.current[String(viewRow.matrix_price_id)] ?? []), full: true },
        ] : []}
      />

    </div>
  );
}
// ─── MATRIX EDITOR ─────────────────────────────────────────

function legLengthRangeLabel(row) {
  const min = row?.min_length;
  const max = row?.max_length;
  const hasMin = min !== null && min !== undefined && min !== "";
  const hasMax = max !== null && max !== undefined && max !== "";
  if (!hasMin && !hasMax) return "—";
  if (!hasMax) return `≥ ${min} ft`;
  if (!hasMin) return `≤ ${max} ft`;
  return `${min} – ${max} ft`;
}

function legHeightRowLabel(row, legTypes) {
  const range = legLengthRangeLabel(row);
  const legType = legTypes.find((lt) => lt.leg_type_id === row?.leg_type_id)?.name ?? (row?.leg_type_id ?? "—");
  const h = row?.leg_height != null ? `${row.leg_height}'` : "—";
  return `${range} / ${legType} / ${h}`;
}

// LEG HEIGHT MATRIX EDITOR
function LegHeightMatrixEditor(props) {
  // Keep the table mounted so its filter/sort/pagination state survives
  // data refreshes (e.g. after adding a row).
  return <LegHeightMatrixTable {...props} />;
}

function LegHeightMatrixTable({ prices, legTypes, regions, onRefresh }) {
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [viewRow, setViewRow] = useState(null);

  const [addForm, setAddForm] = useState({ min_length: "", max_length: "", leg_type_id: "", leg_height: "", price: "", selectedRegionIds: [] });
  const [editForm, setEditForm] = useState({ min_length: "", max_length: "", leg_type_id: "", leg_height: "", price: "", selectedRegionIds: [] });

  // Region mappings (metal_m_region_legprice_matrix) keyed by leg_matrix_id
  const [regionSelections, setRegionSelections] = useState({});
  const originalRegionRef = useRef({});

  useEffect(() => {
    let cancelled = false;
    const realIds = prices
      .filter((p) => typeof p.leg_matrix_id === "number" && p.leg_matrix_id > 0)
      .map((p) => p.leg_matrix_id);
    if (realIds.length === 0) return;
    (async () => {
      try {
        const map = await bulkLoadRegionLegPriceMatrix(realIds);
        if (cancelled) return;
        originalRegionRef.current = { ...map };
        setRegionSelections((prev) => {
          const next = { ...prev };
          for (const [id, regionIds] of Object.entries(map)) {
            if (!next[id]) next[id] = [...regionIds];
          }
          return next;
        });
      } catch (err) { /* silently fail */ }
    })();
    return () => { cancelled = true; };
  }, [prices]);
  // ADD

  const handleAdd = useCallback(async () => {
    const price = parseFloat(parseCurrencyInput(addForm.price));
    if (isNaN(price) || price <= 0) { toastError("Price is required"); return; }
    if (!addForm.leg_type_id) { toastError("Leg Type is required"); return; }
    const minLength = addForm.min_length ? parseInt(addForm.min_length) : null;
    const maxLength = addForm.max_length ? parseInt(addForm.max_length) : null;
    if (minLength != null && maxLength != null && minLength > maxLength) { toastError("Max Length must be greater than or equal to Min Length"); return; }

    setSaving(true);
    try {
      const result = await upsertLegHeightPrice({
        leg_type_id: parseInt(addForm.leg_type_id),
        leg_height: addForm.leg_height ? parseInt(addForm.leg_height) : null,
        min_length: minLength,
        max_length: maxLength,
        price,
      });

      const realId = result?.leg_matrix_id;
      if (realId && addForm.selectedRegionIds.length > 0) {
        for (const regionId of addForm.selectedRegionIds) {
          await insertRegionLegPriceMatrix(regionId, realId);
        }
      }

      toastSuccess("Price added");
      setAddForm({ min_length: "", max_length: "", leg_type_id: "", leg_height: "", price: "", selectedRegionIds: [] });
      setAddOpen(false);
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [addForm, onRefresh]);

  // EDIT

  const handleStartEdit = useCallback((row) => {
    setEditingId(row.leg_matrix_id);
    const regIds = regionSelections[row.leg_matrix_id] ?? originalRegionRef.current[String(row.leg_matrix_id)] ?? [];
    setEditForm({
      min_length: row.min_length ?? "",
      max_length: row.max_length ?? "",
      leg_type_id: row.leg_type_id ?? "",
      leg_height: row.leg_height ?? "",
      price: row.price ?? "",
      selectedRegionIds: [...regIds],
    });
  }, [regionSelections]);

  const handleSave = useCallback(async () => {
    const price = parseFloat(parseCurrencyInput(editForm.price));
    if (isNaN(price) || price <= 0) { toastError("Price is required"); return; }
    if (!editForm.leg_type_id) { toastError("Leg Type is required"); return; }
    const minLength = editForm.min_length ? parseInt(editForm.min_length) : null;
    const maxLength = editForm.max_length ? parseInt(editForm.max_length) : null;
    if (minLength != null && maxLength != null && minLength > maxLength) { toastError("Max Length must be greater than or equal to Min Length"); return; }

    setSaving(true);
    try {
      await upsertLegHeightPrice({
        leg_matrix_id: editingId,
        leg_type_id: parseInt(editForm.leg_type_id),
        leg_height: editForm.leg_height ? parseInt(editForm.leg_height) : null,
        min_length: minLength,
        max_length: maxLength,
        price,
      });

      // Sync region mappings
      const currentRegions = new Set(editForm.selectedRegionIds);
      const originalRegions = new Set(originalRegionRef.current[String(editingId)] ?? []);
      for (const regionId of currentRegions) {
        if (!originalRegions.has(regionId)) {
          await insertRegionLegPriceMatrix(regionId, editingId);
        }
      }
      for (const regionId of originalRegions) {
        if (!currentRegions.has(regionId)) {
          await deleteRegionLegPriceMatrix(regionId, editingId);
        }
      }

      toastSuccess("Price updated");
      setEditingId(null);
      setEditForm({ min_length: "", max_length: "", leg_type_id: "", leg_height: "", price: "", selectedRegionIds: [] });
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [editForm, editingId, onRefresh]);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditForm({ min_length: "", max_length: "", leg_type_id: "", leg_height: "", price: "", selectedRegionIds: [] });
    setRegionSelections((prev) => {
      const original = originalRegionRef.current[String(editingId)];
      if (original) return { ...prev, [editingId]: [...original] };
      const next = { ...prev };
      delete next[editingId];
      return next;
    });
  }, [editingId]);

  // DELETE

  const handleDelete = useCallback(async (row) => {
    setSaving(true);
    try {
      await deleteLegHeightPrice(row.leg_matrix_id);
      toastSuccess("Price deleted");
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [onRefresh]);
  const legHeightColumns = useMemo(() => [
    {
      key: "length_range", label: "Length Range", width: 200, sortable: true,
      sortValue: (row) => `${row.min_length ?? 0}-${row.max_length ?? 0}`,
      render: (row) => editingId === row.leg_matrix_id
        ? (
          <div className="d-flex gap-1 align-items-center">
            <input type="number" className="form-control form-control-sm" style={{ width: 70 }} placeholder="Min" value={editForm.min_length} onChange={(e) => setEditForm((p) => ({ ...p, min_length: e.target.value.replace(/[^0-9]/g, "") }))} />
            <span className="text-muted small">–</span>
            <input type="number" className="form-control form-control-sm" style={{ width: 70 }} placeholder="Max" value={editForm.max_length} onChange={(e) => setEditForm((p) => ({ ...p, max_length: e.target.value.replace(/[^0-9]/g, "") }))} />
          </div>
        )
        : legLengthRangeLabel(row),
    },
    {
      key: "leg_type_id", label: "Leg Type", width: 160, sortable: true,
      sortValue: (row) => legTypes.find((lt) => lt.leg_type_id === row?.leg_type_id)?.name ?? "",
      render: (row) => editingId === row.leg_matrix_id
        ? (
          <select className="form-select form-select-sm" value={editForm.leg_type_id} onChange={(e) => setEditForm((p) => ({ ...p, leg_type_id: e.target.value }))}>
            <option value="">Select…</option>
            {legTypes.map((lt) => <option key={lt.leg_type_id} value={lt.leg_type_id}>{lt.name}</option>)}
          </select>
        )
        : (legTypes.find((lt) => lt.leg_type_id === row?.leg_type_id)?.name ?? row?.leg_type_id ?? "—"),
    },
    {
      key: "leg_height", label: "Leg Height", width: 110, sortable: true,
      sortValue: (row) => row.leg_height ?? 0,
      render: (row) => editingId === row.leg_matrix_id
        ? (
          <div className="d-flex gap-1 align-items-center">
            <input type="number" className="form-control form-control-sm" style={{ width: 60 }} placeholder="ft" value={editForm.leg_height} onChange={(e) => setEditForm((p) => ({ ...p, leg_height: e.target.value.replace(/[^0-9]/g, "") }))} />
            <span>&apos;</span>
          </div>
        )
        : (row.leg_height != null ? `${row.leg_height}'` : "—"),
    },
    {
      key: "price", label: "Price", width: 130, sortable: true,
      render: (row) => editingId === row.leg_matrix_id
        ? <input className="form-control form-control-sm" value={formatCurrencyInput(editForm.price)} onChange={(e) => setEditForm((p) => ({ ...p, price: parseCurrencyInput(e.target.value) }))} />
        : formatCurrency(row.price),
    },
    {
      key: "regions", label: "Regions", width: 260, sortable: false,
      render: (row) => {
        const rowId = row.leg_matrix_id;
        const isEditing = editingId === rowId;
        const selected = new Set(isEditing ? (editForm.selectedRegionIds ?? []) : (regionSelections[rowId] ?? originalRegionRef.current[String(rowId)] ?? []));
        if (isEditing) {
          return (
            <div className="d-flex flex-wrap gap-1" style={{ maxWidth: 260 }}>
              {regions.map((r) => (
                <label key={r.region_id} className="form-check form-check-inline mb-0 me-1" style={{ fontSize: "0.8rem" }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={selected.has(r.region_id)}
                    onChange={(e) => {
                      setEditForm((prev) => ({
                        ...prev,
                        selectedRegionIds: e.target.checked
                          ? [...(prev.selectedRegionIds ?? []), r.region_id]
                          : (prev.selectedRegionIds ?? []).filter((id) => id !== r.region_id),
                      }));
                    }}
                  />
                  <span className="form-check-label">{r.name} ({r.state_code})</span>
                </label>
              ))}
            </div>
          );
        }
        if (selected.size === 0) return <span className="text-muted small">All regions</span>;
        const names = regions.filter((r) => selected.has(r.region_id)).map((r) => `${r.name} (${r.state_code})`);
        return <span className="small text-truncate d-inline-block" style={{ maxWidth: 250 }} title={names.join(", ")}>{names.join(", ")}</span>;
      },
    },
  ], [editingId, editForm, legTypes, regionSelections, regions]);

  const legHeightActions = useMemo(() => [
    { key: "view-leg-height", label: "View", type: "secondary", icon: "eye", onClick: (r) => setViewRow(r) },

    { key: "edit-price", label: "Edit", type: "secondary", icon: "pen", visible: (r) => editingId !== r.leg_matrix_id, onClick: (r) => handleStartEdit(r) },
    { key: "save-price", label: "Save", type: "primary", icon: "floppy-disk", visible: (r) => editingId === r.leg_matrix_id, onClick: () => handleSave(), disabled: saving },
    { key: "cancel-price", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => editingId === r.leg_matrix_id, onClick: () => handleCancel(), disabled: saving },
    { key: "delete-price", label: "Delete", type: "danger", icon: "trash", visible: (r) => editingId !== r.leg_matrix_id, confirm: true, confirmMessage: (r) => `Delete leg height row "${legHeightRowLabel(r, legTypes)}"? This cannot be undone.`, onClick: (r) => handleDelete(r), disabled: saving },
  ], [editingId, saving, handleStartEdit, handleSave, handleCancel, handleDelete, legTypes]);

  const legHeightFilterConfig = useMemo(() => createFilterConfig([
    { key: "min_length", label: "Min Length", type: TABLE_FILTER_TYPES.TEXT },
    { key: "max_length", label: "Max Length", type: TABLE_FILTER_TYPES.TEXT },
    { key: "leg_type_id", label: "Leg Type", type: TABLE_FILTER_TYPES.SELECT, options: legTypes.map((lt) => ({ label: lt.name, value: String(lt.leg_type_id) })) },
    { key: "leg_height", label: "Leg Height", type: TABLE_FILTER_TYPES.TEXT },
    { key: "price", label: "Price", type: TABLE_FILTER_TYPES.TEXT },
  ]), [legTypes]);
return (
    <div>

      <div className="mb-3 psb-hide-search">
        <TableZ
          variant="setup"
          columns={legHeightColumns}
          data={prices}
          rowIdKey="leg_matrix_id"
          actions={legHeightActions}
          filterConfig={legHeightFilterConfig}
          sort={{ key: "length_range", direction: "asc" }}
          defaultFiltersExpanded={false}
          stickyFilters
          filterToolbarAction={(
            <div className="d-flex align-items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onRefresh} title="Refresh">
                <FontAwesomeIcon icon={faSync} />
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}><FontAwesomeIcon icon={faPlus} /> Add Leg Height Price</Button>
            </div>
          )}
          emptyMessage="No leg height pricing rows yet."
        />
      </div>
      <Modal title="Add Leg Height Price" show={addOpen} onHide={() => setAddOpen(false)} size="lg">
        <div className="row g-2 mb-3">
          <div className="col-4">
            <label className="form-label small mb-1">Length Range (ft)</label>
            <div className="d-flex gap-1 align-items-center">
              <input type="number" className="form-control form-control-sm" placeholder="Min" value={addForm.min_length} onChange={(e) => setAddForm({ ...addForm, min_length: e.target.value.replace(/[^0-9]/g, "") })} />
              <span className="text-muted small">–</span>
              <input type="number" className="form-control form-control-sm" placeholder="Max" value={addForm.max_length} onChange={(e) => setAddForm({ ...addForm, max_length: e.target.value.replace(/[^0-9]/g, "") })} />
            </div>
          </div>
          <div className="col-4">
            <label className="form-label small mb-1">Leg Type *</label>
            <select className="form-select form-select-sm" value={addForm.leg_type_id} onChange={(e) => setAddForm({ ...addForm, leg_type_id: e.target.value })}>
              <option value="">Select…</option>
              {legTypes.map((lt) => <option key={lt.leg_type_id} value={lt.leg_type_id}>{lt.name}</option>)}
            </select>
          </div>
          <div className="col-2">
            <label className="form-label small mb-1">Leg Height (ft)</label>
            <input type="number" className="form-control form-control-sm" value={addForm.leg_height} onChange={(e) => setAddForm({ ...addForm, leg_height: e.target.value.replace(/[^0-9]/g, "") })} />
          </div>
          <div className="col-2">
            <label className="form-label small mb-1">Price ($) *</label>
            <input className="form-control form-control-sm" value={addForm.price} onChange={(e) => setAddForm({ ...addForm, price: formatCurrencyInput(e.target.value) })} />
          </div>
        </div>
        <div className="row g-2 mb-3">
          <div className="col-12">
            <label className="form-label small mb-1">Regions (optional — none = all regions)</label>
            <div className="d-flex flex-wrap gap-1">
              {regions.map((r) => (
                <label key={r.region_id} className="form-check form-check-inline mb-0 me-1" style={{ fontSize: "0.8rem" }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={addForm.selectedRegionIds.includes(r.region_id)}
                    onChange={(e) => {
                      setAddForm((prev) => ({
                        ...prev,
                        selectedRegionIds: e.target.checked
                          ? [...prev.selectedRegionIds, r.region_id]
                          : prev.selectedRegionIds.filter((id) => id !== r.region_id),
                      }));
                    }}
                  />
                  <span className="form-check-label">{r.name} ({r.state_code})</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="d-flex justify-content-end">
          <Button size="sm" onClick={handleAdd} loading={saving}>Add</Button>
        </div>
      </Modal>
      <RowViewModal
        show={Boolean(viewRow)}
        onHide={() => setViewRow(null)}
        title="Leg Height Price"
        fields={viewRow ? [
          { label: "Length Range", value: legLengthRangeLabel(viewRow) },
          { label: "Leg Type", value: legTypes.find((lt) => lt.leg_type_id === viewRow.leg_type_id)?.name ?? viewRow.leg_type_id ?? "—" },
          { label: "Leg Height", value: viewRow.leg_height != null ? `${viewRow.leg_height}'` : "—" },
          { label: "Price", value: formatCurrency(viewRow.price) },
          { label: "Regions", value: formatRegionNames(regions, regionSelections[viewRow.leg_matrix_id] ?? originalRegionRef.current[String(viewRow.leg_matrix_id)] ?? []), full: true },
        ] : []}
      />

    </div>
  );
}
function MatrixEditor(props) {
  // Remount the editor whenever the underlying prices change (e.g. after a
  // batch save triggers onRefresh), so local draft rows reset to the server data.
  return <MatrixTable key={props.prices || "empty"} {...props} />;
}

function MatrixTable({ featureId, prices, styles, regions, onRefresh }) {
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [viewRow, setViewRow] = useState(null);

  const [addForm, setAddForm] = useState({ style_id: styles.find((s) => s.render_key === "rib_type")?.style_id ?? styles[0]?.style_id ?? "", width: "", length: "", height: "", base_price: "", leg_height_price: "", enclosed_sides_price: "", enclosed_ends_price: "", selectedRegionIds: [] });
  const [editForm, setEditForm] = useState({ style_id: "", width: "", length: "", height: "", base_price: "", leg_height_price: "", enclosed_sides_price: "", enclosed_ends_price: "", selectedRegionIds: [] });

  // ─── Region mappings ──────────────────────────────────────
  // { [matrix_price_id]: region_id[] } — tracks assigned regions per row
  const [regionSelections, setRegionSelections] = useState({});
  const originalRegionRef = useRef({});

  // Load existing region mappings on mount / when prices change
  useEffect(() => {
    let cancelled = false;
    const realIds = prices
      .filter((p) => typeof p.matrix_price_id === "number" && p.matrix_price_id > 0)
      .map((p) => p.matrix_price_id);
    if (realIds.length === 0) return;
    (async () => {
      try {
        const map = await bulkLoadRegionPriceMatrix(realIds);
        if (cancelled) return;
        originalRegionRef.current = { ...map };
        setRegionSelections((prev) => {
          const next = { ...prev };
          for (const [id, regionIds] of Object.entries(map)) {
            // Only set if not already tracking (preserve edits in progress)
            if (!next[id]) next[id] = [...regionIds];
          }
          return next;
        });
      } catch (err) { /* silently fail */ }
    })();
    return () => { cancelled = true; };
  }, [prices]);

  // ─── ADD ───────────────────────────────────────────────────

  const handleAdd = useCallback(async () => {
    const base_price = parseFloat(parseCurrencyInput(addForm.base_price));
    if (isNaN(base_price) || base_price <= 0) { toastError("Base Price is required"); return; }
    if (!addForm.style_id) { toastError("Style is required"); return; }

    setSaving(true);
    try {
      const styleId = parseInt(addForm.style_id);
      const result = await upsertMatrixPrice({
        feature_id: featureId,
        style_id: styleId,
        width: addForm.width ? parseInt(addForm.width) : null,
        length: addForm.length ? parseInt(addForm.length) : null,
        height: addForm.height ? parseInt(addForm.height) : null,
        base_price,
        leg_height_price: parseFloat(parseCurrencyInput(addForm.leg_height_price)) || 0,
        enclosed_sides_price: parseFloat(parseCurrencyInput(addForm.enclosed_sides_price)) || 0,
        enclosed_ends_price: parseFloat(parseCurrencyInput(addForm.enclosed_ends_price)) || 0,
      });

      const realId = result?.matrix_price_id;
      if (realId && addForm.selectedRegionIds.length > 0) {
        for (const regionId of addForm.selectedRegionIds) {
          await insertRegionPriceMatrix(regionId, realId);
        }
      }

      toastSuccess("Price added");
      setAddForm({ style_id: styles.find((s) => s.render_key === "rib_type")?.style_id ?? styles[0]?.style_id ?? "", width: "", length: "", height: "", base_price: "", leg_height_price: "", enclosed_sides_price: "", enclosed_ends_price: "", selectedRegionIds: [] });
      setAddOpen(false);
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [addForm, featureId, styles, onRefresh]);

  // ─── EDIT ───────────────────────────────────────────────────

  const handleStartEdit = useCallback((row) => {
    setEditingId(row.matrix_price_id);
    const regIds = regionSelections[row.matrix_price_id] ?? originalRegionRef.current[String(row.matrix_price_id)] ?? [];
    setEditForm({
      style_id: row.style_id ?? "",
      width: row.width ?? "",
      length: row.length ?? "",
      height: row.height ?? "",
      base_price: row.base_price ?? "",
      leg_height_price: row.leg_height_price ?? "",
      enclosed_sides_price: row.enclosed_sides_price ?? "",
      enclosed_ends_price: row.enclosed_ends_price ?? "",
      selectedRegionIds: [...regIds],
    });
  }, [regionSelections]);

  const handleSave = useCallback(async () => {
    const base_price = parseFloat(parseCurrencyInput(editForm.base_price));
    if (isNaN(base_price) || base_price <= 0) { toastError("Base Price is required"); return; }
    if (!editForm.style_id) { toastError("Style is required"); return; }

    setSaving(true);
    try {
      await upsertMatrixPrice({
        matrix_price_id: editingId,
        feature_id: featureId,
        style_id: parseInt(editForm.style_id),
        width: editForm.width ? parseInt(editForm.width) : null,
        length: editForm.length ? parseInt(editForm.length) : null,
        height: editForm.height ? parseInt(editForm.height) : null,
        base_price,
        leg_height_price: parseFloat(parseCurrencyInput(editForm.leg_height_price)) || 0,
        enclosed_sides_price: parseFloat(parseCurrencyInput(editForm.enclosed_sides_price)) || 0,
        enclosed_ends_price: parseFloat(parseCurrencyInput(editForm.enclosed_ends_price)) || 0,
      });

      // Sync region mappings
      const currentRegions = new Set(editForm.selectedRegionIds);
      const originalRegions = new Set(originalRegionRef.current[String(editingId)] ?? []);
      for (const regionId of currentRegions) {
        if (!originalRegions.has(regionId)) {
          await insertRegionPriceMatrix(regionId, editingId);
        }
      }
      for (const regionId of originalRegions) {
        if (!currentRegions.has(regionId)) {
          await deleteRegionPriceMatrix(regionId, editingId);
        }
      }

      toastSuccess("Price updated");
      setEditingId(null);
      setEditForm({ style_id: "", width: "", length: "", height: "", base_price: "", leg_height_price: "", enclosed_sides_price: "", enclosed_ends_price: "", selectedRegionIds: [] });
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [editForm, editingId, featureId, onRefresh]);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditForm({ style_id: "", width: "", length: "", height: "", base_price: "", leg_height_price: "", enclosed_sides_price: "", enclosed_ends_price: "", selectedRegionIds: [] });
    setRegionSelections((prev) => {
      const original = originalRegionRef.current[String(editingId)];
      if (original) return { ...prev, [editingId]: [...original] };
      const next = { ...prev };
      delete next[editingId];
      return next;
    });
  }, [editingId]);

  // ─── DELETE ───────────────────────────────────────────────

  const handleDelete = useCallback(async (row) => {
    setSaving(true);
    try {
      await deleteMatrixPrice(row.matrix_price_id);
      toastSuccess("Price deleted");
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [onRefresh]);

  const matrixColumns = useMemo(() => [
    {
      key: "style_name", label: "Style", width: 160, sortable: true,
      render: (row) => editingId === row.matrix_price_id
        ? <select className="form-select form-select-sm" value={editForm.style_id} onChange={(e) => setEditForm((p) => ({ ...p, style_id: e.target.value }))}>
            <option value="">—</option>
            {styles.map((s) => <option key={s.style_id} value={s.style_id}>{s.name}</option>)}
          </select>
        : row.style_name,
    },
    {
      key: "size", label: "Size (WxL)", width: 200, sortable: true,
      sortValue: (row) => `${row.width ?? 0}-${row.length ?? 0}`,
      render: (row) => editingId === row.matrix_price_id
        ? <div className="d-flex gap-1 align-items-center">
            <input type="number" className="form-control form-control-sm" style={{ width: 55 }} placeholder="W" value={editForm.width} onChange={(e) => setEditForm((p) => ({ ...p, width: e.target.value.replace(/[^0-9]/g, "") }))} />
            <span>x</span>
            <input type="number" className="form-control form-control-sm" style={{ width: 55 }} placeholder="L" value={editForm.length} onChange={(e) => setEditForm((p) => ({ ...p, length: e.target.value.replace(/[^0-9]/g, "") }))} />
          </div>
        : `${row.width ?? "-"} x ${row.length ?? "-"}`,
    },
    {
      key: "base_price", label: "Base Price", width: 130, sortable: true,
      render: (row) => editingId === row.matrix_price_id
        ? <input className="form-control form-control-sm" value={formatCurrencyInput(editForm.base_price)} onChange={(e) => setEditForm((p) => ({ ...p, base_price: parseCurrencyInput(e.target.value) }))} />
        : formatCurrency(row.base_price),
    },
    {
      key: "regions", label: "Regions", width: 260, sortable: false,
      render: (row) => {
        const rowId = row.matrix_price_id;
        const isEditing = editingId === rowId;
        const selected = new Set(isEditing ? (editForm.selectedRegionIds ?? []) : (regionSelections[rowId] ?? []));

        if (isEditing) {
          return (
            <div className="d-flex flex-wrap gap-1" style={{ maxWidth: 250 }}>
              {regions.map((r) => (
                <label key={r.region_id} className="form-check form-check-inline mb-0 me-1" style={{ fontSize: "0.75rem" }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    style={{ marginTop: "0.15rem" }}
                    checked={selected.has(r.region_id)}
                    onChange={(e) => {
                      setEditForm((p) => ({
                        ...p,
                        selectedRegionIds: e.target.checked
                          ? [...(p.selectedRegionIds ?? []), r.region_id]
                          : (p.selectedRegionIds ?? []).filter((id) => id !== r.region_id),
                      }));
                    }}
                  />
                  <span className="form-check-label">{r.state_code}</span>
                </label>
              ))}
            </div>
          );
        }

        if (selected.size === 0) return <span className="text-muted small">All regions</span>;
        return (
          <div className="d-flex flex-wrap gap-1">
            {[...selected].map((rid) => {
              const reg = regions.find((r) => r.region_id === rid);
              return <Badge key={rid} variant="info" className="small">{reg?.state_code ?? rid}</Badge>;
            })}
          </div>
        );
      },
    },
  ], [editingId, editForm, styles, regions, regionSelections]);

  const matrixActions = useMemo(() => [
    { key: "view-matrix", label: "View", type: "secondary", icon: "eye", onClick: (r) => setViewRow(r) },

    { key: "edit-price", label: "Edit", type: "secondary", icon: "pen", visible: (r) => editingId !== r.matrix_price_id, onClick: (r) => handleStartEdit(r) },
    { key: "save-price", label: "Save", type: "primary", icon: "floppy-disk", visible: (r) => editingId === r.matrix_price_id, onClick: () => handleSave(), disabled: saving },
    { key: "cancel-price", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => editingId === r.matrix_price_id, onClick: () => handleCancel(), disabled: saving },
    { key: "delete-price", label: "Delete", type: "danger", icon: "trash", visible: (r) => editingId !== r.matrix_price_id, confirm: true, confirmMessage: (r) => `Delete price row (${r.style_name} ${r.width ?? "\u2014"} x ${r.length ?? "\u2014"})?`, onClick: (r) => handleDelete(r), disabled: saving },
  ], [editingId, saving, handleStartEdit, handleSave, handleCancel, handleDelete]);

  const styleFilterOptions = useMemo(() => styles.map((s) => ({ label: s.name, value: s.name })), [styles]);

  const matrixFilterConfig = useMemo(() => createFilterConfig([
    { key: "style_name", label: "Style", type: TABLE_FILTER_TYPES.SELECT, options: styleFilterOptions },
    { key: "size", label: "Size", type: TABLE_FILTER_TYPES.TEXT },
    { key: "base_price", label: "Base Price", type: TABLE_FILTER_TYPES.TEXT },
  ]), [styleFilterOptions]);

  return (
    <div>
    
      <div className="mb-3 psb-hide-search">
        <TableZ
          columns={matrixColumns}
          data={prices}
          rowIdKey="matrix_price_id"
          actions={matrixActions}
          emptyMessage="No matrix prices found."
          filterConfig={matrixFilterConfig}
          defaultFiltersExpanded={false}
          stickyFilters
          filterToolbarAction={(
            <div className="d-flex align-items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onRefresh} title="Refresh">
                <FontAwesomeIcon icon={faSync} />
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <FontAwesomeIcon icon={faPlus} /> Base Structure Price
              </Button>
            </div>
          )}
        />
      </div>
      <Modal title="Add Base Price" show={addOpen} onHide={() => setAddOpen(false)} size="lg">
          <div className="row g-2 mb-2">
            <div className="col-3">
              <label className="form-label small mb-1">Style *</label>
              <select className="form-select form-select-sm" value={addForm.style_id} onChange={(e) => setAddForm({ ...addForm, style_id: e.target.value })}>
                {styles.map((s) => <option key={s.style_id} value={s.style_id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col">
              <label className="form-label small mb-1">Width</label>
              <input type="number" className="form-control form-control-sm" value={addForm.width} onChange={(e) => setAddForm({ ...addForm, width: e.target.value.replace(/[^0-9]/g, "") })} />
            </div>
            <div className="col">
              <label className="form-label small mb-1">Length</label>
              <input type="number" className="form-control form-control-sm" value={addForm.length} onChange={(e) => setAddForm({ ...addForm, length: e.target.value.replace(/[^0-9]/g, "") })} />
            </div>
            <div className="col-3">
              <label className="form-label small mb-1">Base Price ($) *</label>
              <input className="form-control form-control-sm" value={addForm.base_price} onChange={(e) => setAddForm({ ...addForm, base_price: formatCurrencyInput(e.target.value) })} />
            </div>
          </div>
          <br/>
          <div className="row g-2 mb-3">
            <div className="col-12">
              <label className="form-label small mb-1">Regions</label>
              <div className="d-flex flex-wrap gap-1">
                {regions.map((r) => (
                  <label key={r.region_id} className="form-check form-check-inline mb-0 me-1" style={{ fontSize: "0.8rem" }}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={addForm.selectedRegionIds.includes(r.region_id)}
                      onChange={(e) => {
                        setAddForm((prev) => ({
                          ...prev,
                          selectedRegionIds: e.target.checked
                            ? [...prev.selectedRegionIds, r.region_id]
                            : prev.selectedRegionIds.filter((id) => id !== r.region_id),
                        }));
                      }}
                    />
                    <span className="form-check-label">{r.state_code}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="d-flex justify-content-end">
            <Button size="sm" onClick={handleAdd} loading={saving}>Add</Button>
          </div>
      </Modal>
      <RowViewModal
        show={Boolean(viewRow)}
        onHide={() => setViewRow(null)}
        title="Base Structure Price"
        fields={viewRow ? [
          { label: "Style", value: viewRow.style_name ?? "—" },
          { label: "Size (WxL)", value: `${viewRow.width ?? "—"} x ${viewRow.length ?? "—"}` },
          { label: "Base Price", value: formatCurrency(viewRow.base_price) },
          { label: "Regions", value: formatRegionNames(regions, regionSelections[viewRow.matrix_price_id] ?? originalRegionRef.current[String(viewRow.matrix_price_id)] ?? []), full: true },
        ] : []}
      />

    </div>
  );
}

// ─── RATE EDITOR ───────────────────────────────────────────

function RateEditor({ featureId, rate, onRefresh }) {
  const [rateVal, setRateVal] = useState(rate?.rate ?? "");
  const [unit, setUnit] = useState(rate?.unit ?? "sqft");

  const handleSave = async () => {
    const parsed = parseFloat(rateVal);
    if (isNaN(parsed) || parsed <= 0) { toastError("Rate must be > 0"); return; }
    try {
      await upsertRate({ rate_id: rate?.rate_id ?? null, feature_id: featureId, rate: parsed, unit });
      toastSuccess("Rate saved");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  };

  return (
    <div>
      <h6>Rate Pricing</h6>
      <div className="d-flex gap-2 align-items-end">
        <Button size="sm" variant="ghost" onClick={onRefresh} title="Refresh">
          <FontAwesomeIcon icon={faSync} />
        </Button>
        <div>
          <label className="form-label small">Rate ($)</label>
          <input className="form-control form-control-sm" style={{ width: 100 }} value={rateVal} onChange={(e) => setRateVal(e.target.value)} />
        </div>
        <div>
          <label className="form-label small">Unit</label>
          <select className="form-select form-select-sm" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="sqft">sq ft</option>
            <option value="linearft">linear ft</option>
            <option value="each">each</option>
          </select>
        </div>
        <Button size="sm" onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
}

// ─── OPTIONS EDITOR ────────────────────────────────────────

const EMPTY_OPTION_FORM = {
  name: "",
  price: "",
  multiplier: "",
  min_width: "",
  max_width: "",
  min_length: "",
  max_length: "",
  min_height: "",
  max_height: "",
};

const OPTION_DIMENSION_COLUMNS = [
  { key: "min_width", label: "Min Width" },
  { key: "max_width", label: "Max Width" },
  { key: "min_length", label: "Min Length" },
  { key: "max_length", label: "Max Length" },
  { key: "min_height", label: "Min Height" },
  { key: "max_height", label: "Max Height" },
];

const OPTION_DIMENSION_GROUPS = [
  { key: "width", label: "Width", min: "min_width", max: "max_width" },
  { key: "length", label: "Length", min: "min_length", max: "max_length" },
  { key: "height", label: "Height", min: "min_height", max: "max_height" },
];

function formatRange(min, max) {
  const hasMin = min !== null && min !== undefined && min !== "";
  const hasMax = max !== null && max !== undefined && max !== "";
  if (!hasMin && !hasMax) return "—";
  if (hasMin && hasMax) return `${min} – ${max}`;
  return hasMin ? `${min}` : `${max}`;
}

function parseIntOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function optionDimensionFields(row) {
  return {
    min_width: row.min_width ?? "",
    max_width: row.max_width ?? "",
    min_length: row.min_length ?? "",
    max_length: row.max_length ?? "",
    min_height: row.min_height ?? "",
    max_height: row.max_height ?? "",
  };
}

function optionDimensionPayload(form, keys) {
  const payload = {};
  for (const key of keys) payload[key] = parseIntOrNull(form[key]);
  return payload;
}

function OptionsEditor({ featureId, options, onRefresh, isMultiplier = false, allowedDimensions = null }) {
  const pricingKey = isMultiplier ? "multiplier" : "price";
  const dimensionGroups = useMemo(() => {
    const keys = allowedDimensions ?? (isMultiplier ? ["width"] : ["width", "length", "height"]);
    return OPTION_DIMENSION_GROUPS.filter((g) => keys.includes(g.key));
  }, [isMultiplier, allowedDimensions]);
  const dimensionColumns = useMemo(() => {
    const keys = allowedDimensions ?? (isMultiplier ? ["width"] : ["width", "length", "height"]);
    const allowed = new Set();
    for (const key of keys) {
      const g = OPTION_DIMENSION_GROUPS.find((x) => x.key === key);
      if (g) { allowed.add(g.min); allowed.add(g.max); }
    }
    return OPTION_DIMENSION_COLUMNS.filter((c) => allowed.has(c.key));
  }, [isMultiplier, allowedDimensions]);
  const dimensionKeys = useMemo(() => dimensionColumns.map((c) => c.key), [dimensionColumns]);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_OPTION_FORM });
  const [addOpen, setAddOpen] = useState(false);
  const [viewRow, setViewRow] = useState(null);

  const [addForm, setAddForm] = useState({ ...EMPTY_OPTION_FORM });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!addForm.name.trim()) { toastError("Option name required"); return; }
    const value = parseFloat(addForm[pricingKey]);
    if (isNaN(value)) { toastError(isMultiplier ? "Multiplier required" : "Price required"); return; }
    setSaving(true);
    try {
      await upsertOption({ feature_id: featureId, name: addForm.name.trim(), [pricingKey]: value, ...optionDimensionPayload(addForm, dimensionKeys) });
      setAddForm({ ...EMPTY_OPTION_FORM });
      setAddOpen(false);
      toastSuccess("Option added");
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  };

  const handleStartEdit = useCallback((row) => {
    setEditingId(row.option_id);
    setEditForm({ name: row.name ?? "", price: row.price ?? "", multiplier: row.multiplier ?? "", ...optionDimensionFields(row) });
  }, []);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditForm({ ...EMPTY_OPTION_FORM });
  }, []);

  const handleSave = useCallback(async () => {
    if (!editForm.name.trim()) { toastError("Option name required"); return; }
    const value = parseFloat(editForm[pricingKey]);
    if (isNaN(value)) { toastError(isMultiplier ? "Multiplier required" : "Price required"); return; }
    try {
      await upsertOption({ option_id: editingId, feature_id: featureId, name: editForm.name.trim(), [pricingKey]: value, ...optionDimensionPayload(editForm, dimensionKeys) });
      setEditingId(null);
      setEditForm({ ...EMPTY_OPTION_FORM });
      toastSuccess("Option updated");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  }, [editingId, editForm, featureId, onRefresh, pricingKey, isMultiplier, dimensionKeys]);

  const handleDelete = useCallback(async (row) => {
    try {
      await deleteOption(row.option_id);
      toastSuccess("Option removed");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  }, [onRefresh]);

  const optionsColumns = useMemo(() => [
    {
      key: "name", label: "Option Name", width: 250, sortable: true,
      render: (row) => editingId === row.option_id
        ? <input className="form-control form-control-sm" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
        : row.name,
    },
    {
      key: pricingKey, label: isMultiplier ? "Multiplier" : "Price", width: 140, sortable: true,
      render: (row) => editingId === row.option_id
        ? <input className="form-control form-control-sm" value={editForm[pricingKey] ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, [pricingKey]: e.target.value }))} />
        : (isMultiplier ? (row.multiplier ?? "—") : formatCurrency(row.price)),
    },
    ...dimensionGroups.map((g) => ({
      key: g.key, label: g.label, width: 130, sortable: true,
      sortValue: (row) => `${row[g.min] ?? ""}-${row[g.max] ?? ""}`,
      render: (row) => editingId === row.option_id
        ? (
          <div className="d-flex align-items-center gap-1">
            <input type="number" className="form-control form-control-sm" placeholder="Min" style={{ width: 58 }}
              value={editForm[g.min] ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, [g.min]: e.target.value }))} />
            <span>–</span>
            <input type="number" className="form-control form-control-sm" placeholder="Max" style={{ width: 58 }}
              value={editForm[g.max] ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, [g.max]: e.target.value }))} />
          </div>
        )
        : formatRange(row[g.min], row[g.max]),
    })),
  ], [editingId, editForm, pricingKey, isMultiplier, dimensionGroups]);

  const optionsActions = useMemo(() => [
    { key: "view-option", label: "View", type: "secondary", icon: "eye", onClick: (r) => setViewRow(r) },

    { key: "edit-option", label: "Edit", type: "secondary", icon: "pen", visible: (r) => editingId !== r.option_id, onClick: (r) => handleStartEdit(r) },
    { key: "save-option", label: "Save", type: "primary", icon: "floppy-disk", visible: (r) => editingId === r.option_id, onClick: () => handleSave() },
    { key: "cancel-option", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => editingId === r.option_id, onClick: () => handleCancel() },
    { key: "delete-option", label: "Delete", type: "danger", icon: "trash", visible: (r) => editingId !== r.option_id, confirm: true, confirmMessage: (r) => `Delete option "${r.name}"?`, onClick: (r) => handleDelete(r) },
  ], [editingId, handleStartEdit, handleSave, handleCancel, handleDelete]);

  const optionsFilterConfig = useMemo(() => createFilterConfig([
    { key: "name", label: "Option Name", type: TABLE_FILTER_TYPES.TEXT },
    { key: pricingKey, label: isMultiplier ? "Multiplier" : "Price", type: TABLE_FILTER_TYPES.TEXT },
    ...dimensionColumns.map((d) => ({ key: d.key, label: d.label, type: TABLE_FILTER_TYPES.TEXT })),
  ]), [pricingKey, isMultiplier, dimensionColumns]);

  return (
    <div>
     <div className="mb-3 psb-hide-search">
        <TableZ
          columns={optionsColumns}
          data={options}
          rowIdKey="option_id"
          actions={optionsActions}
          emptyMessage="No options found."
          filterConfig={optionsFilterConfig}
          defaultFiltersExpanded={false}
          stickyFilters
          filterToolbarAction={(
            <div className="d-flex align-items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onRefresh} title="Refresh">
                <FontAwesomeIcon icon={faSync} />
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <FontAwesomeIcon icon={faPlus} /> Option
              </Button>
            </div>
          )}
        />
      </div>
      <Modal title="Add Option" show={addOpen} onHide={() => setAddOpen(false)} footer={<Button size="sm" onClick={handleAdd} loading={saving}>Add</Button>}>
        <div className="d-flex gap-2 align-items-end flex-wrap">
          <div style={{ flex: 2, minWidth: 180 }}>
            <label className="form-label small mb-1">Option Name *</label>
            <input className="form-control form-control-sm" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label className="form-label small mb-1">{isMultiplier ? "Multiplier" : "Price ($)"} *</label>
            <input className="form-control form-control-sm" value={addForm[pricingKey]} onChange={(e) => setAddForm({ ...addForm, [pricingKey]: e.target.value })} />
          </div>
        </div>
        <div className="row g-2 mt-2">
          {dimensionGroups.map((g) => (
            <div key={g.key} className="col-6">
              <label className="form-label small mb-1">{g.label}</label>
              <div className="d-flex align-items-center gap-1">
                <input type="number" className="form-control form-control-sm" placeholder="Min" value={addForm[g.min] ?? ""} onChange={(e) => setAddForm({ ...addForm, [g.min]: e.target.value })} />
                <span>–</span>
                <input type="number" className="form-control form-control-sm" placeholder="Max" value={addForm[g.max] ?? ""} onChange={(e) => setAddForm({ ...addForm, [g.max]: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
      </Modal>
      <RowViewModal
        show={Boolean(viewRow)}
        onHide={() => setViewRow(null)}
        title="Option"
        fields={viewRow ? [
          { label: "Option Name", value: viewRow.name ?? "—" },
          { label: isMultiplier ? "Multiplier" : "Price", value: isMultiplier ? (viewRow.multiplier ?? "—") : formatCurrency(viewRow.price) },
          ...dimensionColumns.map((d) => ({ label: d.label, value: viewRow[d.key] ?? "—" })),
        ] : []}
      />

    </div>
  );
}

// ─── PANEL EDITOR ──────────────────────────────────────────

function panelTypeLabel(pt) {
  const name = pt?.panel_name ?? "";
  return pt?.location_type ? `${name} (${pt.location_type})` : name;
}

function panelPricingRowLabel(row, panelTypes) {
  const found = panelTypes.find((pt) => pt.panel_type_id === row?.panel_type_id);
  const type = found ? panelTypeLabel(found) : (row?.panel_type_id ?? "—");
  const size = (row?.width != null && row?.height != null) ? `${row.width} x ${row.height}` : "—";
  return `${type} / ${size}`;
}

function PanelEditor({ featureId, panelPricing, regions, onRefresh }) {
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [viewRow, setViewRow] = useState(null);

  const [panelTypes, setPanelTypes] = useState([]);
  const [addForm, setAddForm] = useState({ panel_type_id: "", width: "", height: "", price: "", siding_style: "", selectedRegionIds: [] });
  const [editForm, setEditForm] = useState({ panel_type_id: "", width: "", height: "", price: "", siding_style: "", selectedRegionIds: [] });

  // Panel types (dropdown options; mapped from metal_s_panel_type)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const types = await loadPanelTypes();
        if (!cancelled) setPanelTypes(types ?? []);
      } catch (err) { /* silently fail */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Region mappings (metal_m_region_panelprice_matrix) keyed by panel_pricing_id
  const [regionSelections, setRegionSelections] = useState({});
  const originalRegionRef = useRef({});

  useEffect(() => {
    let cancelled = false;
    const realIds = panelPricing
      .filter((p) => typeof p.panel_pricing_id === "number" && p.panel_pricing_id > 0)
      .map((p) => p.panel_pricing_id);
    if (realIds.length === 0) return;
    (async () => {
      try {
        const map = await bulkLoadRegionPanelPriceMatrix(realIds);
        if (cancelled) return;
        originalRegionRef.current = { ...map };
        setRegionSelections((prev) => {
          const next = { ...prev };
          for (const [id, regionIds] of Object.entries(map)) {
            if (!next[id]) next[id] = [...regionIds];
          }
          return next;
        });
      } catch (err) { /* silently fail */ }
    })();
    return () => { cancelled = true; };
  }, [panelPricing]);

  // ADD

  const handleAdd = useCallback(async () => {
    const price = parseFloat(parseCurrencyInput(addForm.price));
    if (isNaN(price) || price <= 0) { toastError("Price is required"); return; }
    if (!addForm.panel_type_id) { toastError("Panel Type is required"); return; }

    setSaving(true);
    try {
      const result = await upsertPanelPricing({
        feature_id: featureId,
        panel_type_id: parseInt(addForm.panel_type_id),
        width: addForm.width ? parseInt(addForm.width) : null,
        height: addForm.height ? parseInt(addForm.height) : null,
        price,
        siding_style: addForm.siding_style || null,
      });

      const realId = result?.panel_pricing_id;
      if (realId && addForm.selectedRegionIds.length > 0) {
        for (const regionId of addForm.selectedRegionIds) {
          await insertRegionPanelPriceMatrix(regionId, realId);
        }
      }

      toastSuccess("Panel price added");
      setAddForm({ panel_type_id: "", width: "", height: "", price: "", siding_style: "", selectedRegionIds: [] });
      setAddOpen(false);
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [addForm, featureId, onRefresh]);

  // EDIT

  const handleStartEdit = useCallback((row) => {
    setEditingId(row.panel_pricing_id);
    const regIds = regionSelections[row.panel_pricing_id] ?? originalRegionRef.current[String(row.panel_pricing_id)] ?? [];
    setEditForm({
      panel_type_id: row.panel_type_id ?? "",
      width: row.width ?? "",
      height: row.height ?? "",
      price: row.price ?? "",
      siding_style: row.siding_style ?? "",
      selectedRegionIds: [...regIds],
    });
  }, [regionSelections]);

  const handleSave = useCallback(async () => {
    const price = parseFloat(parseCurrencyInput(editForm.price));
    if (isNaN(price) || price <= 0) { toastError("Price is required"); return; }
    if (!editForm.panel_type_id) { toastError("Panel Type is required"); return; }

    setSaving(true);
    try {
      await upsertPanelPricing({
        feature_id: featureId,
        panel_pricing_id: editingId,
        panel_type_id: parseInt(editForm.panel_type_id),
        width: editForm.width ? parseInt(editForm.width) : null,
        height: editForm.height ? parseInt(editForm.height) : null,
        price,
        siding_style: editForm.siding_style || null,
      });

      // Sync region mappings
      const currentRegions = new Set(editForm.selectedRegionIds);
      const originalRegions = new Set(originalRegionRef.current[String(editingId)] ?? []);
      for (const regionId of currentRegions) {
        if (!originalRegions.has(regionId)) {
          await insertRegionPanelPriceMatrix(regionId, editingId);
        }
      }
      for (const regionId of originalRegions) {
        if (!currentRegions.has(regionId)) {
          await deleteRegionPanelPriceMatrix(regionId, editingId);
        }
      }

      toastSuccess("Panel price updated");
      setEditingId(null);
      setEditForm({ panel_type_id: "", width: "", height: "", price: "", siding_style: "", selectedRegionIds: [] });
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [editForm, editingId, featureId, onRefresh]);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditForm({ panel_type_id: "", width: "", height: "", price: "", siding_style: "", selectedRegionIds: [] });
    setRegionSelections((prev) => {
      const original = originalRegionRef.current[String(editingId)];
      if (original) return { ...prev, [editingId]: [...original] };
      const next = { ...prev };
      delete next[editingId];
      return next;
    });
  }, [editingId]);

  // DELETE

  const handleDelete = useCallback(async (row) => {
    setSaving(true);
    try {
      await deletePanelPricing(row.panel_pricing_id);
      toastSuccess("Panel price deleted");
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [onRefresh]);

  const panelColumns = useMemo(() => [
    {
      key: "panel_type_id", label: "Panel Type", width: 180, sortable: true,
      sortValue: (row) => panelTypeLabel(panelTypes.find((pt) => pt.panel_type_id === row?.panel_type_id)),
      render: (row) => editingId === row.panel_pricing_id
        ? (
          <select className="form-select form-select-sm" value={editForm.panel_type_id} onChange={(e) => setEditForm((p) => ({ ...p, panel_type_id: e.target.value }))}>
            <option value="">Select…</option>
            {panelTypes.map((pt) => <option key={pt.panel_type_id} value={pt.panel_type_id}>{panelTypeLabel(pt)}</option>)}
          </select>
        )
        : (panelTypeLabel(panelTypes.find((pt) => pt.panel_type_id === row?.panel_type_id)) || (row?.panel_type_id ?? "—")),
    },
    {
      key: "width", label: "Width", width: 90, sortable: true,
      sortValue: (row) => row.width ?? 0,
      render: (row) => editingId === row.panel_pricing_id
        ? <input type="number" className="form-control form-control-sm" value={editForm.width} onChange={(e) => setEditForm((p) => ({ ...p, width: e.target.value.replace(/[^0-9]/g, "") }))} />
        : (row.width != null ? row.width : "—"),
    },
    {
      key: "height", label: "Height", width: 90, sortable: true,
      sortValue: (row) => row.height ?? 0,
      render: (row) => editingId === row.panel_pricing_id
        ? <input type="number" className="form-control form-control-sm" value={editForm.height} onChange={(e) => setEditForm((p) => ({ ...p, height: e.target.value.replace(/[^0-9]/g, "") }))} />
        : (row.height != null ? row.height : "—"),
    },
    {
      key: "siding_style", label: "Siding Style", width: 140, sortable: true,
      render: (row) => editingId === row.panel_pricing_id
        ? (
          <select className="form-select form-select-sm" value={editForm.siding_style} onChange={(e) => setEditForm((p) => ({ ...p, siding_style: e.target.value }))}>
            <option value="">Select…</option>
            {SIDING_STYLE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )
        : (row.siding_style ?? "—"),
    },
    {
      key: "price", label: "Price", width: 130, sortable: true,
      render: (row) => editingId === row.panel_pricing_id
        ? <input className="form-control form-control-sm" value={formatCurrencyInput(editForm.price)} onChange={(e) => setEditForm((p) => ({ ...p, price: parseCurrencyInput(e.target.value) }))} />
        : formatCurrency(row.price),
    },
    {
      key: "regions", label: "Regions", width: 260, sortable: false,
      render: (row) => {
        const rowId = row.panel_pricing_id;
        const isEditing = editingId === rowId;
        const selected = new Set(isEditing ? (editForm.selectedRegionIds ?? []) : (regionSelections[rowId] ?? originalRegionRef.current[String(rowId)] ?? []));
        if (isEditing) {
          return (
            <div className="d-flex flex-wrap gap-1" style={{ maxWidth: 260 }}>
              {regions.map((r) => (
                <label key={r.region_id} className="form-check form-check-inline mb-0 me-1" style={{ fontSize: "0.8rem" }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={selected.has(r.region_id)}
                    onChange={(e) => {
                      setEditForm((prev) => ({
                        ...prev,
                        selectedRegionIds: e.target.checked
                          ? [...(prev.selectedRegionIds ?? []), r.region_id]
                          : (prev.selectedRegionIds ?? []).filter((id) => id !== r.region_id),
                      }));
                    }}
                  />
                  <span className="form-check-label">{r.name} ({r.state_code})</span>
                </label>
              ))}
            </div>
          );
        }
        if (selected.size === 0) return <span className="text-muted small">All regions</span>;
        const names = regions.filter((r) => selected.has(r.region_id)).map((r) => `${r.name} (${r.state_code})`);
        return <span className="small text-truncate d-inline-block" style={{ maxWidth: 250 }} title={names.join(", ")}>{names.join(", ")}</span>;
      },
    },
  ], [editingId, editForm, panelTypes, regionSelections, regions]);

  const panelActions = useMemo(() => [
    { key: "view-panel", label: "View", type: "secondary", icon: "eye", onClick: (r) => setViewRow(r) },

    { key: "edit-price", label: "Edit", type: "secondary", icon: "pen", visible: (r) => editingId !== r.panel_pricing_id, onClick: (r) => handleStartEdit(r) },
    { key: "save-price", label: "Save", type: "primary", icon: "floppy-disk", visible: (r) => editingId === r.panel_pricing_id, onClick: () => handleSave(), disabled: saving },
    { key: "cancel-price", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => editingId === r.panel_pricing_id, onClick: () => handleCancel(), disabled: saving },
    { key: "delete-price", label: "Delete", type: "danger", icon: "trash", visible: (r) => editingId !== r.panel_pricing_id, confirm: true, confirmMessage: (r) => `Delete panel price row "${panelPricingRowLabel(r, panelTypes)}"? This cannot be undone.`, onClick: (r) => handleDelete(r), disabled: saving },
  ], [editingId, saving, handleStartEdit, handleSave, handleCancel, handleDelete, panelTypes]);

  const panelFilterConfig = useMemo(() => createFilterConfig([
    { key: "panel_type_id", label: "Panel Type", type: TABLE_FILTER_TYPES.SELECT, options: panelTypes.map((pt) => ({ label: panelTypeLabel(pt), value: String(pt.panel_type_id) })) },
    { key: "width", label: "Width", type: TABLE_FILTER_TYPES.TEXT },
    { key: "height", label: "Height", type: TABLE_FILTER_TYPES.TEXT },
    { key: "siding_style", label: "Siding Style", type: TABLE_FILTER_TYPES.SELECT, options: SIDING_STYLE_OPTIONS.map((s) => ({ label: s, value: s })) },
    { key: "price", label: "Price", type: TABLE_FILTER_TYPES.TEXT },
  ]), [panelTypes]);

  return (
    <div>
      
      <div className="mb-3 psb-hide-search">
        <TableZ
          columns={panelColumns}
          data={panelPricing}
          rowIdKey="panel_pricing_id"
          actions={panelActions}
          filterConfig={panelFilterConfig}
          sort={{ key: "panel_type_id", direction: "asc" }}
          defaultFiltersExpanded={false}
          stickyFilters
          filterToolbarAction={(
            <div className="d-flex align-items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onRefresh} title="Refresh">
                <FontAwesomeIcon icon={faSync} />
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}><FontAwesomeIcon icon={faPlus} /> Add Panel Price</Button>
            </div>
          )}
          emptyMessage="No panel pricing rows yet."
        />
      </div>
      <Modal title="Add Panel Price" show={addOpen} onHide={() => setAddOpen(false)} size="lg">
        <div className="row g-2 mb-3">
          <div className="col-4">
            <label className="form-label small mb-1">Panel Type *</label>
            <select className="form-select form-select-sm" value={addForm.panel_type_id} onChange={(e) => setAddForm({ ...addForm, panel_type_id: e.target.value })}>
              <option value="">Select…</option>
              {panelTypes.map((pt) => <option key={pt.panel_type_id} value={pt.panel_type_id}>{panelTypeLabel(pt)}</option>)}
            </select>
          </div>
          <div className="col-2">
            <label className="form-label small mb-1">Width (ft)</label>
            <input type="number" className="form-control form-control-sm" value={addForm.width} onChange={(e) => setAddForm({ ...addForm, width: e.target.value.replace(/[^0-9]/g, "") })} />
          </div>
          <div className="col-2">
            <label className="form-label small mb-1">Height (ft)</label>
            <input type="number" className="form-control form-control-sm" value={addForm.height} onChange={(e) => setAddForm({ ...addForm, height: e.target.value.replace(/[^0-9]/g, "") })} />
          </div>
          <div className="col-2">
            <label className="form-label small mb-1">Siding Style</label>
            <select className="form-select form-select-sm" value={addForm.siding_style} onChange={(e) => setAddForm({ ...addForm, siding_style: e.target.value })}>
              <option value="">Select…</option>
              {SIDING_STYLE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-2">
            <label className="form-label small mb-1">Price ($) *</label>
            <input className="form-control form-control-sm" value={addForm.price} onChange={(e) => setAddForm({ ...addForm, price: formatCurrencyInput(e.target.value) })} />
          </div>
        </div>
        <div className="row g-2 mb-3">
          <div className="col-12">
            <label className="form-label small mb-1">Regions (optional — none = all regions)</label>
            <div className="d-flex flex-wrap gap-1">
              {regions.map((r) => (
                <label key={r.region_id} className="form-check form-check-inline mb-0 me-1" style={{ fontSize: "0.8rem" }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={addForm.selectedRegionIds.includes(r.region_id)}
                    onChange={(e) => {
                      setAddForm((prev) => ({
                        ...prev,
                        selectedRegionIds: e.target.checked
                          ? [...prev.selectedRegionIds, r.region_id]
                          : prev.selectedRegionIds.filter((id) => id !== r.region_id),
                      }));
                    }}
                  />
                  <span className="form-check-label">{r.name} ({r.state_code})</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="d-flex justify-content-end">
          <Button size="sm" onClick={handleAdd} loading={saving}>Add</Button>
        </div>
      </Modal>
      <RowViewModal
        show={Boolean(viewRow)}
        onHide={() => setViewRow(null)}
        title="Panel Price"
        fields={viewRow ? [
          { label: "Panel Type", value: panelTypeLabel(panelTypes.find((pt) => pt.panel_type_id === viewRow.panel_type_id)) || (viewRow.panel_type_id ?? "—") },
          { label: "Width", value: viewRow.width != null ? viewRow.width : "—" },
          { label: "Height", value: viewRow.height != null ? viewRow.height : "—" },
          { label: "Siding Style", value: viewRow.siding_style ?? "—" },
          { label: "Price", value: formatCurrency(viewRow.price) },
          { label: "Regions", value: formatRegionNames(regions, regionSelections[viewRow.panel_pricing_id] ?? originalRegionRef.current[String(viewRow.panel_pricing_id)] ?? []), full: true },
        ] : []}
      />

    </div>
  );
}

// ─── DOOR / WINDOW EDITOR ──────────────────────────────────

const DOOR_WINDOW_ITEM_TYPES = [
  { value: "door", label: "Walk-in Door" },
  { value: "window", label: "Window" },
  { value: "frameout", label: "Frameout" },
  { value: "rollup_door", label: "Rollup Door" },
  { value: "vent", label: "Vent" },
];

function doorWindowTypeLabel(type) {
  const found = DOOR_WINDOW_ITEM_TYPES.find((t) => t.value === type);
  return found ? found.label : (type ? type.charAt(0).toUpperCase() + type.slice(1) : "—");
}

function DoorWindowEditor({ featureId, items, regions, onRefresh, fixedType = null }) {
  const defaultType = fixedType || "door";
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [viewRow, setViewRow] = useState(null);

  const [addForm, setAddForm] = useState({ name: "", item_type: defaultType, price: "", description: "", sort_order: "", selectedRegionIds: [] });
  const [editForm, setEditForm] = useState({ name: "", item_type: defaultType, price: "", description: "", sort_order: "", selectedRegionIds: [] });

  // Region mappings (metal_m_region_door_window) keyed by item_id
  const [regionSelections, setRegionSelections] = useState({});
  const originalRegionRef = useRef({});

  useEffect(() => {
    let cancelled = false;
    const realIds = items
      .filter((i) => typeof i.item_id === "number" && i.item_id > 0)
      .map((i) => i.item_id);
    if (realIds.length === 0) return;
    (async () => {
      try {
        const map = await bulkLoadRegionDoorWindow(realIds);
        if (cancelled) return;
        originalRegionRef.current = { ...map };
        setRegionSelections((prev) => {
          const next = { ...prev };
          for (const [id, regionIds] of Object.entries(map)) {
            if (!next[id]) next[id] = [...regionIds];
          }
          return next;
        });
      } catch (err) { /* silently fail */ }
    })();
    return () => { cancelled = true; };
  }, [items]);

  // ADD
  const handleAdd = useCallback(async () => {
    const price = parseFloat(parseCurrencyInput(addForm.price));
    if (!addForm.name.trim()) { toastError("Item name is required"); return; }
    if (!addForm.item_type) { toastError("Item type is required"); return; }
    if (isNaN(price) || price <= 0) { toastError("Price is required"); return; }

    setSaving(true);
    try {
      const result = await upsertDoorWindowItem({
        feature_id: featureId,
        name: addForm.name.trim(),
        item_type: fixedType || addForm.item_type,
        price,
        description: addForm.description || null,
        sort_order: addForm.sort_order ? parseInt(addForm.sort_order) : 0,
      });
      const realId = result?.item_id;
      if (realId && addForm.selectedRegionIds.length > 0) {
        for (const regionId of addForm.selectedRegionIds) {
          await insertRegionDoorWindow(regionId, realId);
        }
      }
      toastSuccess("Item added");
      setAddForm({ name: "", item_type: defaultType, price: "", description: "", sort_order: "", selectedRegionIds: [] });
      setAddOpen(false);
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [addForm, featureId, onRefresh, defaultType, fixedType]);

  // EDIT
  const handleStartEdit = useCallback((row) => {
    setEditingId(row.item_id);
    const regIds = regionSelections[row.item_id] ?? originalRegionRef.current[String(row.item_id)] ?? [];
    setEditForm({
      name: row.name ?? "",
      description: row.description ?? "",
      price: row.price ?? "",
      item_type: fixedType || row.item_type || defaultType,
      sort_order: row.sort_order ?? "",
      selectedRegionIds: [...regIds],
    });
  }, [regionSelections, defaultType, fixedType]);

  const handleSave = useCallback(async () => {
    const price = parseFloat(parseCurrencyInput(editForm.price));
    if (!editForm.name.trim()) { toastError("Item name is required"); return; }
    if (!editForm.item_type) { toastError("Item type is required"); return; }
    if (isNaN(price) || price <= 0) { toastError("Price is required"); return; }

    setSaving(true);
    try {
      await upsertDoorWindowItem({
        item_id: editingId,
        feature_id: featureId,
        name: editForm.name.trim(),
        item_type: fixedType || editForm.item_type,
        price,
        description: editForm.description || null,
        sort_order: editForm.sort_order ? parseInt(editForm.sort_order) : 0,
      });

      // Sync region mappings
      const currentRegions = new Set(editForm.selectedRegionIds);
      const originalRegions = new Set(originalRegionRef.current[String(editingId)] ?? []);
      for (const regionId of currentRegions) {
        if (!originalRegions.has(regionId)) {
          await insertRegionDoorWindow(regionId, editingId);
        }
      }
      for (const regionId of originalRegions) {
        if (!currentRegions.has(regionId)) {
          await deleteRegionDoorWindow(regionId, editingId);
        }
      }

      toastSuccess("Item updated");
      setEditingId(null);
      setEditForm({ name: "", item_type: defaultType, price: "", description: "", sort_order: "", selectedRegionIds: [] });
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [editForm, editingId, featureId, onRefresh, defaultType, fixedType]);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditForm({ name: "", item_type: defaultType, price: "", description: "", sort_order: "", selectedRegionIds: [] });
    setRegionSelections((prev) => {
      const original = originalRegionRef.current[String(editingId)];
      if (original) return { ...prev, [editingId]: [...original] };
      const next = { ...prev };
      delete next[editingId];
      return next;
    });
  }, [editingId, defaultType]);

  // DELETE
  const handleDelete = useCallback(async (row) => {
    setSaving(true);
    try {
      await deleteDoorWindowItem(row.item_id);
      toastSuccess("Item deleted");
      await onRefresh();
    } catch (err) { toastError(err.message); }
    finally { setSaving(false); }
  }, [onRefresh]);

  const doorWindowColumns = useMemo(() => [
    {
      key: "name", label: "Item Name", width: 240, sortable: true,
      render: (row) => editingId === row.item_id
        ? <input className="form-control form-control-sm" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
        : <span className="fw-medium">{row.name}</span>,
    },
    {
        key: "description", label: "Description", width: 240, sortable: true,
        render: (row) => editingId === row.item_id
          ? <input className="form-control form-control-sm" value={editForm.description ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
          : (row.description
            ? <span className="text-truncate d-inline-block" style={{ maxWidth: 230 }} title={row.description}>{row.description}</span>
            : <span className="text-muted">—</span>),
      },
    
    ...(fixedType ? [] : [{
      key: "item_type", label: "Type", width: 150, sortable: true,
      sortValue: (row) => doorWindowTypeLabel(row.item_type),
      render: (row) => editingId === row.item_id
        ? (
          <select className="form-select form-select-sm" value={editForm.item_type} onChange={(e) => setEditForm((p) => ({ ...p, item_type: e.target.value }))}>
            {DOOR_WINDOW_ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        )
        : <span>{doorWindowTypeLabel(row.item_type)}</span>,
    }]),
    {
      key: "price", label: "Price", width: 120, sortable: true,
      sortValue: (row) => Number(row.price ?? 0),
      render: (row) => editingId === row.item_id
        ? <input className="form-control form-control-sm text-end" value={editForm.price} onChange={(e) => setEditForm((p) => ({ ...p, price: formatCurrencyInput(e.target.value) }))} />
        : <span>{formatCurrency(row.price)}</span>,
    },
    ...(fixedType === "rollup_door" || fixedType === "door" ? [
      
      {
        key: "sort_order", label: "Sort Order", width: 100, sortable: true,
        sortValue: (row) => Number(row.sort_order ?? 0),
        render: (row) => editingId === row.item_id
          ? <input type="number" className="form-control form-control-sm" value={editForm.sort_order} onChange={(e) => setEditForm((p) => ({ ...p, sort_order: e.target.value.replace(/[^0-9]/g, "") }))} />
          : (row.sort_order != null ? row.sort_order : "—"),
      },
      
    ] : []),

    {
      key: "regions", label: "Regions", width: 260, sortable: false,
      render: (row) => {
        const rowId = row.item_id;
        const isEditing = editingId === rowId;
        const selected = new Set(isEditing ? (editForm.selectedRegionIds ?? []) : (regionSelections[rowId] ?? originalRegionRef.current[String(rowId)] ?? []));
        if (isEditing) {
          return (
            <div className="d-flex flex-wrap gap-1" style={{ maxWidth: 260 }}>
              {regions.map((r) => (
                <label key={r.region_id} className="form-check form-check-inline mb-0 me-1" style={{ fontSize: "0.8rem" }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={selected.has(r.region_id)}
                    onChange={(e) => {
                      setEditForm((prev) => ({
                        ...prev,
                        selectedRegionIds: e.target.checked
                          ? [...(prev.selectedRegionIds ?? []), r.region_id]
                          : (prev.selectedRegionIds ?? []).filter((id) => id !== r.region_id),
                      }));
                    }}
                  />
                  <span className="form-check-label">{r.name} ({r.state_code})</span>
                </label>
              ))}
            </div>
          );
        }
        if (selected.size === 0) return <span className="text-muted small">All regions</span>;
        const names = regions.filter((r) => selected.has(r.region_id)).map((r) => `${r.name} (${r.state_code})`);
        return <span className="small text-truncate d-inline-block" style={{ maxWidth: 250 }} title={names.join(", ")}>{names.join(", ")}</span>;
      },
    },
  ], [editingId, editForm, regionSelections, regions, fixedType]);

  const doorWindowActions = useMemo(() => [
    { key: "view-door-window", label: "View", type: "secondary", icon: "eye", onClick: (r) => setViewRow(r) },

    { key: "edit-item", label: "Edit", type: "secondary", icon: "pen", visible: (r) => editingId !== r.item_id, onClick: (r) => handleStartEdit(r) },
    { key: "save-item", label: "Save", type: "primary", icon: "floppy-disk", visible: (r) => editingId === r.item_id, onClick: () => handleSave(), disabled: saving },
    { key: "cancel-item", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => editingId === r.item_id, onClick: () => handleCancel(), disabled: saving },
    { key: "delete-item", label: "Delete", type: "danger", icon: "trash", visible: (r) => editingId !== r.item_id, confirm: true, confirmMessage: (r) => `Delete item "${r.name}"? This cannot be undone.`, onClick: (r) => handleDelete(r), disabled: saving },
  ], [editingId, saving, handleStartEdit, handleSave, handleCancel, handleDelete]);

  const doorWindowFilterConfig = useMemo(() => createFilterConfig([
    { key: "name", label: "Item Name", type: TABLE_FILTER_TYPES.TEXT },
    { key: "item_type", label: "Type", type: TABLE_FILTER_TYPES.SELECT, options: DOOR_WINDOW_ITEM_TYPES.map((t) => ({ label: t.label, value: t.value })) },
    { key: "price", label: "Price", type: TABLE_FILTER_TYPES.TEXT },
  ]), []);

  return (
    <div>
      <div className="mb-3 psb-hide-search">
        <TableZ
          columns={doorWindowColumns}
          data={items}
          rowIdKey="item_id"
          actions={doorWindowActions}
          emptyMessage="No door/window items found."
          filterConfig={doorWindowFilterConfig}
          defaultFiltersExpanded={false}
          stickyFilters
          filterToolbarAction={(
            <div className="d-flex align-items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onRefresh} title="Refresh">
                <FontAwesomeIcon icon={faSync} />
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}><FontAwesomeIcon icon={faPlus} /> Add Item</Button>
            </div>
          )}
        />
      </div>
      <Modal title={fixedType === "door" ? "Add New Door" : fixedType === "rollup_door" ? "Add New Rollup Door" : "Add New Item"} show={addOpen} onHide={() => setAddOpen(false)} size="lg">
        <div className="row g-2 mb-3">
          <div className="col-4">
            <label className="form-label small mb-1">Item Name *</label>
            <input className="form-control form-control-sm" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
          </div>
          {!fixedType && (
            <div className="col-3">
              <label className="form-label small mb-1">Type *</label>
              <select className="form-select form-select-sm" value={addForm.item_type} onChange={(e) => setAddForm({ ...addForm, item_type: e.target.value })}>
                {DOOR_WINDOW_ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          )}
          <div className="col-2">
            <label className="form-label small mb-1">Price ($) *</label>
            <input className="form-control form-control-sm" value={addForm.price} onChange={(e) => setAddForm({ ...addForm, price: formatCurrencyInput(e.target.value) })} />
          </div>
          <div className="col-2">
            <label className="form-label small mb-1">Sort Order</label>
            <input type="number" className="form-control form-control-sm" value={addForm.sort_order} onChange={(e) => setAddForm({ ...addForm, sort_order: e.target.value.replace(/[^0-9]/g, "") })} />
          </div>
        </div>
        <div className="mb-3">
          <label className="form-label small mb-1">Description</label>
          <input className="form-control form-control-sm" value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} />
        </div>
        <br/>
        <div className="row g-2 mb-3">
          <div className="col-12">
            <label className="form-label small mb-1">Regions</label>
            <div className="d-flex flex-wrap gap-1">
              {regions.map((r) => (
                <label key={r.region_id} className="form-check form-check-inline mb-0 me-1" style={{ fontSize: "0.8rem" }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={addForm.selectedRegionIds.includes(r.region_id)}
                    onChange={(e) => {
                      setAddForm((prev) => ({
                        ...prev,
                        selectedRegionIds: e.target.checked
                          ? [...prev.selectedRegionIds, r.region_id]
                          : prev.selectedRegionIds.filter((id) => id !== r.region_id),
                      }));
                    }}
                  />
                  <span className="form-check-label">{r.name} ({r.state_code})</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="d-flex justify-content-end">
          <Button size="sm" onClick={handleAdd} loading={saving}>Add</Button>
        </div>
      </Modal>
      <RowViewModal
        show={Boolean(viewRow)}
        onHide={() => setViewRow(null)}
        title="Door"
        fields={viewRow ? [
          
          { label: "Item Name", value: viewRow.name ?? "—" },
           { label: "Description", value: viewRow.description ?? "—", full: true },         
          { label: "Price", value: formatCurrency(viewRow.price) },      
           { label: "Type", value: doorWindowTypeLabel(fixedType || viewRow.item_type) },   
          { label: "Sort Order", value: viewRow.sort_order ?? "—" },
          { label: "Regions", value: formatRegionNames(regions, regionSelections[viewRow.item_id] ?? originalRegionRef.current[String(viewRow.item_id)] ?? []), full: true },
        ] : []}
      />

    </div>
  );
}

// ─── COLOR EDITOR ──────────────────────────────────────────

function ColorEditor({ featureId, groups, onRefresh }) {
  const [expandedGroup, setExpandedGroup] = useState(groups[0]?.color_group_id ?? null);
  const [groupOptions, setGroupOptions] = useState({});
  const [loadingGroup, setLoadingGroup] = useState(null);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addGroupName, setAddGroupName] = useState("");
  const [addOptOpen, setAddOptOpen] = useState(null); // color_group_id or null
  const [addOptForm, setAddOptForm] = useState({ name: "", hex_code: "#888888", upcharge: "0" });

  // Load options when a group is expanded
  useEffect(() => {
    if (!expandedGroup || groupOptions[expandedGroup]) return;
    let cancelled = false;
    loadColorOptions(expandedGroup).then((opts) => {
      if (!cancelled) setGroupOptions((prev) => ({ ...prev, [expandedGroup]: opts }));
    }).catch((err) => { if (!cancelled) toastError(err.message); });
    return () => { cancelled = true; };
  }, [expandedGroup, groupOptions]);

  const refreshGroup = async (groupId) => {
    const opts = await loadColorOptions(groupId);
    setGroupOptions((prev) => ({ ...prev, [groupId]: opts }));
  };

  const handleAddGroup = async () => {
    if (!addGroupName.trim()) { toastError("Group name required"); return; }
    try {
      await upsertColorGroup({ feature_id: featureId, name: addGroupName.trim(), sort_order: groups.length + 1 });
      setAddGroupName("");
      setAddGroupOpen(false);
      toastSuccess("Color group added");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  };

  const handleDeleteGroup = async (groupId, name) => {
    try {
      await deleteColorGroup(groupId);
      toastSuccess(`Group "${name}" removed`);
      setGroupOptions((prev) => { const n = { ...prev }; delete n[groupId]; return n; });
      await onRefresh();
    } catch (err) { toastError(err.message); }
  };

  const handleAddOpt = async (groupId) => {
    if (!addOptForm.name.trim()) { toastError("Color name required"); return; }
    try {
      await upsertColorOption({
        color_group_id: groupId,
        name: addOptForm.name.trim(),
        hex_code: addOptForm.hex_code,
        upcharge: parseFloat(addOptForm.upcharge) || 0,
        sort_order: (groupOptions[groupId]?.length ?? 0) + 1,
      });
      setAddOptForm({ name: "", hex_code: "#888888", upcharge: "0" });
      setAddOptOpen(null);
      toastSuccess("Color added");
      await refreshGroup(groupId);
    } catch (err) { toastError(err.message); }
  };

  const handleDeleteOpt = async (optId, groupId) => {
    try {
      await deleteColorOption(optId);
      toastSuccess("Color removed");
      await refreshGroup(groupId);
    } catch (err) { toastError(err.message); }
  };

  const handleUpdateOpt = async (opt, groupId) => {
    try {
      await upsertColorOption(opt);
      toastSuccess("Color updated");
      await refreshGroup(groupId);
    } catch (err) { toastError(err.message); }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0">Color Groups ({groups.length})</h6>
        <Button size="sm" onClick={() => setAddGroupOpen(true)}><FontAwesomeIcon icon={faPlus} /> Group</Button>
      </div>

      {groups.map((group) => {
        const isOpen = expandedGroup === group.color_group_id;
        const opts = groupOptions[group.color_group_id] ?? [];
        const isLoading = loadingGroup === group.color_group_id;
        return (
          <div key={group.color_group_id} className="card mb-2">
            <div className="card-header d-flex justify-content-between align-items-center py-2" style={{ cursor: "pointer" }}
              onClick={() => setExpandedGroup(isOpen ? null : group.color_group_id)}>
              <div>
                <span className="fw-semibold">{group.name}</span>
                <span className="text-muted small ms-2">({opts.length || "…"} colors)</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.color_group_id, group.name); }}>×</Button>
                <span>{isOpen ? "−" : "+"}</span>
              </div>
            </div>
            {isOpen && (
              <div className="card-body py-2">
                {!groupOptions[group.color_group_id] ? <p className="text-muted small mb-0">Loading...</p> : (
                  <>
                    <div className="d-flex flex-wrap gap-2 mb-2">
                      {opts.map((opt) => (
                        <ColorSwatch key={opt.color_option_id} opt={opt} groupId={group.color_group_id} onUpdate={handleUpdateOpt} onDelete={handleDeleteOpt} />
                      ))}
                    </div>
                    <Button size="sm" variant="outline-primary" onClick={() => { setAddOptOpen(group.color_group_id); setAddOptForm({ name: "", hex_code: "#888888", upcharge: "0" }); }}><FontAwesomeIcon icon={faPlus} /> Color</Button>
                  </>
                )}
                {addOptOpen === group.color_group_id && (
                  <div className="mt-2 p-2 border rounded bg-light">
                    <div className="d-flex gap-2 align-items-end flex-wrap">
                      <div style={{ minWidth: 150 }}>
                        <label className="form-label small mb-1">Name *</label>
                        <input className="form-control form-control-sm" value={addOptForm.name} onChange={(e) => setAddOptForm({ ...addOptForm, name: e.target.value })} />
                      </div>
                      <div style={{ minWidth: 60 }}>
                        <label className="form-label small mb-1">Color</label>
                        <input type="color" className="form-control form-control-sm form-control-color" value={addOptForm.hex_code} onChange={(e) => setAddOptForm({ ...addOptForm, hex_code: e.target.value })} />
                      </div>
                      <div style={{ minWidth: 80 }}>
                        <label className="form-label small mb-1">Upcharge</label>
                        <input className="form-control form-control-sm" value={addOptForm.upcharge} onChange={(e) => setAddOptForm({ ...addOptForm, upcharge: e.target.value })} />
                      </div>
                      <div className="d-flex gap-1">
                        <Button size="sm" onClick={() => handleAddOpt(group.color_group_id)}>Add</Button>
                        <Button size="sm" variant="secondary" onClick={() => setAddOptOpen(null)}>Cancel</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <Modal title="Add Color Group" show={addGroupOpen} onHide={() => setAddGroupOpen(false)}>
        <div className="d-flex gap-2 align-items-end">
          <div style={{ flex: 1 }}>
            <label className="form-label small mb-1">Group Name *</label>
            <input className="form-control form-control-sm" value={addGroupName} onChange={(e) => setAddGroupName(e.target.value)} placeholder="e.g. Wainscot" />
          </div>
          <Button size="sm" onClick={handleAddGroup}>Create</Button>
        </div>
      </Modal>
    </div>
  );
}

function ColorSwatch({ opt, groupId, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: opt.name, hex_code: opt.hex_code, upcharge: opt.upcharge });

  if (editing) {
    return (
      <div className="p-2 border rounded bg-light" style={{ minWidth: 200 }}>
        <div className="mb-1">
          <input className="form-control form-control-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="d-flex gap-2 mb-1">
          <input type="color" className="form-control form-control-sm form-control-color" value={form.hex_code} onChange={(e) => setForm({ ...form, hex_code: e.target.value })} />
          <input className="form-control form-control-sm" placeholder="Upcharge" value={form.upcharge} onChange={(e) => setForm({ ...form, upcharge: e.target.value })} style={{ width: 80 }} />
        </div>
        <div className="d-flex gap-1">
          <Button size="sm" onClick={() => { onUpdate({ ...opt, name: form.name, hex_code: form.hex_code, upcharge: parseFloat(form.upcharge) || 0 }, groupId); setEditing(false); }}>Save</Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="sm" variant="danger" onClick={() => onDelete(opt.color_option_id, groupId)}>Delete</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center" style={{ cursor: "pointer" }} title={`${opt.name} (${opt.hex_code})${Number(opt.upcharge) > 0 ? ` +$${opt.upcharge}` : ""}`} onClick={() => { setEditing(true); setForm({ name: opt.name, hex_code: opt.hex_code, upcharge: opt.upcharge }); }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: opt.hex_code, border: "2px solid #ccc", margin: "0 auto" }} />
      <div className="small text-truncate" style={{ maxWidth: 60, fontSize: "0.65rem" }}>{opt.name}</div>
      {Number(opt.upcharge) > 0 && <div style={{ fontSize: "0.6rem" }} className="text-muted">+${opt.upcharge}</div>}
    </div>
  );
}

// ─── ADD FEATURE BUTTON ────────────────────────────────────

function AddFeatureButton({ pricingTypes, categories, onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", pricing_type_id: pricingTypes[0]?.pricing_type_id ?? "", category_id: "", description: "" });

  const handleCreate = async () => {
    if (!form.name.trim()) { toastError("Name is required"); return; }
    if (!form.pricing_type_id) { toastError("Pricing type is required"); return; }
    const pt = pricingTypes.find((p) => p.pricing_type_id === parseInt(form.pricing_type_id));
    const cat = categories.find((c) => c.category_id === parseInt(form.category_id));
    try {
      const created = await createFeature({
        name: form.name.trim(),
        pricing_type_id: parseInt(form.pricing_type_id),
        pricing_type_code: pt?.code ?? "",
        category_id: form.category_id ? parseInt(form.category_id) : null,
        category_name: cat?.name ?? null,
        description: form.description,
      });
      toastSuccess(`Feature "${created.name}" created`);
      onCreated(created);
      setOpen(false);
      setForm({ name: "", pricing_type_id: pricingTypes[0]?.pricing_type_id ?? "", category_id: "", description: "" });
    } catch (err) { toastError(err.message); }
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Add feature">
        <FontAwesomeIcon icon={faPlus} />
      </Button>
      <Modal title="Add Feature" show={open} onHide={() => setOpen(false)}>
          <div className="mb-2">
            <label className="form-label small">Name *</label>
            <input className="form-control form-control-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="mb-2">
            <label className="form-label small">Pricing Type *</label>
            <select className="form-select form-select-sm" value={form.pricing_type_id} onChange={(e) => setForm({ ...form, pricing_type_id: e.target.value })}>
              {pricingTypes.map((pt) => <option key={pt.pricing_type_id} value={pt.pricing_type_id}>{pt.label}</option>)}
            </select>
          </div>
          <div className="mb-2">
            <label className="form-label small">Category</label>
            <select className="form-select form-select-sm" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label small">Description</label>
            <input className="form-control form-control-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate}>Create</Button>
          </div>
        </Modal>
    </>
  );
}