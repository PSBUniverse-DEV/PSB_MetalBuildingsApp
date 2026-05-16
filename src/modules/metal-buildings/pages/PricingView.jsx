"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button, Card, Badge, Modal, Input, TableZ, TABLE_FILTER_TYPES, createFilterConfig, toastSuccess, toastError } from "@/shared/components/ui";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTableCells, faTags, faListCheck, faLayerGroup, faPalette, faPlus, faBan, faTrash, faCheck } from "@fortawesome/free-solid-svg-icons";
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from "../data/metalBuildings.data";
import {
  loadMatrixPrices,
  loadRate,
  loadOptions,
  loadPanelLocations,
  loadPanelOptions,
  createFeature,
  updateFeature,
  deleteFeature,
  upsertMatrixPrice,
  deleteMatrixPrice,
  upsertRate,
  upsertOption,
  deleteOption,
  upsertPanelOption,
  upsertPanelLocation,
  deletePanelOption,
  loadColorGroups,
  loadColorOptions,
  upsertColorGroup,
  deleteColorGroup,
  upsertColorOption,
  deleteColorOption,
} from "../data/metalBuildings.actions";
import "./pricing.css";

const TYPE_ICONS = {
  MATRIX: faTableCells,
  RATE: faTags,
  OPTIONS: faListCheck,
  PANEL: faLayerGroup,
  COLOR: faPalette,
};

