"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button, Card, Badge, Modal, Input, TableZ, TABLE_FILTER_TYPES, createFilterConfig, toastSuccess, toastError } from "@/shared/components/ui";
import { formatCurrency } from "../data/metalBuildings.data";
import {
  loadMatrixPrices,
  loadRate,
  loadOptions,
  loadPanelLocations,
  loadPanelOptions,
  createFeature,
  updateFeature,
  upsertMatrixPrice,
  deleteMatrixPrice,
  upsertRate,
  upsertOption,
  deleteOption,
  upsertPanelOption,
  deletePanelOption,
} from "../data/metalBuildings.actions";

export default function PricingView({ features: initialFeatures }) {
  const [features, setFeatures] = useState(initialFeatures);
  const [selectedId, setSelectedId] = useState(features[0]?.feature_id ?? null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const filtered = features.filter((f) => {
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase()) || (f.category || "").toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "ALL" || f.pricing_type === typeFilter;
    return matchSearch && matchType;
  });

  const selected = features.find((f) => f.feature_id === selectedId) ?? null;

  return (
    <main className="container-fluid py-4">
      <div className="row">
        {/* Left: Feature list */}
        <div className="col-md-4 col-lg-3">
          <Card>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0">Features</h5>
              <AddFeatureButton onCreated={(f) => { setFeatures((prev) => [...prev, f]); setSelectedId(f.feature_id); }} />
            </div>
            <input className="form-control form-control-sm mb-2" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="btn-group btn-group-sm w-100 mb-3">
              {["ALL", "MATRIX", "PANEL", "RATE", "FIXED"].map((t) => (
                <button key={t} className={`btn btn-outline-secondary ${typeFilter === t ? "active" : ""}`} onClick={() => setTypeFilter(t)}>{t}</button>
              ))}
            </div>
            <div className="list-group list-group-flush" style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {filtered.map((f) => (
                <button key={f.feature_id}
                  className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${selectedId === f.feature_id ? "active" : ""}`}
                  onClick={() => setSelectedId(f.feature_id)}>
                  <div>
                    <div className="fw-semibold small">{f.name}</div>
                    <small className="text-muted">{f.category}</small>
                  </div>
                  <Badge variant={f.is_active ? "success" : "secondary"}>{f.pricing_type}</Badge>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Right: Detail */}
        <div className="col-md-8 col-lg-9">
          {selected ? (
            <FeatureDetail feature={selected} onUpdated={(f) => setFeatures((prev) => prev.map((x) => x.feature_id === f.feature_id ? f : x))} />
          ) : (
            <Card><p className="text-muted">Select a feature to view pricing.</p></Card>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── FEATURE DETAIL ────────────────────────────────────────

function FeatureDetail({ feature, onUpdated }) {
  const [matrixPrices, setMatrixPrices] = useState([]);
  const [rate, setRate] = useState(null);
  const [options, setOptions] = useState([]);
  const [panelLocations, setPanelLocations] = useState([]);
  const [panelOptions, setPanelOptions] = useState([]);
  const [loading, setLoading] = useState(true);

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
        } else if (feature.pricing_type === "FIXED") {
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

  return (
    <Card>
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h4 className="mb-1">{feature.name}</h4>
          <p className="text-muted small mb-0">{feature.description || "No description"}</p>
          <div className="mt-1">
            <Badge variant="info" className="me-1">{feature.pricing_type}</Badge>
            <Badge variant={feature.is_active ? "success" : "secondary"}>{feature.is_active ? "Active" : "Inactive"}</Badge>
          </div>
        </div>
        <Button variant={feature.is_active ? "outline-secondary" : "outline-success"} size="sm" onClick={toggleActive}>
          {feature.is_active ? "Deactivate" : "Activate"}
        </Button>
      </div>
      <hr />
      {loading ? (
        <p className="text-muted">Loading pricing data...</p>
      ) : (
        <>
          {feature.pricing_type === "MATRIX" && <MatrixEditor featureId={feature.feature_id} prices={matrixPrices} onRefresh={async () => setMatrixPrices(await loadMatrixPrices(feature.feature_id))} />}
          {feature.pricing_type === "PANEL" && <PanelEditor featureId={feature.feature_id} locations={panelLocations} panelOptions={panelOptions} onRefresh={async () => { setPanelLocations(await loadPanelLocations(feature.feature_id)); setPanelOptions(await loadPanelOptions(feature.feature_id)); }} />}
          {feature.pricing_type === "RATE" && <RateEditor featureId={feature.feature_id} rate={rate} onRefresh={async () => setRate(await loadRate(feature.feature_id))} />}
          {feature.pricing_type === "FIXED" && <OptionsEditor featureId={feature.feature_id} options={options} onRefresh={async () => setOptions(await loadOptions(feature.feature_id))} />}
        </>
      )}
    </Card>
  );
}

// ─── MATRIX EDITOR ─────────────────────────────────────────

function MatrixEditor({ featureId, prices, onRefresh }) {
  const [form, setForm] = useState({ width: "", length: "", height: "", price: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ width: "", length: "", height: "", price: "" });

  const sortedPrices = useMemo(
    () => [...prices].sort((a, b) => (a.width ?? 0) - (b.width ?? 0) || (a.length ?? 0) - (b.length ?? 0) || (a.height ?? 0) - (b.height ?? 0)),
    [prices],
  );

  const handleAdd = async () => {
    const price = parseFloat(form.price);
    if (isNaN(price) || price <= 0) { toastError("Price is required"); return; }
    try {
      await upsertMatrixPrice({
        feature_id: featureId,
        width: form.width ? parseInt(form.width) : null,
        length: form.length ? parseInt(form.length) : null,
        height: form.height ? parseInt(form.height) : null,
        price,
      });
      setForm({ width: "", length: "", height: "", price: "" });
      toastSuccess("Price row added");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  };

  const handleDelete = useCallback(async (row) => {
    try {
      await deleteMatrixPrice(row.matrix_price_id);
      toastSuccess("Price row deleted");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  }, [onRefresh]);

  const handleStartEdit = useCallback((row) => {
    setEditingId(row.matrix_price_id);
    setEditForm({ width: row.width ?? "", length: row.length ?? "", height: row.height ?? "", price: row.price ?? "" });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm({ width: "", length: "", height: "", price: "" });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    const price = parseFloat(editForm.price);
    if (isNaN(price) || price <= 0) { toastError("Price is required"); return; }
    try {
      await upsertMatrixPrice({
        matrix_price_id: editingId,
        feature_id: featureId,
        width: editForm.width ? parseInt(editForm.width) : null,
        length: editForm.length ? parseInt(editForm.length) : null,
        height: editForm.height ? parseInt(editForm.height) : null,
        price,
      });
      setEditingId(null);
      setEditForm({ width: "", length: "", height: "", price: "" });
      toastSuccess("Price row updated");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  }, [editingId, editForm, featureId, onRefresh]);

  const matrixColumns = useMemo(() => [
    {
      key: "width", label: "Width", width: 120, sortable: true,
      render: (row) => editingId === row.matrix_price_id
        ? <input className="form-control form-control-sm" value={editForm.width} onChange={(e) => setEditForm((p) => ({ ...p, width: e.target.value }))} />
        : row.width ?? "—",
    },
    {
      key: "length", label: "Length", width: 120, sortable: true,
      render: (row) => editingId === row.matrix_price_id
        ? <input className="form-control form-control-sm" value={editForm.length} onChange={(e) => setEditForm((p) => ({ ...p, length: e.target.value }))} />
        : row.length ?? "—",
    },
    {
      key: "height", label: "Height", width: 120, sortable: true,
      render: (row) => editingId === row.matrix_price_id
        ? <input className="form-control form-control-sm" value={editForm.height} onChange={(e) => setEditForm((p) => ({ ...p, height: e.target.value }))} />
        : row.height ?? "—",
    },
    {
      key: "price", label: "Price", width: 140, sortable: true,
      render: (row) => editingId === row.matrix_price_id
        ? <input className="form-control form-control-sm" value={editForm.price} onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))} />
        : formatCurrency(row.price),
    },
  ], [editingId, editForm]);

  const matrixActions = useMemo(() => [
    { key: "edit-price", label: "Edit", type: "secondary", icon: "pen", visible: (r) => editingId !== r.matrix_price_id, onClick: (r) => handleStartEdit(r) },
    { key: "save-price", label: "Save", type: "primary", icon: "floppy-disk", visible: (r) => editingId === r.matrix_price_id, onClick: () => handleSaveEdit() },
    { key: "cancel-price", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => editingId === r.matrix_price_id, onClick: () => handleCancelEdit() },
    { key: "delete-price", label: "Delete", type: "danger", icon: "trash", visible: (r) => editingId !== r.matrix_price_id, confirm: true, confirmMessage: (r) => `Delete price row (${r.width ?? "—"} × ${r.length ?? "—"} × ${r.height ?? "—"})?`, onClick: (r) => handleDelete(r) },
  ], [editingId, handleStartEdit, handleSaveEdit, handleCancelEdit, handleDelete]);

  const matrixFilterConfig = useMemo(() => createFilterConfig([
    { key: "width", label: "Width", type: TABLE_FILTER_TYPES.TEXT },
    { key: "length", label: "Length", type: TABLE_FILTER_TYPES.TEXT },
    { key: "height", label: "Height", type: TABLE_FILTER_TYPES.TEXT },
    { key: "price", label: "Price", type: TABLE_FILTER_TYPES.TEXT },
  ]), []);

  return (
    <div>
      <h6>Matrix Prices ({prices.length} rows)</h6>
      <Card className="mb-3 p-3 bg-light">
        <div className="d-flex gap-2 align-items-end flex-wrap">
          <div>
            <label className="form-label small mb-1">Width</label>
            <input className="form-control form-control-sm" style={{ width: 90 }} value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} />
          </div>
          <div>
            <label className="form-label small mb-1">Length</label>
            <input className="form-control form-control-sm" style={{ width: 90 }} value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} />
          </div>
          <div>
            <label className="form-label small mb-1">Height</label>
            <input className="form-control form-control-sm" style={{ width: 90 }} value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} />
          </div>
          <div>
            <label className="form-label small mb-1">Price ($)</label>
            <input className="form-control form-control-sm" style={{ width: 110 }} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <Button size="sm" className="align-self-end" onClick={handleAdd}>+ Add Row</Button>
        </div>
      </Card>
      <div className="mb-3 psb-hide-search">
        <TableZ columns={matrixColumns} data={sortedPrices} rowIdKey="matrix_price_id" actions={matrixActions} emptyMessage="No matrix prices found." filterConfig={matrixFilterConfig} />
      </div>
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
            <option value="linear_ft">linear ft</option>
          </select>
        </div>
        <Button size="sm" onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
}

// ─── OPTIONS EDITOR ────────────────────────────────────────

function OptionsEditor({ featureId, options, onRefresh }) {
  const [form, setForm] = useState({ name: "", price: "" });

  const handleAdd = async () => {
    if (!form.name.trim()) { toastError("Option name required"); return; }
    const price = parseFloat(form.price);
    if (isNaN(price) || price <= 0) { toastError("Price required"); return; }
    try {
      await upsertOption({ feature_id: featureId, name: form.name.trim(), price });
      setForm({ name: "", price: "" });
      toastSuccess("Option added");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  };

  const handleDelete = useCallback(async (optionId) => {
    try {
      await deleteOption(optionId);
      toastSuccess("Option removed");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  }, [onRefresh]);

  const optionsColumns = useMemo(() => [
    { key: "name", label: "Option Name", width: 250, sortable: true },
    { key: "price", label: "Price", width: 140, sortable: true, render: (row) => formatCurrency(row.price) },
  ], []);

  const optionsActions = useMemo(() => [
    { key: "delete-option", label: "Delete", type: "danger", icon: "trash", onClick: (row) => handleDelete(row.option_id) },
  ], [handleDelete]);

  return (
    <div>
      <h6>Fixed Options ({options.length})</h6>
      <div className="mb-3">
        <TableZ columns={optionsColumns} data={options} rowIdKey="option_id" actions={optionsActions} emptyMessage="No options found." />
      </div>
      <div className="d-flex gap-2 align-items-end">
        <input className="form-control form-control-sm" style={{ width: 200 }} placeholder="Option name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="form-control form-control-sm" style={{ width: 100 }} placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <Button size="sm" onClick={handleAdd}>Add</Button>
      </div>
    </div>
  );
}

// ─── PANEL EDITOR ──────────────────────────────────────────

function PanelEditor({ featureId, locations, panelOptions, onRefresh }) {
  const [form, setForm] = useState({ location_type: "end", name: "", price_per_foot: "" });

  const handleAdd = async () => {
    if (!form.name.trim()) { toastError("Option name required"); return; }
    const ppf = parseFloat(form.price_per_foot);
    if (isNaN(ppf) || ppf < 0) { toastError("Price per foot required"); return; }
    try {
      await upsertPanelOption({ feature_id: featureId, location_type: form.location_type, name: form.name.trim(), price_per_foot: ppf });
      setForm({ location_type: "end", name: "", price_per_foot: "" });
      toastSuccess("Panel option added");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  };

  const handleDelete = useCallback(async (optionId) => {
    try {
      await deletePanelOption(optionId);
      toastSuccess("Option removed");
      await onRefresh();
    } catch (err) { toastError(err.message); }
  }, [onRefresh]);

  const panelColumns = useMemo(() => [
    { key: "location_type", label: "Type", width: 120, sortable: true, render: (row) => <Badge variant="info">{row.location_type}</Badge> },
    { key: "name", label: "Option Name", width: 200, sortable: true },
    { key: "price_per_foot", label: "$/foot", width: 120, sortable: true, render: (row) => formatCurrency(row.price_per_foot) },
  ], []);

  const locationColumns = useMemo(() => [
    { key: "name", label: "Location Name", width: 250, sortable: true },
    { key: "location_type", label: "Type", width: 140, sortable: true, render: (row) => <Badge variant="info">{row.location_type}</Badge> },
  ], []);

  const panelActions = useMemo(() => [
    { key: "delete-panel-option", label: "Delete", type: "danger", icon: "trash", onClick: (row) => handleDelete(row.option_id) },
  ], [handleDelete]);

  return (
    <div>
      <h6>Panel Locations ({locations.length})</h6>
      <div className="mb-3">
        <TableZ columns={locationColumns} data={locations} rowIdKey="location_id" showActionColumn={false} emptyMessage="No panel locations found." />
      </div>

      <h6>Panel Options ({panelOptions.length})</h6>
      <div className="mb-3">
        <TableZ columns={panelColumns} data={panelOptions} rowIdKey="option_id" actions={panelActions} emptyMessage="No panel options found." />
      </div>

      <div className="d-flex gap-2 align-items-end flex-wrap">
        <select className="form-select form-select-sm" style={{ width: 100 }} value={form.location_type} onChange={(e) => setForm({ ...form, location_type: e.target.value })}>
          <option value="end">End</option>
          <option value="side">Side</option>
        </select>
        <input className="form-control form-control-sm" style={{ width: 180 }} placeholder="Option name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="form-control form-control-sm" style={{ width: 100 }} placeholder="$/foot" value={form.price_per_foot} onChange={(e) => setForm({ ...form, price_per_foot: e.target.value })} />
        <Button size="sm" onClick={handleAdd}>Add</Button>
      </div>
    </div>
  );
}

// ─── ADD FEATURE BUTTON ────────────────────────────────────

function AddFeatureButton({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", pricing_type: "MATRIX", category: "", description: "" });

  const handleCreate = async () => {
    if (!form.name.trim()) { toastError("Name is required"); return; }
    try {
      const created = await createFeature(form);
      toastSuccess(`Feature "${created.name}" created`);
      onCreated(created);
      setOpen(false);
      setForm({ name: "", pricing_type: "MATRIX", category: "", description: "" });
    } catch (err) { toastError(err.message); }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New</Button>
      {open && (
        <Modal title="Add Feature" onClose={() => setOpen(false)}>
          <div className="mb-2">
            <label className="form-label small">Name *</label>
            <input className="form-control form-control-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="mb-2">
            <label className="form-label small">Pricing Type *</label>
            <select className="form-select form-select-sm" value={form.pricing_type} onChange={(e) => setForm({ ...form, pricing_type: e.target.value })}>
              <option value="MATRIX">MATRIX</option>
              <option value="PANEL">PANEL</option>
              <option value="RATE">RATE</option>
              <option value="FIXED">FIXED</option>
            </select>
          </div>
          <div className="mb-2">
            <label className="form-label small">Category</label>
            <input className="form-control form-control-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div className="mb-3">
            <label className="form-label small">Description</label>
            <input className="form-control form-control-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="outline-secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate}>Create</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