export default function PricingView({ features: initialFeatures, styles, pricingTypes: pricingTypesData, categories: categoriesData }) {
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

        <div className="pricing-sidebar-footer">
          <AddFeatureButton pricingTypes={pricingTypes} categories={categories} onCreated={(f) => { setFeatures((prev) => [...prev, f]); setSelectedId(f.feature_id); }} />
        </div>
      </aside>

      {/* ─── Main ─── */}
      <main className="pricing-main">
        {selected ? (
          <FeatureDetail
            feature={selected}
            styles={styles}
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

function FeatureDetail({ feature, styles, onUpdated, onDeleted }) {
  const [matrixPrices, setMatrixPrices] = useState([]);
  const [rate, setRate] = useState(null);
  const [options, setOptions] = useState([]);
  const [panelLocations, setPanelLocations] = useState([]);
  const [panelOptions, setPanelOptions] = useState([]);
  const [colorGroups, setColorGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        if (feature.pricing_type === "MATRIX") {
          const data = await loadMatrixPrices(feature.feature_id);
          if (!cancelled) setMatrixPrices(data);
        } else if (feature.pricing_type === "PANEL") {
          const [locs, opts] = await Promise.all([loadPanelLocations(feature.feature_id), loadPanelOptions(feature.feature_id)]);
          if (!cancelled) { setPanelLocations(locs); setPanelOptions(opts); }
        } else if (feature.pricing_type === "RATE") {
          const data = await loadRate(feature.feature_id);
          if (!cancelled) setRate(data);
        } else if (feature.pricing_type === "COLOR") {
          const data = await loadColorGroups(feature.feature_id);
          if (!cancelled) setColorGroups(data);
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
  }, [feature.feature_id, feature.pricing_type]);

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
    : feature.pricing_type === "PANEL" ? panelOptions.length
    : feature.pricing_type === "COLOR" ? colorGroups.length
    : feature.pricing_type === "RATE" ? (rate ? 1 : 0)
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
      <div className="pricing-content">
        {loading ? (
          <p className="text-muted small">Loading pricing data…</p>
        ) : (
          <>
            {feature.pricing_type === "MATRIX" && <MatrixEditor featureId={feature.feature_id} prices={matrixPrices} styles={styles} onRefresh={async () => setMatrixPrices(await loadMatrixPrices(feature.feature_id))} />}
            {feature.pricing_type === "PANEL" && <PanelEditor featureId={feature.feature_id} locations={panelLocations} panelOptions={panelOptions} onRefresh={async () => { setPanelLocations(await loadPanelLocations(feature.feature_id)); setPanelOptions(await loadPanelOptions(feature.feature_id)); }} />}
            {feature.pricing_type === "RATE" && <RateEditor featureId={feature.feature_id} rate={rate} onRefresh={async () => setRate(await loadRate(feature.feature_id))} />}
            {feature.pricing_type === "COLOR" && <ColorEditor featureId={feature.feature_id} groups={colorGroups} onRefresh={async () => setColorGroups(await loadColorGroups(feature.feature_id))} />}
            {!["MATRIX", "PANEL", "RATE", "COLOR"].includes(feature.pricing_type) && <OptionsEditor featureId={feature.feature_id} options={options} onRefresh={async () => setOptions(await loadOptions(feature.feature_id))} />}
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

// ─── MATRIX EDITOR ─────────────────────────────────────────

function MatrixEditor({ featureId, prices, styles, onRefresh }) {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ style_id: "", width: "", length: "", height: "", base_price: "", leg_height_price: "", enclosed_sides_price: "", enclosed_ends_price: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ style_id: styles[0]?.style_id ?? "", width: "", length: "", height: "", base_price: "", leg_height_price: "", enclosed_sides_price: "", enclosed_ends_price: "" });

  const sortedPrices = useMemo(
    () => [...prices].map((r) => ({
      ...r,
      size: `${r.width ?? "-"}x${r.length ?? "-"}x${r.height ?? "-"}|${r.width ?? "-"} x ${r.length ?? "-"} x ${r.height ?? "-"}|${r.width ?? "-"} ${r.length ?? "-"} ${r.height ?? "-"}`,
      base_price_display: `${formatCurrency(r.base_price)} ${r.base_price}`,
    })).sort((a, b) => (a.style_name ?? "").localeCompare(b.style_name ?? "") || (a.width ?? 0) - (b.width ?? 0) || (a.length ?? 0) - (b.length ?? 0) || (a.height ?? 0) - (b.height ?? 0)),
    [prices],
  );

  const handleAdd = async () => {
    const base_price = parseFloat(parseCurrencyInput(addForm.base_price));
    if (isNaN(base_price) || base_price <= 0) { toastError("Base Price is required"); return; }
    if (!addForm.style_id) { toastError("Style is required"); return; }
    try {
      await upsertMatrixPrice({
        feature_id: featureId,
        style_id: parseInt(addForm.style_id),
        width: addForm.width ? parseInt(addForm.width) : null,
        length: addForm.length ? parseInt(addForm.length) : null,
        height: addForm.height ? parseInt(addForm.height) : null,
        base_price,
        leg_height_price: parseFloat(parseCurrencyInput(addForm.leg_height_price)) || 0,
        enclosed_sides_price: parseFloat(parseCurrencyInput(addForm.enclosed_sides_price)) || 0,
        enclosed_ends_price: parseFloat(parseCurrencyInput(addForm.enclosed_ends_price)) || 0,
      });
      setAddForm({ style_id: styles[0]?.style_id ?? "", width: "", length: "", height: "", base_price: "", leg_height_price: "", enclosed_sides_price: "", enclosed_ends_price: "" });
      setAddOpen(false);
      toastSuccess("Base price added");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  };

  const handleStartEdit = useCallback((row) => {
    setEditingId(row.matrix_price_id);
    setEditForm({ style_id: row.style_id ?? "", width: row.width ?? "", length: row.length ?? "", height: row.height ?? "", base_price: formatCurrencyInput(row.base_price ?? ""), leg_height_price: formatCurrencyInput(row.leg_height_price ?? ""), enclosed_sides_price: formatCurrencyInput(row.enclosed_sides_price ?? ""), enclosed_ends_price: formatCurrencyInput(row.enclosed_ends_price ?? "") });
  }, []);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditForm({ style_id: "", width: "", length: "", height: "", base_price: "", leg_height_price: "", enclosed_sides_price: "", enclosed_ends_price: "" });
  }, []);

  const handleSave = useCallback(async () => {
    const base_price = parseFloat(parseCurrencyInput(editForm.base_price));
    if (isNaN(base_price) || base_price <= 0) { toastError("Base Price is required"); return; }
    try {
      await upsertMatrixPrice({
        matrix_price_id: editingId,
        feature_id: featureId,
        style_id: editForm.style_id ? parseInt(editForm.style_id) : null,
        width: editForm.width ? parseInt(editForm.width) : null,
        length: editForm.length ? parseInt(editForm.length) : null,
        height: editForm.height ? parseInt(editForm.height) : null,
        base_price,
        leg_height_price: parseFloat(parseCurrencyInput(editForm.leg_height_price)) || 0,
        enclosed_sides_price: parseFloat(parseCurrencyInput(editForm.enclosed_sides_price)) || 0,
        enclosed_ends_price: parseFloat(parseCurrencyInput(editForm.enclosed_ends_price)) || 0,
      });
      setEditingId(null);
      setEditForm({ style_id: "", width: "", length: "", height: "", base_price: "", leg_height_price: "", enclosed_sides_price: "", enclosed_ends_price: "" });
      toastSuccess("Price row updated");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  }, [editingId, editForm, featureId, onRefresh]);

  const handleDelete = useCallback(async (row) => {
    try {
      await deleteMatrixPrice(row.matrix_price_id);
      toastSuccess("Price row deleted");
      await onRefresh();
    } catch (err) { toastError(err.message); }
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
      key: "size", label: "Size (WxLxH)", width: 200, sortable: true,
      sortValue: (row) => `${row.width ?? 0}-${row.length ?? 0}-${row.height ?? 0}`,
      render: (row) => editingId === row.matrix_price_id
        ? <div className="d-flex gap-1 align-items-center">
            <input type="number" className="form-control form-control-sm" style={{ width: 55 }} placeholder="W" value={editForm.width} onChange={(e) => setEditForm((p) => ({ ...p, width: e.target.value.replace(/[^0-9]/g, "") }))} />
            <span>x</span>
            <input type="number" className="form-control form-control-sm" style={{ width: 55 }} placeholder="L" value={editForm.length} onChange={(e) => setEditForm((p) => ({ ...p, length: e.target.value.replace(/[^0-9]/g, "") }))} />
            <span>x</span>
            <input type="number" className="form-control form-control-sm" style={{ width: 55 }} placeholder="H" value={editForm.height} onChange={(e) => setEditForm((p) => ({ ...p, height: e.target.value.replace(/[^0-9]/g, "") }))} />
          </div>
        : `${row.width ?? "-"} x ${row.length ?? "-"} x ${row.height ?? "-"}`,
    },
    {
      key: "base_price", label: "Base Price", width: 130, sortable: true,
      render: (row) => editingId === row.matrix_price_id
        ? <input className="form-control form-control-sm" value={editForm.base_price} onChange={(e) => setEditForm((p) => ({ ...p, base_price: formatCurrencyInput(e.target.value) }))} />
        : formatCurrency(row.base_price),
    },
    {
      key: "leg_height_price", label: "Leg Height", width: 130, sortable: true,
      render: (row) => editingId === row.matrix_price_id
        ? <input className="form-control form-control-sm" value={editForm.leg_height_price} onChange={(e) => setEditForm((p) => ({ ...p, leg_height_price: formatCurrencyInput(e.target.value) }))} />
        : formatCurrency(row.leg_height_price),
    },
    {
      key: "enclosed_sides_price", label: "Encl. Sides", width: 130, sortable: true,
      render: (row) => editingId === row.matrix_price_id
        ? <input className="form-control form-control-sm" value={editForm.enclosed_sides_price} onChange={(e) => setEditForm((p) => ({ ...p, enclosed_sides_price: formatCurrencyInput(e.target.value) }))} />
        : formatCurrency(row.enclosed_sides_price),
    },
    {
      key: "enclosed_ends_price", label: "Encl. Ends", width: 130, sortable: true,
      render: (row) => editingId === row.matrix_price_id
        ? <input className="form-control form-control-sm" value={editForm.enclosed_ends_price} onChange={(e) => setEditForm((p) => ({ ...p, enclosed_ends_price: formatCurrencyInput(e.target.value) }))} />
        : formatCurrency(row.enclosed_ends_price),
    },
  ], [editingId, editForm, styles]);

  const matrixActions = useMemo(() => [
    { key: "edit-price", label: "Edit", type: "secondary", icon: "pen", visible: (r) => editingId !== r.matrix_price_id, onClick: (r) => handleStartEdit(r) },
    { key: "save-price", label: "Save", type: "primary", icon: "floppy-disk", visible: (r) => editingId === r.matrix_price_id, onClick: () => handleSave() },
    { key: "cancel-price", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => editingId === r.matrix_price_id, onClick: () => handleCancel() },
    { key: "delete-price", label: "Delete", type: "danger", icon: "trash", visible: (r) => editingId !== r.matrix_price_id, confirm: true, confirmMessage: (r) => `Delete price row (${r.style_name} ${r.width ?? "—"} × ${r.length ?? "—"} × ${r.height ?? "—"})?`, onClick: (r) => handleDelete(r) },
  ], [editingId, handleStartEdit, handleSave, handleCancel, handleDelete]);

  const styleFilterOptions = useMemo(() => styles.map((s) => ({ label: s.name, value: s.name })), [styles]);

  const matrixFilterConfig = useMemo(() => createFilterConfig([
    { key: "style_name", label: "Style", type: TABLE_FILTER_TYPES.SELECT, options: styleFilterOptions },
    { key: "size", label: "Size", type: TABLE_FILTER_TYPES.TEXT },
    { key: "base_price_display", label: "Base Price", type: TABLE_FILTER_TYPES.TEXT },
  ]), [styleFilterOptions]);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="mb-0">Matrix Prices ({prices.length} rows)</h6>
        <Button size="sm" onClick={() => setAddOpen(true)}>+ Add Base</Button>
      </div>
      <div className="mb-3 psb-hide-search">
        <TableZ columns={matrixColumns} data={sortedPrices} rowIdKey="matrix_price_id" actions={matrixActions} emptyMessage="No matrix prices found." filterConfig={matrixFilterConfig} />
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
            <div className="col">
              <label className="form-label small mb-1">Height</label>
              <input type="number" className="form-control form-control-sm" value={addForm.height} onChange={(e) => setAddForm({ ...addForm, height: e.target.value.replace(/[^0-9]/g, "") })} />
            </div>
          </div>
          <div className="row g-2 mb-3">
            <div className="col-3">
              <label className="form-label small mb-1">Base Price ($) *</label>
              <input className="form-control form-control-sm" value={addForm.base_price} onChange={(e) => setAddForm({ ...addForm, base_price: formatCurrencyInput(e.target.value) })} />
            </div>
            <div className="col">
              <label className="form-label small mb-1">Leg Height ($)</label>
              <input className="form-control form-control-sm" value={addForm.leg_height_price} onChange={(e) => setAddForm({ ...addForm, leg_height_price: formatCurrencyInput(e.target.value) })} />
            </div>
            <div className="col">
              <label className="form-label small mb-1">Encl. Sides ($)</label>
              <input className="form-control form-control-sm" value={addForm.enclosed_sides_price} onChange={(e) => setAddForm({ ...addForm, enclosed_sides_price: formatCurrencyInput(e.target.value) })} />
            </div>
            <div className="col">
              <label className="form-label small mb-1">Encl. Ends ($)</label>
              <input className="form-control form-control-sm" value={addForm.enclosed_ends_price} onChange={(e) => setAddForm({ ...addForm, enclosed_ends_price: formatCurrencyInput(e.target.value) })} />
            </div>
          </div>
          <div className="d-flex justify-content-end">
            <Button size="sm" onClick={handleAdd}>Add</Button>
          </div>
        </Modal>
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

function OptionsEditor({ featureId, options, onRefresh }) {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", price: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", price: "" });

  const handleAdd = async () => {
    if (!addForm.name.trim()) { toastError("Option name required"); return; }
    const price = parseFloat(addForm.price);
    if (isNaN(price)) { toastError("Price required"); return; }
    try {
      await upsertOption({ feature_id: featureId, name: addForm.name.trim(), price });
      setAddForm({ name: "", price: "" });
      setAddOpen(false);
      toastSuccess("Option added");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  };

  const handleStartEdit = useCallback((row) => {
    setEditingId(row.option_id);
    setEditForm({ name: row.name ?? "", price: row.price ?? "" });
  }, []);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setEditForm({ name: "", price: "" });
  }, []);

  const handleSave = useCallback(async () => {
    if (!editForm.name.trim()) { toastError("Option name required"); return; }
    const price = parseFloat(editForm.price);
    if (isNaN(price)) { toastError("Price required"); return; }
    try {
      await upsertOption({ option_id: editingId, feature_id: featureId, name: editForm.name.trim(), price });
      setEditingId(null);
      setEditForm({ name: "", price: "" });
      toastSuccess("Option updated");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  }, [editingId, editForm, featureId, onRefresh]);

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
      key: "price", label: "Price", width: 140, sortable: true,
      render: (row) => editingId === row.option_id
        ? <input className="form-control form-control-sm" value={editForm.price} onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))} />
        : formatCurrency(row.price),
    },
  ], [editingId, editForm]);

  const optionsActions = useMemo(() => [
    { key: "edit-option", label: "Edit", type: "secondary", icon: "pen", visible: (r) => editingId !== r.option_id, onClick: (r) => handleStartEdit(r) },
    { key: "save-option", label: "Save", type: "primary", icon: "floppy-disk", visible: (r) => editingId === r.option_id, onClick: () => handleSave() },
    { key: "cancel-option", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => editingId === r.option_id, onClick: () => handleCancel() },
    { key: "delete-option", label: "Delete", type: "danger", icon: "trash", visible: (r) => editingId !== r.option_id, confirm: true, confirmMessage: (r) => `Delete option "${r.name}"?`, onClick: (r) => handleDelete(r) },
  ], [editingId, handleStartEdit, handleSave, handleCancel, handleDelete]);

  const optionsFilterConfig = useMemo(() => createFilterConfig([
    { key: "name", label: "Option Name", type: TABLE_FILTER_TYPES.TEXT },
    { key: "price", label: "Price", type: TABLE_FILTER_TYPES.TEXT },
  ]), []);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="mb-0">Fixed Options ({options.length})</h6>
        <Button size="sm" onClick={() => setAddOpen(true)}>+ Add Option</Button>
      </div>
      <div className="mb-3 psb-hide-search">
        <TableZ columns={optionsColumns} data={options} rowIdKey="option_id" actions={optionsActions} emptyMessage="No options found." filterConfig={optionsFilterConfig} />
      </div>
      <Modal title="Add Option" show={addOpen} onHide={() => setAddOpen(false)}>
        <div className="d-flex gap-2 align-items-end flex-wrap">
          <div style={{ flex: 2, minWidth: 180 }}>
            <label className="form-label small mb-1">Option Name *</label>
            <input className="form-control form-control-sm" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label className="form-label small mb-1">Price ($) *</label>
            <input className="form-control form-control-sm" value={addForm.price} onChange={(e) => setAddForm({ ...addForm, price: e.target.value })} />
          </div>
          <div>
            <Button size="sm" onClick={handleAdd}>Add</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── PANEL EDITOR ──────────────────────────────────────────

function PanelEditor({ featureId, locations, panelOptions, onRefresh }) {
  // ─── Location state ─────────────────────────────────
  const [locEditId, setLocEditId] = useState(null);
  const [locEditForm, setLocEditForm] = useState({ name: "", location_type: "", sort_order: "" });
  const [locAddOpen, setLocAddOpen] = useState(false);
  const [locAddForm, setLocAddForm] = useState({ name: "", location_type: "end", sort_order: "" });

  // ─── Option state ───────────────────────────────────
  const [optEditId, setOptEditId] = useState(null);
  const [optEditForm, setOptEditForm] = useState({ location_type: "", name: "", price_per_foot: "" });
  const [optAddOpen, setOptAddOpen] = useState(false);
  const [optAddForm, setOptAddForm] = useState({ location_type: "end", name: "", price_per_foot: "" });

  // ─── Location handlers ──────────────────────────────
  const handleLocStartEdit = useCallback((row) => {
    setLocEditId(row.location_id);
    setLocEditForm({ name: row.name ?? "", location_type: row.location_type ?? "", sort_order: row.sort_order ?? "" });
  }, []);

  const handleLocCancel = useCallback(() => {
    setLocEditId(null);
    setLocEditForm({ name: "", location_type: "", sort_order: "" });
  }, []);

  const handleLocSave = useCallback(async () => {
    if (!locEditForm.name.trim()) { toastError("Name is required"); return; }
    try {
      await upsertPanelLocation({ location_id: locEditId, feature_id: featureId, name: locEditForm.name.trim(), location_type: locEditForm.location_type, sort_order: locEditForm.sort_order ? parseInt(locEditForm.sort_order) : 0 });
      setLocEditId(null);
      toastSuccess("Location updated");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  }, [locEditId, locEditForm, featureId, onRefresh]);

  const handleLocAdd = async () => {
    if (!locAddForm.name.trim()) { toastError("Name is required"); return; }
    try {
      await upsertPanelLocation({ feature_id: featureId, name: locAddForm.name.trim(), location_type: locAddForm.location_type, sort_order: locAddForm.sort_order ? parseInt(locAddForm.sort_order) : 0 });
      setLocAddForm({ name: "", location_type: "end", sort_order: "" });
      setLocAddOpen(false);
      toastSuccess("Location added");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  };

  // ─── Option handlers ────────────────────────────────
  const handleOptStartEdit = useCallback((row) => {
    setOptEditId(row.option_id);
    setOptEditForm({ location_type: row.location_type ?? "", name: row.name ?? "", price_per_foot: row.price_per_foot ?? "" });
  }, []);

  const handleOptCancel = useCallback(() => {
    setOptEditId(null);
    setOptEditForm({ location_type: "", name: "", price_per_foot: "" });
  }, []);

  const handleOptSave = useCallback(async () => {
    if (!optEditForm.name.trim()) { toastError("Option name required"); return; }
    const ppf = parseFloat(optEditForm.price_per_foot);
    if (isNaN(ppf) || ppf < 0) { toastError("Price per foot required"); return; }
    try {
      await upsertPanelOption({ option_id: optEditId, feature_id: featureId, location_type: optEditForm.location_type, name: optEditForm.name.trim(), price_per_foot: ppf });
      setOptEditId(null);
      toastSuccess("Option updated");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  }, [optEditId, optEditForm, featureId, onRefresh]);

  const handleOptAdd = async () => {
    if (!optAddForm.name.trim()) { toastError("Option name required"); return; }
    const ppf = parseFloat(optAddForm.price_per_foot);
    if (isNaN(ppf) || ppf < 0) { toastError("Price per foot required"); return; }
    try {
      await upsertPanelOption({ feature_id: featureId, location_type: optAddForm.location_type, name: optAddForm.name.trim(), price_per_foot: ppf });
      setOptAddForm({ location_type: "end", name: "", price_per_foot: "" });
      setOptAddOpen(false);
      toastSuccess("Panel option added");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  };

  const handleOptDelete = useCallback(async (row) => {
    try {
      await deletePanelOption(row.option_id);
      toastSuccess("Option removed");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  }, [onRefresh]);

  // ─── Location columns & actions ─────────────────────
  const locationColumns = useMemo(() => [
    {
      key: "name", label: "Location Name", width: 250, sortable: true,
      render: (row) => locEditId === row.location_id
        ? <input className="form-control form-control-sm" value={locEditForm.name} onChange={(e) => setLocEditForm((p) => ({ ...p, name: e.target.value }))} />
        : row.name,
    },
    {
      key: "location_type", label: "Type", width: 140, sortable: true,
      render: (row) => locEditId === row.location_id
        ? <select className="form-select form-select-sm" value={locEditForm.location_type} onChange={(e) => setLocEditForm((p) => ({ ...p, location_type: e.target.value }))}>
            <option value="end">end</option>
            <option value="side">side</option>
          </select>
        : row.location_type,
    },
  ], [locEditId, locEditForm]);

  const locationActions = useMemo(() => [
    { key: "edit-loc", label: "Edit", type: "secondary", icon: "pen", visible: (r) => locEditId !== r.location_id, onClick: (r) => handleLocStartEdit(r) },
    { key: "save-loc", label: "Save", type: "primary", icon: "floppy-disk", visible: (r) => locEditId === r.location_id, onClick: () => handleLocSave() },
    { key: "cancel-loc", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => locEditId === r.location_id, onClick: () => handleLocCancel() },
  ], [locEditId, handleLocStartEdit, handleLocSave, handleLocCancel]);

  const locationFilterConfig = useMemo(() => createFilterConfig([
    { key: "name", label: "Name", type: TABLE_FILTER_TYPES.TEXT },
    { key: "location_type", label: "Type", type: TABLE_FILTER_TYPES.SELECT, options: [{ label: "end", value: "end" }, { label: "side", value: "side" }] },
  ]), []);

  // ─── Option columns & actions ───────────────────────
  const panelColumns = useMemo(() => [
    {
      key: "location_type", label: "Type", width: 120, sortable: true,
      render: (row) => optEditId === row.option_id
        ? <select className="form-select form-select-sm" value={optEditForm.location_type} onChange={(e) => setOptEditForm((p) => ({ ...p, location_type: e.target.value }))}>
            <option value="end">end</option>
            <option value="side">side</option>
          </select>
        : row.location_type,
    },
    {
      key: "name", label: "Option Name", width: 200, sortable: true,
      render: (row) => optEditId === row.option_id
        ? <input className="form-control form-control-sm" value={optEditForm.name} onChange={(e) => setOptEditForm((p) => ({ ...p, name: e.target.value }))} />
        : row.name,
    },
    {
      key: "price_per_foot", label: "$/foot", width: 120, sortable: true,
      render: (row) => optEditId === row.option_id
        ? <input className="form-control form-control-sm" value={optEditForm.price_per_foot} onChange={(e) => setOptEditForm((p) => ({ ...p, price_per_foot: e.target.value }))} />
        : formatCurrency(row.price_per_foot),
    },
  ], [optEditId, optEditForm]);

  const panelActions = useMemo(() => [
    { key: "edit-opt", label: "Edit", type: "secondary", icon: "pen", visible: (r) => optEditId !== r.option_id, onClick: (r) => handleOptStartEdit(r) },
    { key: "save-opt", label: "Save", type: "primary", icon: "floppy-disk", visible: (r) => optEditId === r.option_id, onClick: () => handleOptSave() },
    { key: "cancel-opt", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => optEditId === r.option_id, onClick: () => handleOptCancel() },
    { key: "delete-opt", label: "Delete", type: "danger", icon: "trash", visible: (r) => optEditId !== r.option_id, confirm: true, confirmMessage: (r) => `Delete option "${r.name}" (${r.location_type})?`, onClick: (r) => handleOptDelete(r) },
  ], [optEditId, handleOptStartEdit, handleOptSave, handleOptCancel, handleOptDelete]);

  const optionFilterConfig = useMemo(() => createFilterConfig([
    { key: "location_type", label: "Type", type: TABLE_FILTER_TYPES.SELECT, options: [{ label: "end", value: "end" }, { label: "side", value: "side" }] },
    { key: "name", label: "Option Name", type: TABLE_FILTER_TYPES.TEXT },
    { key: "price_per_foot", label: "$/foot", type: TABLE_FILTER_TYPES.TEXT },
  ]), []);

  const sortedOptions = useMemo(
    () => [...panelOptions].sort((a, b) => (a.location_type ?? "").localeCompare(b.location_type ?? "") || (a.name ?? "").localeCompare(b.name ?? "")),
    [panelOptions],
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="mb-0">Panel Locations ({locations.length})</h6>
        <Button size="sm" onClick={() => setLocAddOpen(true)}>+ Add Location</Button>
      </div>
      <div className="mb-3 psb-hide-search">
        <TableZ columns={locationColumns} data={locations} rowIdKey="location_id" actions={locationActions} emptyMessage="No panel locations found." filterConfig={locationFilterConfig} />
      </div>
      <Modal title="Add Location" show={locAddOpen} onHide={() => setLocAddOpen(false)}>
        <div className="d-flex gap-2 align-items-end flex-wrap">
          <div style={{ flex: 2, minWidth: 180 }}>
            <label className="form-label small mb-1">Name *</label>
            <input className="form-control form-control-sm" value={locAddForm.name} onChange={(e) => setLocAddForm({ ...locAddForm, name: e.target.value })} />
          </div>
          <div style={{ minWidth: 100 }}>
            <label className="form-label small mb-1">Type *</label>
            <select className="form-select form-select-sm" value={locAddForm.location_type} onChange={(e) => setLocAddForm({ ...locAddForm, location_type: e.target.value })}>
              <option value="end">end</option>
              <option value="side">side</option>
            </select>
          </div>
          <div>
            <Button size="sm" onClick={handleLocAdd}>Add</Button>
          </div>
        </div>
      </Modal>

      <div className="d-flex justify-content-between align-items-center mb-2 mt-4">
        <h6 className="mb-0">Panel Options ({panelOptions.length})</h6>
        <Button size="sm" onClick={() => setOptAddOpen(true)}>+ Add Option</Button>
      </div>
      <div className="mb-3 psb-hide-search">
        <TableZ columns={panelColumns} data={sortedOptions} rowIdKey="option_id" actions={panelActions} emptyMessage="No panel options found." filterConfig={optionFilterConfig} />
      </div>
      <Modal title="Add Panel Option" show={optAddOpen} onHide={() => setOptAddOpen(false)}>
        <div className="d-flex gap-2 align-items-end flex-wrap">
          <div style={{ minWidth: 100 }}>
            <label className="form-label small mb-1">Type *</label>
            <select className="form-select form-select-sm" value={optAddForm.location_type} onChange={(e) => setOptAddForm({ ...optAddForm, location_type: e.target.value })}>
              <option value="end">end</option>
              <option value="side">side</option>
            </select>
          </div>
          <div style={{ flex: 2, minWidth: 180 }}>
            <label className="form-label small mb-1">Option Name *</label>
            <input className="form-control form-control-sm" value={optAddForm.name} onChange={(e) => setOptAddForm({ ...optAddForm, name: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label className="form-label small mb-1">$/foot *</label>
            <input className="form-control form-control-sm" value={optAddForm.price_per_foot} onChange={(e) => setOptAddForm({ ...optAddForm, price_per_foot: e.target.value })} />
          </div>
          <div>
            <Button size="sm" onClick={handleOptAdd}>Add</Button>
          </div>
        </div>
      </Modal>
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
        <Button size="sm" onClick={() => setAddGroupOpen(true)}>+ Add Group</Button>
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
                    <Button size="sm" variant="outline-primary" onClick={() => { setAddOptOpen(group.color_group_id); setAddOptForm({ name: "", hex_code: "#888888", upcharge: "0" }); }}>+ Add Color</Button>
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
      <Button size="sm" style={{ width: "100%" }} onClick={() => setOpen(true)}>
        <FontAwesomeIcon icon={faPlus} /> Add feature
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
