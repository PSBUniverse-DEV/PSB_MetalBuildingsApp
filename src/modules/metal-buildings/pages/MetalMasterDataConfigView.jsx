"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, InlineEditCell, Input, Modal, StatusBadge, TableZ, TABLE_FILTER_TYPES, createFilterConfig, toastError, toastSuccess } from "@/shared/components/ui";
import FileAttachments from "@/shared/components/ui/files/FileAttachments";
import { DOCUMENT_TYPE_LIST } from "../data/documentTypes";
import { listDocuments, createDocumentUpload, saveDocument, getDocumentUrl, deleteDocument, listDocumentSummaries, updateDocumentTypeSorts } from "../data/documents.actions";
import { getSupabase } from "@/core/supabase/client";
import {
  listSnowLoads,
  lookupSnowLoadCoordinates,
  createSnowLoad,
  updateSnowLoad,
  deleteSnowLoad,
  importSnowLoads,
} from "../data/snowLoadConfig.actions";

// Master Data → Documents: one table row per document type
// (data/documentTypes.js). Files are managed in a modal (FileAttachments).
const PRINT_POSITION_LABELS = { "after-order": "After order", "after-images": "After images", end: "End" };

// Master Data → Snow Load (metal_s_snowload_data). Server-side ZIP-prefix
// search (table can be large), immediate CRUD, coordinates looked up from the
// ZIP (GeoNames → offline zipcodes-us).
const EMPTY_SNOW_DRAFT = { zip_code: "", snow_load: "", latitude: "", longitude: "" };
const fmtZip = (z) => (z == null ? "" : String(z).padStart(5, "0"));

// ─── Master Data table filters (TableZ Filter Toolbar) ───
// text = contains (case-insensitive); select = exact String(row[key]) match.
const STATUS_FILTER = {
  key: "is_active_bool", label: "Status", type: TABLE_FILTER_TYPES.SELECT,
  options: [{ label: "Active", value: "true" }, { label: "Inactive", value: "false" }],
};
// Distinct non-empty values of row[key] as select options (sorted, numeric-aware).
const distinctOptions = (rows, key) =>
  [...new Set((rows || []).map((r) => String(r?.[key] ?? "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((v) => ({ label: v, value: v }));

const REGION_FILTERS = createFilterConfig([
  { key: "name", label: "Region Name", type: TABLE_FILTER_TYPES.TEXT },
  { key: "state_code", label: "State Code", type: TABLE_FILTER_TYPES.TEXT },
  { key: "multiplier", label: "Multiplier", type: TABLE_FILTER_TYPES.TEXT },
  STATUS_FILTER,
]);
const CATEGORY_FILTERS = createFilterConfig([
  { key: "name", label: "Category Name", type: TABLE_FILTER_TYPES.TEXT },
  { key: "description", label: "Description", type: TABLE_FILTER_TYPES.TEXT },
  STATUS_FILTER,
]);
const STYLE_FILTERS = createFilterConfig([
  { key: "name", label: "Style Name", type: TABLE_FILTER_TYPES.TEXT },
  { key: "description", label: "Description", type: TABLE_FILTER_TYPES.TEXT },
  { key: "render_key", label: "Render Key", type: TABLE_FILTER_TYPES.TEXT },
  {
    key: "has_walls_bool", label: "Walls", type: TABLE_FILTER_TYPES.SELECT,
    options: [{ label: "Yes", value: "true" }, { label: "No", value: "false" }],
  },
  STATUS_FILTER,
]);
const CUSTOM_ADJUSTMENT_FILTERS = createFilterConfig([
  { key: "option_name", label: "Option Name", type: TABLE_FILTER_TYPES.TEXT },
  { key: "option_desctiption", label: "Description", type: TABLE_FILTER_TYPES.TEXT },
  STATUS_FILTER,
]);
const DOCUMENT_FILTERS = createFilterConfig([
  { key: "label", label: "Document", type: TABLE_FILTER_TYPES.TEXT },
  { key: "activeFileName", label: "Active File", type: TABLE_FILTER_TYPES.TEXT },
]);
const SNOW_LOAD_FILTERS = createFilterConfig([
  { key: "snow_load", label: "Snow Load (psf)", type: TABLE_FILTER_TYPES.TEXT },
  {
    key: "coords_status", label: "Coordinates", type: TABLE_FILTER_TYPES.SELECT,
    options: [{ label: "With coordinates", value: "with" }, { label: "Missing coordinates", value: "missing" }],
  },
]);

// Minimal CSV parser (quotes, commas, CRLF). Returns string[][].
function parseCsv(text) {
  const out = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => String(c).trim() !== ""));
}

const SNOW_CSV_HEADERS = {
  zip_code: ["zip_code", "zip", "zipcode", "zip code"],
  snow_load: ["snow_load", "snowload", "snow load", "psf"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "long", "lon"],
};

// CSV text → [{ line, zip_code, snow_load, latitude, longitude }] (header required).
function snowRowsFromCsv(text) {
  const grid = parseCsv(String(text ?? "").replace(/^\uFEFF/, ""));
  if (grid.length < 2) throw new Error("The file has no data rows.");
  const header = grid[0].map((h) => String(h).trim().toLowerCase());
  const idx = {};
  for (const [key, names] of Object.entries(SNOW_CSV_HEADERS)) idx[key] = header.findIndex((h) => names.includes(h));
  if (idx.zip_code < 0 || idx.snow_load < 0) throw new Error("Header must include zip_code and snow_load columns.");
  return grid.slice(1).map((cells, i) => ({
    line: i + 2,
    zip_code: cells[idx.zip_code],
    snow_load: cells[idx.snow_load],
    latitude: idx.latitude >= 0 ? cells[idx.latitude] : "",
    longitude: idx.longitude >= 0 ? cells[idx.longitude] : "",
  }));
}

function downloadSnowTemplate() {
  const csv = "zip_code,snow_load,latitude,longitude\n46001,50,,\n02134,40,42.3584,-71.1259\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "snow_load_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function SnowLoadSection() {
  const [rows, setRows] = useState(null); // null = loading
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(null); // { mode: "add" | "edit", row }
  const [draft, setDraft] = useState(EMPTY_SNOW_DRAFT);
  const [lookup, setLookup] = useState({ busy: false, note: "" });
  const [saving, setSaving] = useState(false);
  const lastLookupZip = useRef("");
  const importInputRef = useRef(null);
  const [importState, setImportState] = useState(null); // { rows, fileName } | { running, done, total } | { summary }

  const pickImportFile = () => importInputRef.current?.click();

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { toastError("Please choose a .csv file (Excel: Save As → CSV).", "Snow Load"); return; }
    try {
      const rows = snowRowsFromCsv(await file.text());
      setImportState({ rows, fileName: file.name });
    } catch (err) {
      toastError(err?.message || "Could not read the CSV.", "Snow Load");
    }
  };

  const runImport = async () => {
    const rows = importState?.rows ?? [];
    const CHUNK = 500;
    const summary = { inserted: 0, updated: 0, errors: [] };
    setImportState({ running: true, done: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const part = await importSnowLoads(rows.slice(i, i + CHUNK));
        summary.inserted += part.inserted;
        summary.updated += part.updated;
        summary.errors.push(...part.errors);
        setImportState({ running: true, done: Math.min(i + CHUNK, rows.length), total: rows.length });
      }
      toastSuccess(`Import done: ${summary.inserted} added, ${summary.updated} updated, ${summary.errors.length} errors.`, "Snow Load");
    } catch (err) {
      summary.errors.push({ line: "—", reason: err?.message || "Import stopped." });
      toastError(err?.message || "Import failed.", "Snow Load");
    }
    setImportState({ summary });
    await load(search);
  };

  const load = useCallback(async (term) => {
    setRows(null);
    try {
      const res = await listSnowLoads({ search: term });
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      toastError(err?.message || "Failed to load snow loads.", "Snow Load");
      setRows([]);
      setTotal(0);
    }
  }, []);

  // Debounced server search by ZIP prefix.
  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const runLookup = useCallback(async (zip) => {
    const digits = String(zip ?? "").replace(/\D/g, "");
    if (digits.length !== 5) return;
    lastLookupZip.current = digits;
    setLookup({ busy: true, note: "Looking up coordinates…" });
    try {
      const res = await lookupSnowLoadCoordinates(digits);
      if (lastLookupZip.current !== digits) return; // a newer ZIP was typed
      if (res.ok) {
        setDraft((p) => ({ ...p, latitude: String(res.latitude), longitude: String(res.longitude) }));
        setLookup({ busy: false, note: res.place ? `Coordinates for ${res.place}` : "Coordinates found" });
      } else {
        setLookup({ busy: false, note: res.message || "Coordinates not found — enter them manually." });
      }
    } catch (err) {
      setLookup({ busy: false, note: err?.message || "Lookup failed — enter coordinates manually." });
    }
  }, []);

  const openAdd = () => {
    setDraft(EMPTY_SNOW_DRAFT);
    setLookup({ busy: false, note: "" });
    lastLookupZip.current = "";
    setDialog({ mode: "add", row: null });
  };
  const openEdit = useCallback((row) => {
    setDraft({
      zip_code: fmtZip(row.zip_code),
      snow_load: row.snow_load ?? "",
      latitude: row.latitude ?? "",
      longitude: row.longitude ?? "",
    });
    setLookup({ busy: false, note: "" });
    lastLookupZip.current = fmtZip(row.zip_code);
    setDialog({ mode: "edit", row });
  }, []);
  const closeDialog = () => { if (!saving) setDialog(null); };

  const onZipChange = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 5);
    setDraft((p) => ({ ...p, zip_code: digits }));
    // Auto look up as soon as a new 5-digit ZIP is typed.
    if (digits.length === 5 && digits !== lastLookupZip.current) runLookup(digits);
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (dialog?.mode === "edit") {
        await updateSnowLoad(dialog.row.id, draft);
        toastSuccess(`ZIP ${draft.zip_code} updated.`, "Snow Load");
      } else {
        await createSnowLoad(draft);
        toastSuccess(`ZIP ${draft.zip_code} added.`, "Snow Load");
      }
      setDialog(null);
      await load(search);
    } catch (err) {
      toastError(err?.message || "Save failed.", "Snow Load");
    } finally {
      setSaving(false);
    }
  };

  const remove = useCallback(async (row) => {
    try {
      await deleteSnowLoad(row.id);
      toastSuccess(`ZIP ${fmtZip(row.zip_code)} deleted.`, "Snow Load");
      await load(search);
    } catch (err) {
      toastError(err?.message || "Delete failed.", "Snow Load");
    }
  }, [load, search]);

  const columns = useMemo(() => [
    { key: "zip_code", label: "ZIP Code", width: "18%", sortable: true, render: (r) => fmtZip(r.zip_code) },
    { key: "snow_load", label: "Snow Load (psf)", width: "18%", sortable: true, align: "center", render: (r) => (r.snow_load ?? "—") },
    { key: "latitude", label: "Latitude", width: "20%", sortable: true, align: "center", render: (r) => (r.latitude ?? "—") },
    { key: "longitude", label: "Longitude", width: "20%", sortable: true, align: "center", render: (r) => (r.longitude ?? "—") },
    {
      key: "created_at", label: "Added", width: "24%", sortable: true,
      render: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"),
    },
  ], []);

  // Filter-only field: coordinates present (both lat/long set and non-zero) or missing.
  const snowRows = useMemo(() => (rows ?? []).map((r) => {
    const lat = Number(r?.latitude);
    const lng = Number(r?.longitude);
    const has = r?.latitude != null && r?.longitude != null && Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
    return { ...r, coords_status: has ? "with" : "missing" };
  }), [rows]);

  const actions = useMemo(() => [
    { key: "edit-snow", label: "Edit", type: "secondary", icon: "pen", onClick: (r) => openEdit(r) },
    {
      key: "delete-snow", label: "Delete", type: "danger", icon: "trash",
      confirmMessage: (r) => `Delete the snow load for ZIP ${fmtZip(r.zip_code)}? This cannot be undone.`,
      onClick: (r) => remove(r),
    },
  ], [openEdit, remove]);

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h4 className="mb-0">Snow Load</h4>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Button type="button" size="sm" variant="ghost" onClick={downloadSnowTemplate}>CSV Template</Button>
          <Button type="button" size="sm" variant="primary" onClick={pickImportFile}>Import CSV</Button>
          <input ref={importInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onImportFile} />
          <Button type="button" size="sm" variant="success" onClick={openAdd}>Add Snow Load</Button>
        </div>
      </div>
      <div className="row g-3 align-items-start">
        <div className="col-12">
          <Card title="Snow Load by ZIP" subtitle="Snow load (psf) per delivery ZIP, used for the snow load upcharge. One row per ZIP.">
            <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
              <input className="form-control form-control-sm" style={{ maxWidth: 220 }} inputMode="numeric"
                placeholder="Search ZIP (e.g. 462)" value={search}
                onChange={(e) => setSearch(e.target.value.replace(/\D/g, "").slice(0, 5))} />
              <span className="small text-muted">
                {rows === null ? "Loading…" : `Showing ${rows.length} of ${total}${rows.length < total ? " — refine the search to see more" : ""}`}
              </span>
            </div>
            <TableZ columns={columns} data={snowRows} rowIdKey="id" actions={actions} hideSearch
              filterConfig={SNOW_LOAD_FILTERS}
              emptyMessage={rows === null ? "Loading…" : "No snow loads found."} />
          </Card>
        </div>
      </div>

  {importState ? (
        <Modal show onHide={() => { if (!importState.running) setImportState(null); }} title="Import Snow Loads (CSV)">
          {importState.rows ? (
            <div>
              <p className="mb-2"><strong>{importState.fileName}</strong>: {importState.rows.length} data rows.</p>
              <p className="small text-muted mb-2">Existing ZIPs are updated, new ZIPs are added. Missing latitude/longitude are filled from the ZIP.</p>
              <div className="table-responsive mb-3" style={{ maxHeight: 220 }}>
                <table className="table table-sm mb-0">
                  <thead><tr><th>Line</th><th>ZIP</th><th>Snow Load</th><th>Lat</th><th>Long</th></tr></thead>
                  <tbody>
                    {importState.rows.slice(0, 10).map((r) => (
                      <tr key={r.line}><td>{r.line}</td><td>{r.zip_code}</td><td>{r.snow_load}</td><td>{r.latitude || "auto"}</td><td>{r.longitude || "auto"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="d-flex justify-content-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setImportState(null)}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={runImport}>Import {importState.rows.length} rows</Button>
              </div>
            </div>
          ) : importState.running ? (
            <p className="mb-0">Importing… {importState.done} / {importState.total}</p>
          ) : (
            <div>
              <p className="mb-2">
                Added <strong>{importState.summary.inserted}</strong>, updated <strong>{importState.summary.updated}</strong>,
                errors <strong>{importState.summary.errors.length}</strong>.
              </p>
              {importState.summary.errors.length > 0 ? (
                <div className="small" style={{ maxHeight: 200, overflowY: "auto" }}>
                  {importState.summary.errors.slice(0, 200).map((er, i) => (
                    <div key={i}>Line {er.line}: {er.reason}</div>
                  ))}
                </div>
              ) : null}
              <div className="d-flex justify-content-end mt-3">
                <Button variant="primary" size="sm" onClick={() => setImportState(null)}>Close</Button>
              </div>
            </div>
          )}
        </Modal>
      ) : null}

      {dialog ? (
        <Modal show onHide={closeDialog} title={dialog.mode === "edit" ? `Edit Snow Load — ZIP ${fmtZip(dialog.row.zip_code)}` : "Add Snow Load"}>
          <div className="row g-2">
            <div className="col-6">
              <label className="form-label small mb-1" htmlFor="snow-zip">ZIP Code *</label>
              <div className="input-group input-group-sm">
                <input id="snow-zip" className="form-control" inputMode="numeric" maxLength={5}
                  value={draft.zip_code} onChange={(e) => onZipChange(e.target.value)} disabled={saving} />
                <button type="button" className="btn btn-outline-secondary" disabled={saving || lookup.busy || draft.zip_code.length !== 5}
                  onClick={() => runLookup(draft.zip_code)}>Look up</button>
              </div>
            </div>
            <div className="col-6">
              <label className="form-label small mb-1" htmlFor="snow-load">Snow Load (psf) *</label>
              <input id="snow-load" type="number" min="0" step="any" className="form-control form-control-sm"
                value={draft.snow_load} onChange={(e) => setDraft((p) => ({ ...p, snow_load: e.target.value }))} disabled={saving} />
            </div>
            <div className="col-6">
              <label className="form-label small mb-1" htmlFor="snow-lat">Latitude</label>
              <input id="snow-lat" type="number" step="any" className="form-control form-control-sm"
                value={draft.latitude} onChange={(e) => setDraft((p) => ({ ...p, latitude: e.target.value }))} disabled={saving} />
            </div>
            <div className="col-6">
              <label className="form-label small mb-1" htmlFor="snow-lng">Longitude</label>
              <input id="snow-lng" type="number" step="any" className="form-control form-control-sm"
                value={draft.longitude} onChange={(e) => setDraft((p) => ({ ...p, longitude: e.target.value }))} disabled={saving} />
            </div>
            <div className="col-12 small text-muted" style={{ minHeight: 18 }}>
              {lookup.note || "Coordinates fill in automatically from the ZIP (left empty = filled on save when known)."}
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button variant={dialog.mode === "edit" ? "primary" : "success"} size="sm" loading={saving} disabled={saving} onClick={submit}>
              {dialog.mode === "edit" ? "Save" : "Add"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function DocumentsSection() {
  const [rows, setRows] = useState(null); // null = loading
  const [versionsType, setVersionsType] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);
  const uploadTypeRef = useRef(null);
  const LAST = Number.MAX_SAFE_INTEGER;

  // Rows in print order: sort ascending (empty last), then list order.
  const load = useCallback(() => {
    const base = DOCUMENT_TYPE_LIST.map((d, i) => ({ ...d, id: d.type, listIndex: i }));
    const apply = (merged) => {
      merged.sort((a, b) => (a.sort ?? LAST) - (b.sort ?? LAST) || a.listIndex - b.listIndex);
      setRows(merged);
    };
    return listDocumentSummaries(DOCUMENT_TYPE_LIST.map((d) => d.type))
      .then((summaries) => {
        const byType = new Map(summaries.map((s) => [s.document_type, s]));
        apply(base.map((r) => ({ ...r, ...(byType.get(r.type) ?? {}) })));
      })
      .catch((err) => {
        toastError(err?.message || "Failed to load documents.", "Documents");
        apply(base.slice());
      });
  }, [LAST]);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

  // ── Create / update: upload a new version (becomes active) ──
  const startUpload = useCallback((row) => {
    uploadTypeRef.current = row.type;
    fileInputRef.current?.click();
  }, []);

  const handleFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    const type = uploadTypeRef.current;
    if (!file || !type) return;
    if (file.type !== "application/pdf") { toastError("Only PDF files are allowed.", "Documents"); return; }
    if (file.size > 10 * 1024 * 1024) { toastError("File must be 10 MB or smaller.", "Documents"); return; }
    setBusy(true);
    try {
      const meta = { name: file.name, type: file.type, size: file.size };
      const { bucket, storagePath, token } = await createDocumentUpload(type, meta);
      const { error } = await getSupabase().storage.from(bucket)
        .uploadToSignedUrl(storagePath, token, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      await saveDocument(type, storagePath, meta);
      toastSuccess(`${file.name} uploaded — now the active version.`, "Documents");
      await load();
    } catch (err) {
      toastError(`${file.name}: ${err?.message || "Upload failed."}`, "Documents");
    } finally {
      setBusy(false);
    }
  };

  // ── Read: open the active file ──
  const openActive = useCallback(async (row) => {
    if (!row?.activeId) return;
    const win = window.open("", "_blank");
    try {
      const url = await getDocumentUrl(row.activeId);
      if (win) win.location.href = url; else window.location.href = url;
    } catch (err) {
      if (win) win.close();
      toastError(err?.message || "Could not open the file.", "Documents");
    }
  }, []);

  // ── Delete: the active file (previous version becomes active) ──
  const deleteActive = useCallback(async (row) => {
    if (!row?.activeId) return;
    setBusy(true);
    try {
      await deleteDocument(row.activeId);
      toastSuccess(`${row.activeFileName} deleted.`, "Documents");
      await load();
    } catch (err) {
      toastError(err?.message || "Could not delete the file.", "Documents");
    } finally {
      setBusy(false);
    }
  }, [load]);

  // ── Drag-and-drop: print order → sort 1..n, saved immediately ──
  const handleReorder = useCallback(async (nextRows) => {
    const ordered = (Array.isArray(nextRows) ? nextRows : []).map((r, i) => ({ ...r, sort: i + 1 }));
    setRows(ordered);
    try {
      await updateDocumentTypeSorts(ordered.map((r) => ({ type: r.type, sort: r.sort })));
      toastSuccess("Print order saved.", "Documents");
    } catch (err) {
      toastError(err?.message || "Failed to save the order.", "Documents");
      load();
    }
  }, [load]);

  const columns = useMemo(() => [
    {
      key: "label", label: "Document", width: "24%",
      render: (r) => (
        <div>
          <div className="fw-semibold">{r.label}</div>
          {r.description ? <div className="small text-muted">{r.description}</div> : null}
        </div>
      ),
    },
    {
      key: "activeFileName", label: "Active File", width: "28%",
      render: (r) => (r.activeFileName
        ? <span className="text-truncate d-inline-block" style={{ maxWidth: 260 }} title={r.activeFileName}>{r.activeFileName}</span>
        : <span className="text-muted">No file uploaded</span>),
    },
    { key: "activeCreatedAt", label: "Uploaded", width: "12%", render: (r) => fmtDate(r.activeCreatedAt) },
    { key: "versions", label: "Versions", width: "9%", align: "center", render: (r) => r.versions ?? 0 },
    {
      key: "printed", label: "Printed", width: "13%",
      render: (r) => (r.print?.withOrderForm ? (PRINT_POSITION_LABELS[r.print.position] ?? r.print.position) : <span className="text-muted">No</span>),
    },
    { key: "sort", label: "Print Sort", width: "10%", align: "center", render: (r) => (r.sort ?? <span className="text-muted">—</span>) },
  ], []);

  const actions = useMemo(() => [
    { key: "upload-doc", label: "Upload new version", type: "primary", icon: "upload", disabled: () => busy, onClick: (r) => startUpload(r) },
    { key: "open-doc", label: "Open", type: "secondary", icon: "eye", visible: (r) => !!r?.activeId, onClick: (r) => openActive(r) },
    { key: "versions-doc", label: "Versions", type: "secondary", icon: "clock-rotate-left", onClick: (r) => setVersionsType(r.type) },
    {
      key: "delete-doc", label: "Delete active file", type: "danger", icon: "trash",
      visible: (r) => !!r?.activeId, disabled: () => busy,
      confirmMessage: (r) => `Delete "${r.activeFileName}"? The previous version (if any) becomes active. This cannot be undone.`,
      onClick: (r) => deleteActive(r),
    },
  ], [busy, startUpload, openActive, deleteActive]);

  const versionsDoc = DOCUMENT_TYPE_LIST.find((d) => d.type === versionsType) ?? null;

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h4 className="mb-0">Documents</h4>
      </div>
      <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={handleFilePicked} />
      <div className="row g-3 align-items-start">
        <div className="col-12">
          <Card title="Documents" subtitle="Drag rows to set the print order. The newest file of each document is the active one.">
            <TableZ columns={columns} data={rows ?? []} rowIdKey="id" actions={actions}
              filterConfig={DOCUMENT_FILTERS}
              draggable={!busy && Array.isArray(rows) && rows.length > 1} onReorder={handleReorder}
              emptyMessage={rows === null ? "Loading…" : "No document types configured."} />
          </Card>
        </div>
      </div>

      {versionsDoc ? (
        <Modal show onHide={() => { setVersionsType(null); load(); }} title={`${versionsDoc.label} — versions`}>
          <FileAttachments
            key={versionsDoc.type}
            title={`${versionsDoc.label} (PDF)`}
            accept={versionsDoc.accept}
            loadFiles={() => listDocuments(versionsDoc.type)}
            createUpload={(meta) => createDocumentUpload(versionsDoc.type, meta)}
            saveFile={(storagePath, meta) => saveDocument(versionsDoc.type, storagePath, meta)}
            getFileUrl={(file) => getDocumentUrl(file.id)}
            deleteFile={(file) => deleteDocument(file.id)}
          />
          <div className="small text-muted">The newest file is the active one.</div>
        </Modal>
      ) : null}
    </>
  );
}
import {
  isSameId,
  compareText,
  normalizeText,
  mapRegionRow,
  removeObjectKey,
  mergeUpdatePatch,
  appendUniqueId,
  EMPTY_DIALOG,
  TEMP_REGION_PREFIX,
  createTempId,
  isTempRegionId,
  createEmptyRegionChanges,
  executeRegionBatchSave,
  mapZipCodeRow,
  createEmptyZipCodeChanges,
  executeZipCodeBatchSave,
  mapCategoryRow,
  TEMP_CATEGORY_PREFIX,
  isTempCategoryId,
  createEmptyCategoryChanges,
  executeCategoryBatchSave,
  mapPanelTypeRow,
  TEMP_PANEL_TYPE_PREFIX,
  isTempPanelTypeId,
  createEmptyPanelTypeChanges,
  executePanelTypeBatchSave,
  mapStyleRow,
  TEMP_STYLE_PREFIX,
  isTempStyleId,
  createEmptyStyleChanges,
  executeStyleBatchSave,
  mapCustomAdjustmentRow,
  TEMP_CUSTOM_ADJUSTMENT_PREFIX,
  isTempCustomAdjustmentId,
  createEmptyCustomAdjustmentChanges,
  executeCustomAdjustmentBatchSave,
} from "../data/metalMasterDataConfig.data.js";

function normalizeMultiplier(value) {
  const text = String(value ?? "").trim();
  if (text === "") return 1;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 1;
}

function normalizeZipCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 5);
  return digits.length === 5 ? digits : "";
}

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

function normalizeOptionalNumber(value) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSortOrder(value) {
  const text = String(value ?? "").trim();
  if (text === "") return 0;
  const parsed = parseInt(text, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function emptyZipDraft() {
  return { zipCode: "", regionId: "", city: "", county: "", latitude: "", longitude: "", timezone: "" };
}

function normalizeDefaultNumber(value, fallback) {
  const text = String(value ?? "").trim();
  if (text === "") return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDefaultInteger(value, fallback) {
  const text = String(value ?? "").trim();
  if (text === "") return fallback;
  const parsed = parseInt(text, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeHasWalls(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function emptyStyleDraft() {
  return {
    name: "",
    description: "",
    sortOrder: "",
    renderKey: "",
    defaultRoofPitch: "",
    defaultWidth: "",
    defaultLength: "",
    defaultHeight: "",
    defaultRoofOverhang: "",
    hasWalls: "false",
    iconPath: "",
  };
}

function buildStyleDraftValues(styleDraft) {
  return {
    name: normalizeText(styleDraft.name),
    description: normalizeOptionalText(styleDraft.description),
    render_key: normalizeOptionalText(styleDraft.renderKey),
    default_roof_pitch: normalizeDefaultNumber(styleDraft.defaultRoofPitch, 0.25),
    default_width: normalizeDefaultInteger(styleDraft.defaultWidth, 12),
    default_length: normalizeDefaultInteger(styleDraft.defaultLength, 20),
    default_height: normalizeDefaultInteger(styleDraft.defaultHeight, 6),
    default_roof_overhang: normalizeOptionalText(styleDraft.defaultRoofOverhang) ?? "0",
    has_walls: normalizeHasWalls(styleDraft.hasWalls),
    icon_path: normalizeOptionalText(styleDraft.iconPath),
  };
}

// --- HOOK: useRegions ---

function useRegions({ regions = [] }) {
  const router = useRouter();

  const seedRegions = useMemo(
    () =>
      (Array.isArray(regions) ? regions : [])
        .map((region, index) => mapRegionRow(region, index))
        .sort((left, right) => compareText(left.name, right.name)),
    [regions],
  );

  const [orderedRegions, setOrderedRegions] = useState(seedRegions);
  const [regionChanges, setRegionChanges] = useState(createEmptyRegionChanges());
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [regionDraft, setRegionDraft] = useState({ name: "", stateCode: "", multiplier: "" });
  const [editingRegionId, setEditingRegionId] = useState(null);
  const batchActiveRef = useRef(false);

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedRegions(seedRegions);
    setRegionChanges(createEmptyRegionChanges());
    setDialog(EMPTY_DIALOG);
    setRegionDraft({ name: "", stateCode: "", multiplier: "" });
    setIsMutatingAction(false);
    setIsSavingBatch(false);
    setEditingRegionId(null);
  }, [seedRegions]);

  const pendingSummary = useMemo(() => {
    const added = regionChanges.creates.length;
    const edited = Object.keys(regionChanges.updates || {}).length;
    const deactivated = regionChanges.deactivations.length;
    const hardDeleted = (regionChanges.hardDeletes || []).length;
    return { added, edited, deactivated, hardDeleted, total: added + edited + deactivated + hardDeleted };
  }, [regionChanges]);

  const hasPendingChanges = pendingSummary.total > 0;

  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedRegionIds = useMemo(
    () => new Set((regionChanges.deactivations || []).map((id) => String(id ?? ""))),
    [regionChanges.deactivations],
  );

  const pendingHardDeletedRegionIds = useMemo(
    () => new Set((regionChanges.hardDeletes || []).map((id) => String(id ?? ""))),
    [regionChanges.hardDeletes],
  );

  const decoratedRegions = useMemo(() => {
    const createdIds = new Set((regionChanges.creates || []).map((entry) => String(entry?.tempId ?? "")));
    const updatesMap = regionChanges.updates || {};
    const deactivatedIds = new Set((regionChanges.deactivations || []).map((entry) => String(entry ?? "")));
    const hardDeletedIds = new Set((regionChanges.hardDeletes || []).map((entry) => String(entry ?? "")));

    return orderedRegions.map((row) => {
      const id = String(row?.region_id ?? "");
      if (hardDeletedIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (deactivatedIds.has(id)) return { ...row, __batchState: "deleted" };
      if (createdIds.has(id)) return { ...row, __batchState: "created" };
      const updates = updatesMap[id];
      if (updates) {
        const hasIsActive = Object.prototype.hasOwnProperty.call(updates, "is_active");
        const hasOtherFields = Object.keys(updates).some((k) => k !== "is_active");
        if (hasIsActive && !hasOtherFields) return { ...row, __batchState: updates.is_active ? "activated" : "deactivated" };
        if (hasIsActive && hasOtherFields) return { ...row, __batchState: updates.is_active ? "activated" : "deactivated" };
        return { ...row, __batchState: "updated" };
      }
      return { ...row, __batchState: "none" };
    });
  }, [regionChanges.creates, regionChanges.deactivations, regionChanges.hardDeletes, regionChanges.updates, orderedRegions]);

  // -- dialog actions
  const closeDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog(EMPTY_DIALOG);
  }, [isMutatingAction, isSavingBatch]);

  const openAddRegionDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setRegionDraft({ name: "", stateCode: "", multiplier: "" });
    setDialog({ kind: "add-region", target: null, nextIsActive: true });
  }, [isMutatingAction, isSavingBatch]);

  const openEditRegionDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setRegionDraft({
      name: String(row?.name || ""),
      stateCode: String(row?.state_code || ""),
      multiplier: String(row?.multiplier ?? ""),
    });
    setDialog({ kind: "edit-region", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const openToggleRegionDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const regionId = String(row?.region_id ?? "");
    if (pendingDeactivatedRegionIds.has(regionId)) {
      setRegionChanges((prev) => ({
        ...prev,
        deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, regionId)),
      }));
      toastSuccess("Region deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-region", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [isMutatingAction, isSavingBatch, pendingDeactivatedRegionIds]);

  const openDeactivateRegionDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog({ kind: "deactivate-region", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const stageHardDeleteRegion = useCallback((row) => {
    const regionId = String(row?.region_id ?? "");
    if (!regionId || isMutatingAction || isSavingBatch) return;

    if (isTempRegionId(regionId)) {
      setOrderedRegions((prev) => prev.filter((r) => !isSameId(r?.region_id, regionId)));
      setRegionChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, regionId)),
        updates: removeObjectKey(prev.updates, regionId),
      }));
      toastSuccess("Staged region removed.", "Batching");
      return;
    }

    setRegionChanges((prev) => ({
      ...prev,
      deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, regionId)),
      updates: removeObjectKey(prev.updates, String(regionId)),
      hardDeletes: appendUniqueId(prev.hardDeletes || [], regionId),
    }));
    toastSuccess("Region deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  const unstageHardDeleteRegion = useCallback((row) => {
    const regionId = String(row?.region_id ?? "");
    if (!regionId || isMutatingAction || isSavingBatch) return;
    setRegionChanges((prev) => ({
      ...prev,
      hardDeletes: (prev.hardDeletes || []).filter((id) => !isSameId(id, regionId)),
    }));
    toastSuccess("Region deletion un-staged.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  // -- batch actions
  const handleCancelBatch = useCallback(() => {
    if (isMutatingAction || isSavingBatch || !hasPendingChanges) return;
    batchActiveRef.current = false;
    setOrderedRegions(seedRegions);
    setRegionChanges(createEmptyRegionChanges());
    setDialog(EMPTY_DIALOG);
    setRegionDraft({ name: "", stateCode: "", multiplier: "" });
    setEditingRegionId(null);
    toastSuccess("Batch changes canceled.", "Batching");
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, seedRegions]);

  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isSavingBatch || isMutatingAction) return;
    setIsSavingBatch(true);
    setIsMutatingAction(true);
    try {
      await executeRegionBatchSave(regionChanges);
      setRegionChanges(createEmptyRegionChanges());
      batchActiveRef.current = false;
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally {
      setIsMutatingAction(false);
      setIsSavingBatch(false);
      setEditingRegionId(null);
    }
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, pendingSummary.total, router, regionChanges]);

  // -- submit handlers
  const submitAddRegion = useCallback(() => {
    const regionName = normalizeText(regionDraft.name);
    if (!regionName) { toastError("Region name is required."); return; }
    const stateCode = normalizeText(regionDraft.stateCode).toUpperCase();
    if (!stateCode) { toastError("State code is required."); return; }
    const multiplier = normalizeMultiplier(regionDraft.multiplier);
    const tempRegionId = createTempId(TEMP_REGION_PREFIX);
    setOrderedRegions((prev) => [
      ...prev,
      mapRegionRow({ region_id: tempRegionId, name: regionName, state_code: stateCode, multiplier, is_active: true }, prev.length),
    ]);
    setRegionChanges((prev) => ({
      ...prev,
      creates: [...prev.creates, { tempId: tempRegionId, payload: { name: regionName, state_code: stateCode, multiplier, is_active: true } }],
    }));
    setDialog(EMPTY_DIALOG);
    setRegionDraft({ name: "", stateCode: "", multiplier: "" });
    toastSuccess("Region staged for Save Batch.", "Batching");
  }, [regionDraft.multiplier, regionDraft.name, regionDraft.stateCode]);

  const submitEditRegion = useCallback(() => {
    const row = dialog?.target;
    if (!row?.region_id) { toastError("Invalid region."); return; }
    const regionName = normalizeText(regionDraft.name);
    if (!regionName) { toastError("Region name is required."); return; }
    const stateCode = normalizeText(regionDraft.stateCode).toUpperCase();
    if (!stateCode) { toastError("State code is required."); return; }
    const multiplier = normalizeMultiplier(regionDraft.multiplier);
    const regionId = row.region_id;
    setOrderedRegions((prev) =>
      prev.map((region, index) => {
        if (!isSameId(region?.region_id, regionId)) return region;
        return mapRegionRow({ ...region, name: regionName, state_code: stateCode, multiplier }, index);
      }),
    );
    setRegionChanges((prev) => {
      if (isTempRegionId(regionId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, regionId)) return entry;
            return { ...entry, payload: { ...entry.payload, name: regionName, state_code: stateCode, multiplier } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(regionId)]: mergeUpdatePatch(prev.updates?.[String(regionId)], { name: regionName, state_code: stateCode, multiplier }),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    setRegionDraft({ name: "", stateCode: "", multiplier: "" });
    toastSuccess("Region edit staged for Save Batch.", "Batching");
  }, [dialog?.target, regionDraft.multiplier, regionDraft.name, regionDraft.stateCode]);

  const submitToggleRegion = useCallback(() => {
    const row = dialog?.target;
    if (!row?.region_id) { toastError("Invalid region."); return; }
    const regionId = row.region_id;
    const nextIsActive = Boolean(dialog?.nextIsActive);
    setOrderedRegions((prev) =>
      prev.map((region, index) => {
        if (!isSameId(region?.region_id, regionId)) return region;
        return mapRegionRow({ ...region, is_active: nextIsActive }, index);
      }),
    );
    setRegionChanges((prev) => {
      if (isTempRegionId(regionId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, regionId)) return entry;
            return { ...entry, payload: { ...entry.payload, is_active: nextIsActive } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(regionId)]: mergeUpdatePatch(prev.updates?.[String(regionId)], { is_active: nextIsActive }),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(nextIsActive ? "Region enabled - staged for Save Batch." : "Region disabled - staged for Save Batch.", "Batching");
  }, [dialog?.nextIsActive, dialog?.target]);

  const submitDeactivateRegion = useCallback(() => {
    const row = dialog?.target;
    if (!row?.region_id) { toastError("Invalid region."); return; }
    const regionId = row.region_id;
    if (isTempRegionId(regionId)) {
      setOrderedRegions((prev) => prev.filter((region) => !isSameId(region?.region_id, regionId)));
      setRegionChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((entry) => !isSameId(entry?.tempId, regionId)),
        updates: removeObjectKey(prev.updates, String(regionId)),
      }));
      setDialog(EMPTY_DIALOG);
      toastSuccess("Staged region removed.", "Batching");
      return;
    }
    setRegionChanges((prev) => ({
      ...prev,
      deactivations: appendUniqueId(prev.deactivations, regionId),
    }));
    setDialog(EMPTY_DIALOG);
    toastSuccess("Region deactivation staged for Save Batch.", "Batching");
  }, [dialog?.target]);

  // -- row editing
  const startEditingRegion = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const id = String(row?.region_id ?? "");
    setEditingRegionId((prev) => prev === id ? null : id);
  }, [isMutatingAction, isSavingBatch]);

  const stopEditingRegion = useCallback(() => { setEditingRegionId(null); }, []);

  // -- inline edit
  const handleInlineEdit = useCallback((row, key, value) => {
    const regionId = row?.region_id;
    if (!regionId || isMutatingAction || isSavingBatch) return;
    let nextValue = value;
    if (key === "multiplier") {
      nextValue = normalizeMultiplier(value);
    } else if (key === "state_code") {
      nextValue = normalizeText(value).toUpperCase();
    } else {
      nextValue = normalizeText(value);
    }
    setOrderedRegions((prev) =>
      prev.map((region, index) => {
        if (!isSameId(region?.region_id, regionId)) return region;
        return mapRegionRow({ ...region, [key]: nextValue || null }, index);
      }),
    );
    setRegionChanges((prev) => {
      if (isTempRegionId(regionId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, regionId)) return entry;
            return { ...entry, payload: { ...entry.payload, [key]: nextValue || null } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(regionId)]: mergeUpdatePatch(prev.updates?.[String(regionId)], { [key]: nextValue || null }),
        },
      };
    });
  }, [isMutatingAction, isSavingBatch]);

  return {
    decoratedRegions, dialog, regionDraft, isSavingBatch, isMutatingAction,
    pendingSummary, hasPendingChanges, pendingDeactivatedRegionIds, pendingHardDeletedRegionIds,
    setDialog, setRegionDraft, closeDialog, openAddRegionDialog, openEditRegionDialog,
    openToggleRegionDialog, openDeactivateRegionDialog, stageHardDeleteRegion, unstageHardDeleteRegion,
    handleCancelBatch, handleSaveBatch, submitAddRegion, submitEditRegion,
    submitToggleRegion, submitDeactivateRegion, editingRegionId, startEditingRegion,
    stopEditingRegion, handleInlineEdit,
  };
}

// --- REGION SUB-COMPONENTS ---

function RegionHeader({ hasPendingChanges, pendingSummary, isSavingBatch, isMutatingAction, handleSaveBatch, handleCancelBatch, openAddRegionDialog }) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <h4 className="mb-0">Regions</h4>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {hasPendingChanges ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "#856404", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "999px", padding: "0.25rem 0.7rem", lineHeight: 1.4 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#d39e00", flexShrink: 0 }} />
            {pendingSummary.total} pending
          </span>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSavingBatch} disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleSaveBatch}>
          Save Batch
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleCancelBatch}>
          Cancel Batch
        </Button>
        <Button type="button" size="sm" variant="success" disabled={isSavingBatch || isMutatingAction} onClick={openAddRegionDialog}>
          Add Region
        </Button>
      </div>
    </div>
  );
}

function RegionTable({ decoratedRegions, isMutatingAction, isSavingBatch, pendingDeactivatedRegionIds, editingRegionId, onStartEditing, onStopEditing, onInlineEdit, openToggleRegionDialog, openDeactivateRegionDialog, stageHardDeleteRegion, onUndoBatchAction }) {
  const columns = useMemo(
    () => [
      {
        key: "name", label: "Region Name", width: "34%", sortable: true,
        render: (row) => {
          const batchState = String(row?.__batchState || "");
          const isEditing = String(row?.region_id ?? "") === String(editingRegionId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          let markerText = "";
          let markerClass = "";
          switch (batchState) {
            case "hardDeleted": markerText = "Deleted"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "deleted": markerText = "Deactivated"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "created": markerText = "New"; markerClass = "psb-batch-marker psb-batch-marker-new"; break;
            case "updated": markerText = "Edited"; markerClass = "psb-batch-marker psb-batch-marker-edited"; break;
            case "activated": markerText = "Activated"; markerClass = "psb-batch-marker psb-batch-marker-activated"; break;
            case "deactivated": markerText = "Deactivated"; markerClass = "psb-batch-marker psb-batch-marker-deactivated"; break;
            default: break;
          }
          return (
            <span>
              <InlineEditCell value={row?.name || ""} onCommit={(val) => onInlineEdit?.(row, "name", val)} onCancel={onStopEditing} disabled={editDisabled} />
              {markerText ? <span className={markerClass}>{markerText}</span> : null}
            </span>
          );
        },
      },
      {
        key: "state_code", label: "State Code", width: "20%", sortable: true, align: "center",
        render: (row) => {
          const isEditing = String(row?.region_id ?? "") === String(editingRegionId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={row?.state_code || ""} onCommit={(val) => onInlineEdit?.(row, "state_code", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "multiplier", label: "Multiplier", width: "20%", sortable: true, align: "center",
        render: (row) => {
          const isEditing = String(row?.region_id ?? "") === String(editingRegionId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={String(row?.multiplier ?? "")} type="number" onCommit={(val) => onInlineEdit?.(row, "multiplier", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "is_active_bool", label: "Active", width: "26%", sortable: true, align: "center",
        render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />,
      },
    ],
    [editingRegionId, isMutatingAction, isSavingBatch, onInlineEdit, onStopEditing],
  );

  const actions = useMemo(
    () => [
      { key: "edit-region", label: "Edit", type: "secondary", icon: "pen", visible: (row) => String(row?.region_id ?? "") !== String(editingRegionId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => onStartEditing(row) },
      { key: "cancel-edit-region", label: "Cancel", type: "secondary", icon: "xmark", visible: (row) => String(row?.region_id ?? "") === String(editingRegionId ?? ""), onClick: () => onStopEditing() },
      { key: "restore-region", label: "Restore", type: "secondary", icon: "rotate-left", visible: (row) => (!Boolean(row?.is_active_bool) || pendingDeactivatedRegionIds.has(String(row?.region_id ?? ""))) && String(row?.region_id ?? "") !== String(editingRegionId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openToggleRegionDialog(row) },
      { key: "deactivate-region", label: "Deactivate", type: "secondary", icon: "ban", visible: (row) => Boolean(row?.is_active_bool) && !pendingDeactivatedRegionIds.has(String(row?.region_id ?? "")) && String(row?.region_id ?? "") !== String(editingRegionId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openDeactivateRegionDialog(row) },
      { key: "delete-region", label: "Delete", type: "danger", icon: "trash", visible: (row) => String(row?.region_id ?? "") !== String(editingRegionId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => stageHardDeleteRegion(row) },
    ],
    [editingRegionId, isMutatingAction, isSavingBatch, pendingDeactivatedRegionIds, onStartEditing, onStopEditing, openToggleRegionDialog, openDeactivateRegionDialog, stageHardDeleteRegion],
  );

  return (
    <div className="row g-3 align-items-start">
      <div className="col-12">
        <Card title="Regions" subtitle="State-based pricing multipliers.">
          <TableZ columns={columns} data={decoratedRegions} rowIdKey="region_id" actions={actions} onUndoBatchAction={onUndoBatchAction} filterConfig={REGION_FILTERS} emptyMessage="No regions found." />
        </Card>
      </div>
    </div>
  );
}

function RegionDialog({ dialog, regionDraft, isMutatingAction, isSavingBatch, setRegionDraft, closeDialog, submitAddRegion, submitEditRegion, submitToggleRegion, submitDeactivateRegion }) {
  const dialogTitle = useMemo(() => {
    const kind = dialog?.kind;
    if (kind === "add-region") return "Add Region";
    if (kind === "edit-region") return "Edit Region";
    if (kind === "toggle-region") return dialog?.nextIsActive ? "Enable Region" : "Disable Region";
    if (kind === "deactivate-region") return "Deactivate Region";
    return "Region";
  }, [dialog?.kind, dialog?.nextIsActive]);

  if (!dialog?.kind) return null;
  const isBusy = isMutatingAction || isSavingBatch;

  return (
    <Modal show onHide={closeDialog} title={dialogTitle}>
      {(dialog.kind === "add-region" || dialog.kind === "edit-region") ? (
        <div>
          <div className="mb-3">
            <Input label="Region Name" value={regionDraft.name} onChange={(e) => setRegionDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Enter region name" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="State Code" value={regionDraft.stateCode} onChange={(e) => setRegionDraft((prev) => ({ ...prev, stateCode: e.target.value }))} placeholder="e.g. MI" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="Multiplier" type="number" step="0.001" value={regionDraft.multiplier} onChange={(e) => setRegionDraft((prev) => ({ ...prev, multiplier: e.target.value }))} placeholder="1.000" disabled={isBusy} />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.kind === "add-region" ? "success" : "primary"} size="sm" loading={isBusy} disabled={isBusy} onClick={dialog.kind === "add-region" ? submitAddRegion : submitEditRegion}>
              {dialog.kind === "add-region" ? "Add" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "toggle-region" ? (
        <div>
          <p className="mb-3">{dialog.nextIsActive ? `Enable region "${dialog.target?.name || "--"}"?` : `Disable region "${dialog.target?.name || "--"}"?`}</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.nextIsActive ? "primary" : "secondary"} size="sm" loading={isBusy} disabled={isBusy} onClick={submitToggleRegion}>
              {dialog.nextIsActive ? "Enable" : "Disable"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "deactivate-region" ? (
        <div>
          <p className="mb-3">Deactivate region <strong>&quot;{dialog.target?.name || "--"}&quot;</strong>? This action will be staged for Save Batch.</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant="warning" size="sm" loading={isBusy} disabled={isBusy} onClick={submitDeactivateRegion}>Deactivate</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
// --- HOOK: useZipCodes ---

function useZipCodes({ zipCodes = [], regions = [] }) {
  const router = useRouter();

  const seedZipCodes = useMemo(
    () =>
      (Array.isArray(zipCodes) ? zipCodes : [])
        .map((zipCode, index) => mapZipCodeRow(zipCode, index))
        .sort((left, right) => compareText(left.zip_code, right.zip_code)),
    [zipCodes],
  );

  const [orderedZipCodes, setOrderedZipCodes] = useState(seedZipCodes);
  const [zipChanges, setZipChanges] = useState(createEmptyZipCodeChanges());
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [zipDraft, setZipDraft] = useState(emptyZipDraft());
  const [editingZipCode, setEditingZipCode] = useState(null);
  const batchActiveRef = useRef(false);
  const createdZipCodesRef = useRef(new Set());

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedZipCodes(seedZipCodes);
    setZipChanges(createEmptyZipCodeChanges());
    setDialog(EMPTY_DIALOG);
    setZipDraft(emptyZipDraft());
    setIsMutatingAction(false);
    setIsSavingBatch(false);
    setEditingZipCode(null);
  }, [seedZipCodes]);

  useEffect(() => {
    createdZipCodesRef.current = new Set((zipChanges.creates || []).map((entry) => String(entry?.zip_code ?? "")));
  }, [zipChanges.creates]);

  const pendingSummary = useMemo(() => {
    const added = zipChanges.creates.length;
    const edited = Object.keys(zipChanges.updates || {}).length;
    const deleted = (zipChanges.deletes || []).length;
    return { added, edited, deleted, total: added + edited + deleted };
  }, [zipChanges]);

  const hasPendingChanges = pendingSummary.total > 0;

  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeletedZipCodes = useMemo(
    () => new Set((zipChanges.deletes || []).map((id) => String(id ?? ""))),
    [zipChanges.deletes],
  );

  const decoratedZipCodes = useMemo(() => {
    const createdSet = new Set((zipChanges.creates || []).map((entry) => String(entry?.zip_code ?? "")));
    const updatesMap = zipChanges.updates || {};
    const deletedSet = new Set((zipChanges.deletes || []).map((id) => String(id ?? "")));
    return orderedZipCodes.map((row) => {
      const zip = String(row?.zip_code ?? "");
      if (deletedSet.has(zip)) return { ...row, __batchState: "hardDeleted" };
      if (createdSet.has(zip)) return { ...row, __batchState: "created" };
      if (updatesMap[zip]) return { ...row, __batchState: "updated" };
      return { ...row, __batchState: "none" };
    });
  }, [zipChanges.creates, zipChanges.deletes, zipChanges.updates, orderedZipCodes]);

  // -- dialog actions
  const closeDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog(EMPTY_DIALOG);
  }, [isMutatingAction, isSavingBatch]);

  const openAddZipCodeDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setZipDraft(emptyZipDraft());
    setDialog({ kind: "add-zip", target: null, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const stageHardDeleteZipCode = useCallback((row) => {
    const zipCode = String(row?.zip_code ?? "");
    if (!zipCode || isMutatingAction || isSavingBatch) return;

    if (createdZipCodesRef.current.has(zipCode)) {
      setOrderedZipCodes((prev) => prev.filter((zc) => !isSameId(zc?.zip_code, zipCode)));
      setZipChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((entry) => !isSameId(entry?.zip_code, zipCode)),
        updates: removeObjectKey(prev.updates, zipCode),
      }));
      toastSuccess("Staged zip code removed.", "Batching");
      return;
    }

    setZipChanges((prev) => ({
      ...prev,
      updates: removeObjectKey(prev.updates, String(zipCode)),
      deletes: appendUniqueId(prev.deletes || [], zipCode),
    }));
    toastSuccess("Zip code deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  const unstageHardDeleteZipCode = useCallback((row) => {
    const zipCode = String(row?.zip_code ?? "");
    if (!zipCode || isMutatingAction || isSavingBatch) return;
    setZipChanges((prev) => ({
      ...prev,
      deletes: (prev.deletes || []).filter((id) => !isSameId(id, zipCode)),
    }));
    toastSuccess("Zip code deletion un-staged.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  // -- batch actions
  const handleCancelBatch = useCallback(() => {
    if (isMutatingAction || isSavingBatch || !hasPendingChanges) return;
    batchActiveRef.current = false;
    setOrderedZipCodes(seedZipCodes);
    setZipChanges(createEmptyZipCodeChanges());
    setDialog(EMPTY_DIALOG);
    setZipDraft(emptyZipDraft());
    setEditingZipCode(null);
    toastSuccess("Batch changes canceled.", "Batching");
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, seedZipCodes]);

  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isSavingBatch || isMutatingAction) return;
    setIsSavingBatch(true);
    setIsMutatingAction(true);
    try {
      await executeZipCodeBatchSave(zipChanges);
      setZipChanges(createEmptyZipCodeChanges());
      batchActiveRef.current = false;
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally {
      setIsMutatingAction(false);
      setIsSavingBatch(false);
      setEditingZipCode(null);
    }
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, pendingSummary.total, router, zipChanges]);

  // -- submit handlers
  const submitAddZipCode = useCallback(() => {
    const zipCode = normalizeZipCode(zipDraft.zipCode);
    if (!zipCode) { toastError("Zip code is required (5 digits)."); return; }
    const regionId = normalizeOptionalNumber(zipDraft.regionId);
    if (regionId == null) { toastError("Region is required."); return; }
    const payload = {
      zip_code: zipCode,
      region_id: regionId,
      city: normalizeOptionalText(zipDraft.city),
      county: normalizeOptionalText(zipDraft.county),
      latitude: normalizeOptionalNumber(zipDraft.latitude),
      longitude: normalizeOptionalNumber(zipDraft.longitude),
      timezone: normalizeOptionalText(zipDraft.timezone),
    };
    setOrderedZipCodes((prev) => [...prev, mapZipCodeRow(payload, prev.length)]);
    setZipChanges((prev) => ({
      ...prev,
      creates: [...prev.creates, { zip_code: zipCode, payload }],
    }));
    setDialog(EMPTY_DIALOG);
    setZipDraft(emptyZipDraft());
    toastSuccess("Zip code staged for Save Batch.", "Batching");
  }, [zipDraft]);

  // -- row editing
  const startEditingZipCode = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const id = String(row?.zip_code ?? "");
    setEditingZipCode((prev) => prev === id ? null : id);
  }, [isMutatingAction, isSavingBatch]);

  const stopEditingZipCode = useCallback(() => { setEditingZipCode(null); }, []);

  // -- inline edit
  const handleInlineEdit = useCallback((row, key, value) => {
    const zipCode = row?.zip_code;
    if (!zipCode || isMutatingAction || isSavingBatch) return;
    let nextValue = value;
    if (key === "region_id" || key === "latitude" || key === "longitude") {
      nextValue = normalizeOptionalNumber(value);
    } else {
      nextValue = normalizeOptionalText(value);
    }
    setOrderedZipCodes((prev) =>
      prev.map((zc, index) => {
        if (!isSameId(zc?.zip_code, zipCode)) return zc;
        return mapZipCodeRow({ ...zc, [key]: nextValue }, index);
      }),
    );
    setZipChanges((prev) => {
      const isCreated = (prev.creates || []).some((entry) => isSameId(entry?.zip_code, zipCode));
      if (isCreated) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.zip_code, zipCode)) return entry;
            return { ...entry, payload: { ...entry.payload, [key]: nextValue } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(zipCode)]: mergeUpdatePatch(prev.updates?.[String(zipCode)], { [key]: nextValue }),
        },
      };
    });
  }, [isMutatingAction, isSavingBatch]);

  return {
    decoratedZipCodes, dialog, zipDraft, isSavingBatch, isMutatingAction,
    pendingSummary, hasPendingChanges, pendingDeletedZipCodes,
    setDialog, setZipDraft, closeDialog, openAddZipCodeDialog,
    stageHardDeleteZipCode, unstageHardDeleteZipCode,
    handleCancelBatch, handleSaveBatch, submitAddZipCode,
    editingZipCode, startEditingZipCode, stopEditingZipCode, handleInlineEdit,
  };
}

// --- ZIP CODE SUB-COMPONENTS ---

function ZipCodeHeader({ hasPendingChanges, pendingSummary, isSavingBatch, isMutatingAction, handleSaveBatch, handleCancelBatch, openAddZipCodeDialog }) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <h4 className="mb-0">Zip Codes</h4>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {hasPendingChanges ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "#856404", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "999px", padding: "0.25rem 0.7rem", lineHeight: 1.4 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#d39e00", flexShrink: 0 }} />
            {pendingSummary.total} pending
          </span>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSavingBatch} disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleSaveBatch}>
          Save Batch
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleCancelBatch}>
          Cancel Batch
        </Button>
        <Button type="button" size="sm" variant="success" disabled={isSavingBatch || isMutatingAction} onClick={openAddZipCodeDialog}>
          Add Zip Code
        </Button>
      </div>
    </div>
  );
}

function ZipCodeTable({ decoratedZipCodes, regions, isMutatingAction, isSavingBatch, editingZipCode, onStartEditing, onStopEditing, onInlineEdit, stageHardDeleteZipCode, onUndoBatchAction }) {
  const regionById = useMemo(() => {
    const map = {};
    (regions || []).forEach((r) => { map[String(r.region_id)] = r; });
    return map;
  }, [regions]);

  const columns = useMemo(
    () => [
      {
        key: "zip_code", label: "Zip Code", width: "12%", sortable: true,
        render: (row) => {
          const batchState = String(row?.__batchState || "");
          let markerText = "";
          let markerClass = "";
          switch (batchState) {
            case "hardDeleted": markerText = "Deleted"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "created": markerText = "New"; markerClass = "psb-batch-marker psb-batch-marker-new"; break;
            case "updated": markerText = "Edited"; markerClass = "psb-batch-marker psb-batch-marker-edited"; break;
            default: break;
          }
          return (
            <span>
              <span>{row?.zip_code || ""}</span>
              {markerText ? <span className={markerClass}>{markerText}</span> : null}
            </span>
          );
        },
      },
      {
        // key = region_label (name text) so Search and sort work on the region
        // name; the cell still renders/edits row.region_id.
        key: "region_label", label: "Region", width: "18%", sortable: true,
        render: (row) => {
          const isEditing = String(row?.zip_code ?? "") === String(editingZipCode ?? "");
          if (isEditing) {
            return (
              <select
                className="form-select form-select-sm"
                value={String(row?.region_id ?? "")}
                onChange={(e) => onInlineEdit?.(row, "region_id", e.target.value)}
              >
                {String(row?.region_id ?? "") === "" ? <option value="">Select region</option> : null}
                {regions.map((r) => <option key={r.region_id} value={r.region_id}>{r.name} ({r.state_code})</option>)}
              </select>
            );
          }
          const region = regionById[String(row?.region_id ?? "")];
          return <span>{region ? `${region.name} (${region.state_code})` : (row?.region_name || "--")}</span>;
        },
      },
      {
        key: "city", label: "City", width: "16%", sortable: true,
        render: (row) => {
          const isEditing = String(row?.zip_code ?? "") === String(editingZipCode ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={row?.city || ""} onCommit={(val) => onInlineEdit?.(row, "city", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "county", label: "County", width: "16%", sortable: true,
        render: (row) => {
          const isEditing = String(row?.zip_code ?? "") === String(editingZipCode ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={row?.county || ""} onCommit={(val) => onInlineEdit?.(row, "county", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "latitude", label: "Latitude", width: "12%", sortable: true, align: "center",
        render: (row) => {
          const isEditing = String(row?.zip_code ?? "") === String(editingZipCode ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={String(row?.latitude ?? "")} type="number" onCommit={(val) => onInlineEdit?.(row, "latitude", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "longitude", label: "Longitude", width: "12%", sortable: true, align: "center",
        render: (row) => {
          const isEditing = String(row?.zip_code ?? "") === String(editingZipCode ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={String(row?.longitude ?? "")} type="number" onCommit={(val) => onInlineEdit?.(row, "longitude", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "timezone", label: "Timezone", width: "14%", sortable: true,
        render: (row) => {
          const isEditing = String(row?.zip_code ?? "") === String(editingZipCode ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={row?.timezone || ""} onCommit={(val) => onInlineEdit?.(row, "timezone", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
    ],
    [editingZipCode, isMutatingAction, isSavingBatch, onInlineEdit, onStopEditing, regions, regionById],
  );

  const actions = useMemo(
    () => [
      { key: "edit-zip", label: "Edit", type: "secondary", icon: "pen", visible: (row) => String(row?.zip_code ?? "") !== String(editingZipCode ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => onStartEditing(row) },
      { key: "cancel-edit-zip", label: "Cancel", type: "secondary", icon: "xmark", visible: (row) => String(row?.zip_code ?? "") === String(editingZipCode ?? ""), onClick: () => onStopEditing() },
      { key: "delete-zip", label: "Delete", type: "danger", icon: "trash", visible: (row) => String(row?.zip_code ?? "") !== String(editingZipCode ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => stageHardDeleteZipCode(row) },
    ],
    [editingZipCode, isMutatingAction, isSavingBatch, onStartEditing, onStopEditing, stageHardDeleteZipCode],
  );

  // Filter-only fields: coordinates present/missing (null or 0 = missing) and
  // a timezone key where "" becomes "(none)" (empty filter value = no filter).
  const NO_TIMEZONE = "(none)";
  const tableRows = useMemo(
    () => (decoratedZipCodes || []).map((row) => {
      const lat = Number(row?.latitude);
      const lng = Number(row?.longitude);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
      const tz = String(row?.timezone ?? "").trim();
      const region = regionById[String(row?.region_id ?? "")];
      const regionLabel = region
        ? `${region.name} (${region.state_code})`
        : (row?.region_name ? `${row.region_name}${row?.region_state_code ? ` (${row.region_state_code})` : ""}` : "");
      return {
        ...row,
        region_label: regionLabel,
        coords_status: hasCoords ? "with" : "missing",
        timezone_filter: tz || NO_TIMEZONE,
      };
    }),
    [decoratedZipCodes, regionById],
  );

  const filterConfig = useMemo(() => {
    const timezones = [...new Set(tableRows.map((r) => r.timezone_filter))]
      .sort((a, b) => (a === NO_TIMEZONE ? 1 : b === NO_TIMEZONE ? -1 : a.localeCompare(b)));
    return createFilterConfig([
      { key: "zip_code", label: "Zip Code", type: TABLE_FILTER_TYPES.TEXT },
      {
        key: "region_id", label: "Region", type: TABLE_FILTER_TYPES.SELECT,
        options: (regions || []).map((r) => ({ label: `${r.name} (${r.state_code})`, value: String(r.region_id) })),
      },
      { key: "city", label: "City", type: TABLE_FILTER_TYPES.TEXT },
      { key: "county", label: "County", type: TABLE_FILTER_TYPES.TEXT },
      {
        key: "coords_status", label: "Coordinates", type: TABLE_FILTER_TYPES.SELECT,
        options: [{ label: "With coordinates", value: "with" }, { label: "Missing coordinates", value: "missing" }],
      },
      {
        key: "timezone_filter", label: "Timezone", type: TABLE_FILTER_TYPES.SELECT,
        options: timezones.map((tz) => ({ label: tz, value: tz })),
      },
    ]);
  }, [regions, tableRows]);

  return (
    <div className="row g-3 align-items-start">
      <div className="col-12">
        <Card title="Zip Codes" subtitle="ZIP-to-region mapping.">
          <TableZ columns={columns} data={tableRows} rowIdKey="zip_code" actions={actions} onUndoBatchAction={onUndoBatchAction}
            filterConfig={filterConfig} emptyMessage="No zip codes match the filters." />
        </Card>
      </div>
    </div>
  );
}

function ZipCodeDialog({ dialog, zipDraft, regions, isMutatingAction, isSavingBatch, setZipDraft, closeDialog, submitAddZipCode }) {
  if (!dialog?.kind) return null;
  const isBusy = isMutatingAction || isSavingBatch;

  return (
    <Modal show onHide={closeDialog} title="Add Zip Code">
      {dialog.kind === "add-zip" ? (
        <div>
          <div className="mb-3">
            <Input label="Zip Code" value={zipDraft.zipCode} onChange={(e) => setZipDraft((prev) => ({ ...prev, zipCode: e.target.value }))} placeholder="5-digit zip code" maxLength={5} disabled={isBusy} />
          </div>
          <div className="mb-3">
            <label className="form-label">Region</label>
            <select className="form-select" value={zipDraft.regionId} onChange={(e) => setZipDraft((prev) => ({ ...prev, regionId: e.target.value }))} disabled={isBusy}>
              <option value="">Select region</option>
              {regions.map((r) => <option key={r.region_id} value={r.region_id}>{r.name} ({r.state_code})</option>)}
            </select>
          </div>
          <div className="mb-3">
            <Input label="City" value={zipDraft.city} onChange={(e) => setZipDraft((prev) => ({ ...prev, city: e.target.value }))} placeholder="City (optional)" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="County" value={zipDraft.county} onChange={(e) => setZipDraft((prev) => ({ ...prev, county: e.target.value }))} placeholder="County (optional)" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="Latitude" type="number" step="0.000001" value={zipDraft.latitude} onChange={(e) => setZipDraft((prev) => ({ ...prev, latitude: e.target.value }))} placeholder="Latitude (optional)" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="Longitude" type="number" step="0.000001" value={zipDraft.longitude} onChange={(e) => setZipDraft((prev) => ({ ...prev, longitude: e.target.value }))} placeholder="Longitude (optional)" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="Timezone" value={zipDraft.timezone} onChange={(e) => setZipDraft((prev) => ({ ...prev, timezone: e.target.value }))} placeholder="Timezone (optional)" disabled={isBusy} />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant="success" size="sm" loading={isBusy} disabled={isBusy} onClick={submitAddZipCode}>Add</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// --- HOOK: useCategories ---

function useCategories({ categories = [] }) {
  const router = useRouter();

  const categoriesKey = useMemo(
    () => JSON.stringify(Array.isArray(categories) ? categories : []),
    [categories],
  );

  const seedCategories = useMemo(
    () =>
      (Array.isArray(categories) ? categories : [])
        .map((category, index) => mapCategoryRow(category, index))
        .sort((left, right) => {
          const orderDiff = (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0);
          if (orderDiff !== 0) return orderDiff;
          return compareText(left.name, right.name);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoriesKey],
  );

  const [orderedCategories, setOrderedCategories] = useState(seedCategories);
  const [categoryChanges, setCategoryChanges] = useState(createEmptyCategoryChanges());
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [categoryDraft, setCategoryDraft] = useState({ name: "", description: "", sortOrder: "" });
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const batchActiveRef = useRef(false);

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedCategories(seedCategories);
    setCategoryChanges(createEmptyCategoryChanges());
    setDialog(EMPTY_DIALOG);
    setCategoryDraft({ name: "", description: "", sortOrder: "" });
    setIsMutatingAction(false);
    setIsSavingBatch(false);
    setEditingCategoryId(null);
  }, [seedCategories]);

  const pendingSummary = useMemo(() => {
    const added = categoryChanges.creates.length;
    const edited = Object.keys(categoryChanges.updates || {}).length;
    const deactivated = categoryChanges.deactivations.length;
    const hardDeleted = (categoryChanges.hardDeletes || []).length;
    return { added, edited, deactivated, hardDeleted, total: added + edited + deactivated + hardDeleted };
  }, [categoryChanges]);

  const hasPendingChanges = pendingSummary.total > 0;

  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedCategoryIds = useMemo(
    () => new Set((categoryChanges.deactivations || []).map((id) => String(id ?? ""))),
    [categoryChanges.deactivations],
  );

  const decoratedCategories = useMemo(() => {
    const createdIds = new Set((categoryChanges.creates || []).map((entry) => String(entry?.tempId ?? "")));
    const updatesMap = categoryChanges.updates || {};
    const deactivatedIds = new Set((categoryChanges.deactivations || []).map((entry) => String(entry ?? "")));
    const hardDeletedIds = new Set((categoryChanges.hardDeletes || []).map((entry) => String(entry ?? "")));

    return orderedCategories.map((row) => {
      const id = String(row?.category_id ?? "");
      if (hardDeletedIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (deactivatedIds.has(id)) return { ...row, __batchState: "deleted" };
      if (createdIds.has(id)) return { ...row, __batchState: "created" };
      const updates = updatesMap[id];
      if (updates) {
        const hasIsActive = Object.prototype.hasOwnProperty.call(updates, "is_active");
        if (hasIsActive) return { ...row, __batchState: updates.is_active ? "activated" : "deactivated" };
        return { ...row, __batchState: "updated" };
      }
      return { ...row, __batchState: "none" };
    });
  }, [categoryChanges.creates, categoryChanges.deactivations, categoryChanges.hardDeletes, categoryChanges.updates, orderedCategories]);

  // -- dialog actions
  const closeDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog(EMPTY_DIALOG);
  }, [isMutatingAction, isSavingBatch]);

  const openAddCategoryDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setCategoryDraft({ name: "", description: "", sortOrder: "" });
    setDialog({ kind: "add-category", target: null, nextIsActive: true });
  }, [isMutatingAction, isSavingBatch]);

  const openEditCategoryDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setCategoryDraft({
      name: String(row?.name || ""),
      description: String(row?.description || ""),
      sortOrder: String(row?.sort_order ?? ""),
    });
    setDialog({ kind: "edit-category", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const openToggleCategoryDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const categoryId = String(row?.category_id ?? "");
    if (pendingDeactivatedCategoryIds.has(categoryId)) {
      setCategoryChanges((prev) => ({
        ...prev,
        deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, categoryId)),
      }));
      toastSuccess("Category deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-category", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [isMutatingAction, isSavingBatch, pendingDeactivatedCategoryIds]);

  const openDeactivateCategoryDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog({ kind: "deactivate-category", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const stageHardDeleteCategory = useCallback((row) => {
    const categoryId = String(row?.category_id ?? "");
    if (!categoryId || isMutatingAction || isSavingBatch) return;

    if (isTempCategoryId(categoryId)) {
      setOrderedCategories((prev) => prev.filter((c) => !isSameId(c?.category_id, categoryId)));
      setCategoryChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, categoryId)),
        updates: removeObjectKey(prev.updates, categoryId),
      }));
      toastSuccess("Staged category removed.", "Batching");
      return;
    }

    setCategoryChanges((prev) => ({
      ...prev,
      deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, categoryId)),
      updates: removeObjectKey(prev.updates, String(categoryId)),
      hardDeletes: appendUniqueId(prev.hardDeletes || [], categoryId),
    }));
    toastSuccess("Category deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  const unstageHardDeleteCategory = useCallback((row) => {
    const categoryId = String(row?.category_id ?? "");
    if (!categoryId || isMutatingAction || isSavingBatch) return;
    setCategoryChanges((prev) => ({
      ...prev,
      hardDeletes: (prev.hardDeletes || []).filter((id) => !isSameId(id, categoryId)),
    }));
    toastSuccess("Category deletion un-staged.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  // -- batch actions
  const handleCancelBatch = useCallback(() => {
    if (isMutatingAction || isSavingBatch || !hasPendingChanges) return;
    batchActiveRef.current = false;
    setOrderedCategories(seedCategories);
    setCategoryChanges(createEmptyCategoryChanges());
    setDialog(EMPTY_DIALOG);
    setCategoryDraft({ name: "", description: "", sortOrder: "" });
    setEditingCategoryId(null);
    toastSuccess("Batch changes canceled.", "Batching");
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, seedCategories]);

  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isSavingBatch || isMutatingAction) return;
    setIsSavingBatch(true);
    setIsMutatingAction(true);
    try {
      await executeCategoryBatchSave(categoryChanges);
      setCategoryChanges(createEmptyCategoryChanges());
      batchActiveRef.current = false;
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally {
      setIsMutatingAction(false);
      setIsSavingBatch(false);
      setEditingCategoryId(null);
    }
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, pendingSummary.total, router, categoryChanges]);

  // -- submit handlers
  const submitAddCategory = useCallback(() => {
    const categoryName = normalizeText(categoryDraft.name);
    if (!categoryName) { toastError("Category name is required."); return; }
    const description = normalizeOptionalText(categoryDraft.description);
    const requestedOrder = normalizeSortOrder(categoryDraft.sortOrder);
    const maxOrder = orderedCategories.reduce((max, c) => Math.max(max, Number(c?.sort_order || 0)), 0);
    const sortOrder = requestedOrder > 0 ? requestedOrder : maxOrder + 1;
    const tempCategoryId = createTempId(TEMP_CATEGORY_PREFIX);

    setOrderedCategories((prev) => [
      ...prev,
      mapCategoryRow({ category_id: tempCategoryId, name: categoryName, description, sort_order: sortOrder, is_active: true }, prev.length),
    ]);
    setCategoryChanges((prev) => ({
      ...prev,
      creates: [...prev.creates, { tempId: tempCategoryId, payload: { name: categoryName, description, sort_order: sortOrder, is_active: true } }],
    }));
    setDialog(EMPTY_DIALOG);
    setCategoryDraft({ name: "", description: "", sortOrder: "" });
    toastSuccess("Category staged for Save Batch.", "Batching");
  }, [categoryDraft.description, categoryDraft.name, categoryDraft.sortOrder, orderedCategories]);

  const submitEditCategory = useCallback(() => {
    const row = dialog?.target;
    if (!row?.category_id) { toastError("Invalid category."); return; }
    const categoryName = normalizeText(categoryDraft.name);
    if (!categoryName) { toastError("Category name is required."); return; }
    const description = normalizeOptionalText(categoryDraft.description);
    const sortOrder = normalizeSortOrder(categoryDraft.sortOrder);
    const categoryId = row.category_id;
    setOrderedCategories((prev) =>
      prev.map((category, index) => {
        if (!isSameId(category?.category_id, categoryId)) return category;
        return mapCategoryRow({ ...category, name: categoryName, description, sort_order: sortOrder }, index);
      }),
    );
    setCategoryChanges((prev) => {
      if (isTempCategoryId(categoryId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, categoryId)) return entry;
            return { ...entry, payload: { ...entry.payload, name: categoryName, description, sort_order: sortOrder } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(categoryId)]: mergeUpdatePatch(prev.updates?.[String(categoryId)], { name: categoryName, description, sort_order: sortOrder }),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    setCategoryDraft({ name: "", description: "", sortOrder: "" });
    toastSuccess("Category edit staged for Save Batch.", "Batching");
  }, [dialog?.target, categoryDraft.description, categoryDraft.name, categoryDraft.sortOrder]);

  const submitToggleCategory = useCallback(() => {
    const row = dialog?.target;
    if (!row?.category_id) { toastError("Invalid category."); return; }
    const categoryId = row.category_id;
    const nextIsActive = Boolean(dialog?.nextIsActive);
    setOrderedCategories((prev) =>
      prev.map((category, index) => {
        if (!isSameId(category?.category_id, categoryId)) return category;
        return mapCategoryRow({ ...category, is_active: nextIsActive }, index);
      }),
    );
    setCategoryChanges((prev) => {
      if (isTempCategoryId(categoryId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, categoryId)) return entry;
            return { ...entry, payload: { ...entry.payload, is_active: nextIsActive } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(categoryId)]: mergeUpdatePatch(prev.updates?.[String(categoryId)], { is_active: nextIsActive }),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(nextIsActive ? "Category enabled - staged for Save Batch." : "Category disabled - staged for Save Batch.", "Batching");
  }, [dialog?.nextIsActive, dialog?.target]);

  const submitDeactivateCategory = useCallback(() => {
    const row = dialog?.target;
    if (!row?.category_id) { toastError("Invalid category."); return; }
    const categoryId = row.category_id;
    if (isTempCategoryId(categoryId)) {
      setOrderedCategories((prev) => prev.filter((category) => !isSameId(category?.category_id, categoryId)));
      setCategoryChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((entry) => !isSameId(entry?.tempId, categoryId)),
        updates: removeObjectKey(prev.updates, String(categoryId)),
      }));
      setDialog(EMPTY_DIALOG);
      toastSuccess("Staged category removed.", "Batching");
      return;
    }
    setCategoryChanges((prev) => ({
      ...prev,
      deactivations: appendUniqueId(prev.deactivations, categoryId),
    }));
    setDialog(EMPTY_DIALOG);
    toastSuccess("Category deactivation staged for Save Batch.", "Batching");
  }, [dialog?.target]);

  // -- row editing
  const startEditingCategory = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const id = String(row?.category_id ?? "");
    setEditingCategoryId((prev) => prev === id ? null : id);
  }, [isMutatingAction, isSavingBatch]);

  const stopEditingCategory = useCallback(() => { setEditingCategoryId(null); }, []);

  // -- inline edit
  const handleInlineEdit = useCallback((row, key, value) => {
    const categoryId = row?.category_id;
    if (!categoryId || isMutatingAction || isSavingBatch) return;
    let nextValue = value;
    if (key === "sort_order") {
      nextValue = normalizeSortOrder(value);
    } else if (key === "description") {
      nextValue = normalizeOptionalText(value);
    } else {
      nextValue = normalizeText(value);
    }
    setOrderedCategories((prev) =>
      prev.map((category, index) => {
        if (!isSameId(category?.category_id, categoryId)) return category;
        return mapCategoryRow({ ...category, [key]: nextValue }, index);
      }),
    );
    setCategoryChanges((prev) => {
      const isCreated = (prev.creates || []).some((entry) => isSameId(entry?.tempId, categoryId));
      if (isCreated) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, categoryId)) return entry;
            return { ...entry, payload: { ...entry.payload, [key]: nextValue } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(categoryId)]: mergeUpdatePatch(prev.updates?.[String(categoryId)], { [key]: nextValue }),
        },
      };
    });
  }, [isMutatingAction, isSavingBatch]);

  // -- drag-and-drop reorder
  const handleReorder = useCallback((nextRows) => {
    if (isMutatingAction || isSavingBatch) return;
    const ordered = Array.isArray(nextRows) ? nextRows : [];
    const nextIds = ordered.map((row) => String(row?.category_id ?? ""));
    const nextOrderById = new Map();
    nextIds.forEach((id, index) => nextOrderById.set(id, index + 1));

    setOrderedCategories((prev) => {
      const byId = new Map(prev.map((category) => [String(category?.category_id ?? ""), category]));
      return nextIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((category, index) => mapCategoryRow({ ...category, sort_order: index + 1 }, index));
    });

    setCategoryChanges((prev) => {
      const updates = { ...(prev.updates || {}) };
      const creates = (prev.creates || []).map((entry) => {
        const tempId = String(entry?.tempId ?? "");
        const nextOrder = nextOrderById.get(tempId);
        if (nextOrder == null) return entry;
        if (Number(entry?.payload?.sort_order ?? 0) === nextOrder) return entry;
        return { ...entry, payload: { ...entry.payload, sort_order: nextOrder } };
      });

      for (const row of ordered) {
        const categoryId = String(row?.category_id ?? "");
        if (isTempCategoryId(categoryId)) continue;
        const nextOrder = nextOrderById.get(categoryId);
        if (nextOrder == null) continue;
        if (Number(row?.sort_order ?? 0) === nextOrder) continue;
        updates[categoryId] = mergeUpdatePatch(updates[categoryId], { sort_order: nextOrder });
      }

      return { ...prev, updates, creates };
    });

    toastSuccess("Category order staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  return {
    decoratedCategories, dialog, categoryDraft, isSavingBatch, isMutatingAction,
    pendingSummary, hasPendingChanges, pendingDeactivatedCategoryIds,
    setDialog, setCategoryDraft, closeDialog, openAddCategoryDialog, openEditCategoryDialog,
    openToggleCategoryDialog, openDeactivateCategoryDialog, stageHardDeleteCategory, unstageHardDeleteCategory,
    handleCancelBatch, handleSaveBatch, submitAddCategory, submitEditCategory,
    submitToggleCategory, submitDeactivateCategory, editingCategoryId, startEditingCategory,
    stopEditingCategory, handleInlineEdit, handleReorder,
  };
}

// --- HOOK: usePanelTypes ---

function usePanelTypes({ panelTypes = [] }) {
  const router = useRouter();

  const panelTypesKey = useMemo(
    () => JSON.stringify(Array.isArray(panelTypes) ? panelTypes : []),
    [panelTypes],
  );

  const seedPanelTypes = useMemo(
    () =>
      (Array.isArray(panelTypes) ? panelTypes : [])
        .map((panelType, index) => mapPanelTypeRow(panelType, index))
        .sort((left, right) => {
          const orderDiff = (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0);
          if (orderDiff !== 0) return orderDiff;
          return compareText(left.panel_name, right.panel_name);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelTypesKey],
  );

  const [orderedPanelTypes, setOrderedPanelTypes] = useState(seedPanelTypes);
  const [panelTypeChanges, setPanelTypeChanges] = useState(createEmptyPanelTypeChanges());
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [panelTypeDraft, setPanelTypeDraft] = useState({ panelName: "", panelDescription: "", locationType: "", sortOrder: "" });
  const [editingPanelTypeId, setEditingPanelTypeId] = useState(null);
  const batchActiveRef = useRef(false);

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedPanelTypes(seedPanelTypes);
    setPanelTypeChanges(createEmptyPanelTypeChanges());
    setDialog(EMPTY_DIALOG);
    setPanelTypeDraft({ panelName: "", panelDescription: "", locationType: "", sortOrder: "" });
    setIsMutatingAction(false);
    setIsSavingBatch(false);
    setEditingPanelTypeId(null);
  }, [seedPanelTypes]);

  const pendingSummary = useMemo(() => {
    const added = panelTypeChanges.creates.length;
    const edited = Object.keys(panelTypeChanges.updates || {}).length;
    const deleted = (panelTypeChanges.deletes || []).length;
    return { added, edited, deleted, total: added + edited + deleted };
  }, [panelTypeChanges]);

  const hasPendingChanges = pendingSummary.total > 0;

  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeletedPanelTypeIds = useMemo(
    () => new Set((panelTypeChanges.deletes || []).map((id) => String(id ?? ""))),
    [panelTypeChanges.deletes],
  );

  const decoratedPanelTypes = useMemo(() => {
    const createdIds = new Set((panelTypeChanges.creates || []).map((entry) => String(entry?.tempId ?? "")));
    const updatesMap = panelTypeChanges.updates || {};
    const deletedIds = new Set((panelTypeChanges.deletes || []).map((entry) => String(entry ?? "")));

    return orderedPanelTypes.map((row) => {
      const id = String(row?.panel_type_id ?? "");
      if (deletedIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (createdIds.has(id)) return { ...row, __batchState: "created" };
      const updates = updatesMap[id];
      if (updates) return { ...row, __batchState: "updated" };
      return { ...row, __batchState: "none" };
    });
  }, [panelTypeChanges.creates, panelTypeChanges.deletes, panelTypeChanges.updates, orderedPanelTypes]);

  // -- dialog actions
  const closeDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog(EMPTY_DIALOG);
  }, [isMutatingAction, isSavingBatch]);

  const openAddPanelTypeDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setPanelTypeDraft({ panelName: "", panelDescription: "", locationType: "", sortOrder: "" });
    setDialog({ kind: "add-panel-type", target: null, nextIsActive: true });
  }, [isMutatingAction, isSavingBatch]);

  const openEditPanelTypeDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setPanelTypeDraft({
      panelName: String(row?.panel_name || ""),
      panelDescription: String(row?.panel_description || ""),
      locationType: String(row?.location_type || ""),
      sortOrder: String(row?.sort_order ?? ""),
    });
    setDialog({ kind: "edit-panel-type", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const stageHardDeletePanelType = useCallback((row) => {
    const panelTypeId = String(row?.panel_type_id ?? "");
    if (!panelTypeId || isMutatingAction || isSavingBatch) return;

    if (isTempPanelTypeId(panelTypeId)) {
      setOrderedPanelTypes((prev) => prev.filter((p) => !isSameId(p?.panel_type_id, panelTypeId)));
      setPanelTypeChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, panelTypeId)),
        updates: removeObjectKey(prev.updates, panelTypeId),
      }));
      toastSuccess("Staged panel type removed.", "Batching");
      return;
    }

    setPanelTypeChanges((prev) => ({
      ...prev,
      updates: removeObjectKey(prev.updates, String(panelTypeId)),
      deletes: appendUniqueId(prev.deletes || [], panelTypeId),
    }));
    toastSuccess("Panel type deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  const unstageHardDeletePanelType = useCallback((row) => {
    const panelTypeId = String(row?.panel_type_id ?? "");
    if (!panelTypeId || isMutatingAction || isSavingBatch) return;
    setPanelTypeChanges((prev) => ({
      ...prev,
      deletes: (prev.deletes || []).filter((id) => !isSameId(id, panelTypeId)),
    }));
    toastSuccess("Panel type deletion un-staged.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  // -- batch actions
  const handleCancelBatch = useCallback(() => {
    if (isMutatingAction || isSavingBatch || !hasPendingChanges) return;
    batchActiveRef.current = false;
    setOrderedPanelTypes(seedPanelTypes);
    setPanelTypeChanges(createEmptyPanelTypeChanges());
    setDialog(EMPTY_DIALOG);
    setPanelTypeDraft({ panelName: "", panelDescription: "", locationType: "", sortOrder: "" });
    setEditingPanelTypeId(null);
    toastSuccess("Batch changes canceled.", "Batching");
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, seedPanelTypes]);

  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isSavingBatch || isMutatingAction) return;
    setIsSavingBatch(true);
    setIsMutatingAction(true);
    try {
      await executePanelTypeBatchSave(panelTypeChanges);
      setPanelTypeChanges(createEmptyPanelTypeChanges());
      batchActiveRef.current = false;
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally {
      setIsMutatingAction(false);
      setIsSavingBatch(false);
      setEditingPanelTypeId(null);
    }
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, pendingSummary.total, router, panelTypeChanges]);

  // -- submit handlers
  const submitAddPanelType = useCallback(() => {
    const panelName = normalizeText(panelTypeDraft.panelName);
    if (!panelName) { toastError("Panel name is required."); return; }
    const panelDescription = normalizeOptionalText(panelTypeDraft.panelDescription);
    const locationType = normalizeOptionalText(panelTypeDraft.locationType);
    const requestedOrder = normalizeSortOrder(panelTypeDraft.sortOrder);
    const maxOrder = orderedPanelTypes.reduce((max, p) => Math.max(max, Number(p?.sort_order || 0)), 0);
    const sortOrder = requestedOrder > 0 ? requestedOrder : maxOrder + 1;
    const tempPanelTypeId = createTempId(TEMP_PANEL_TYPE_PREFIX);

    setOrderedPanelTypes((prev) => [
      ...prev,
      mapPanelTypeRow({ panel_type_id: tempPanelTypeId, panel_name: panelName, panel_description: panelDescription, location_type: locationType, sort_order: sortOrder }, prev.length),
    ]);
    setPanelTypeChanges((prev) => ({
      ...prev,
      creates: [...prev.creates, { tempId: tempPanelTypeId, payload: { panel_name: panelName, panel_description: panelDescription, location_type: locationType, sort_order: sortOrder } }],
    }));
    setDialog(EMPTY_DIALOG);
    setPanelTypeDraft({ panelName: "", panelDescription: "", locationType: "", sortOrder: "" });
    toastSuccess("Panel type staged for Save Batch.", "Batching");
  }, [panelTypeDraft.panelName, panelTypeDraft.panelDescription, panelTypeDraft.locationType, panelTypeDraft.sortOrder, orderedPanelTypes]);

  const submitEditPanelType = useCallback(() => {
    const row = dialog?.target;
    if (!row?.panel_type_id) { toastError("Invalid panel type."); return; }
    const panelName = normalizeText(panelTypeDraft.panelName);
    if (!panelName) { toastError("Panel name is required."); return; }
    const panelDescription = normalizeOptionalText(panelTypeDraft.panelDescription);
    const locationType = normalizeOptionalText(panelTypeDraft.locationType);
    const sortOrder = normalizeSortOrder(panelTypeDraft.sortOrder);
    const panelTypeId = row.panel_type_id;
    setOrderedPanelTypes((prev) =>
      prev.map((panelType, index) => {
        if (!isSameId(panelType?.panel_type_id, panelTypeId)) return panelType;
        return mapPanelTypeRow({ ...panelType, panel_name: panelName, panel_description: panelDescription, location_type: locationType, sort_order: sortOrder }, index);
      }),
    );
    setPanelTypeChanges((prev) => {
      if (isTempPanelTypeId(panelTypeId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, panelTypeId)) return entry;
            return { ...entry, payload: { ...entry.payload, panel_name: panelName, panel_description: panelDescription, location_type: locationType, sort_order: sortOrder } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(panelTypeId)]: mergeUpdatePatch(prev.updates?.[String(panelTypeId)], { panel_name: panelName, panel_description: panelDescription, location_type: locationType, sort_order: sortOrder }),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    setPanelTypeDraft({ panelName: "", panelDescription: "", locationType: "", sortOrder: "" });
    toastSuccess("Panel type edit staged for Save Batch.", "Batching");
  }, [dialog?.target, panelTypeDraft.panelName, panelTypeDraft.panelDescription, panelTypeDraft.locationType, panelTypeDraft.sortOrder]);

  // -- row editing
  const startEditingPanelType = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const id = String(row?.panel_type_id ?? "");
    setEditingPanelTypeId((prev) => prev === id ? null : id);
  }, [isMutatingAction, isSavingBatch]);

  const stopEditingPanelType = useCallback(() => { setEditingPanelTypeId(null); }, []);

  // -- inline edit
  const handleInlineEdit = useCallback((row, key, value) => {
    const panelTypeId = row?.panel_type_id;
    if (!panelTypeId || isMutatingAction || isSavingBatch) return;
    let nextValue = value;
    if (key === "sort_order") {
      nextValue = normalizeSortOrder(value);
    } else if (key === "panel_description" || key === "location_type") {
      nextValue = normalizeOptionalText(value);
    } else {
      nextValue = normalizeText(value);
    }
    setOrderedPanelTypes((prev) =>
      prev.map((panelType, index) => {
        if (!isSameId(panelType?.panel_type_id, panelTypeId)) return panelType;
        return mapPanelTypeRow({ ...panelType, [key]: nextValue }, index);
      }),
    );
    setPanelTypeChanges((prev) => {
      const isCreated = (prev.creates || []).some((entry) => isSameId(entry?.tempId, panelTypeId));
      if (isCreated) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, panelTypeId)) return entry;
            return { ...entry, payload: { ...entry.payload, [key]: nextValue } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(panelTypeId)]: mergeUpdatePatch(prev.updates?.[String(panelTypeId)], { [key]: nextValue }),
        },
      };
    });
  }, [isMutatingAction, isSavingBatch]);

  // -- drag-and-drop reorder
  const handleReorder = useCallback((nextRows) => {
    if (isMutatingAction || isSavingBatch) return;
    const ordered = Array.isArray(nextRows) ? nextRows : [];
    const nextIds = ordered.map((row) => String(row?.panel_type_id ?? ""));
    const nextOrderById = new Map();
    nextIds.forEach((id, index) => nextOrderById.set(id, index + 1));

    setOrderedPanelTypes((prev) => {
      const byId = new Map(prev.map((panelType) => [String(panelType?.panel_type_id ?? ""), panelType]));
      return nextIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((panelType, index) => mapPanelTypeRow({ ...panelType, sort_order: index + 1 }, index));
    });

    setPanelTypeChanges((prev) => {
      const updates = { ...(prev.updates || {}) };
      const creates = (prev.creates || []).map((entry) => {
        const tempId = String(entry?.tempId ?? "");
        const nextOrder = nextOrderById.get(tempId);
        if (nextOrder == null) return entry;
        if (Number(entry?.payload?.sort_order ?? 0) === nextOrder) return entry;
        return { ...entry, payload: { ...entry.payload, sort_order: nextOrder } };
      });

      for (const row of ordered) {
        const panelTypeId = String(row?.panel_type_id ?? "");
        if (isTempPanelTypeId(panelTypeId)) continue;
        const nextOrder = nextOrderById.get(panelTypeId);
        if (nextOrder == null) continue;
        if (Number(row?.sort_order ?? 0) === nextOrder) continue;
        updates[panelTypeId] = mergeUpdatePatch(updates[panelTypeId], { sort_order: nextOrder });
      }

      return { ...prev, updates, creates };
    });

    toastSuccess("Panel type order staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  return {
    decoratedPanelTypes, dialog, panelTypeDraft, isSavingBatch, isMutatingAction,
    pendingSummary, hasPendingChanges, pendingDeletedPanelTypeIds,
    setDialog, setPanelTypeDraft, closeDialog, openAddPanelTypeDialog, openEditPanelTypeDialog,
    stageHardDeletePanelType, unstageHardDeletePanelType,
    handleCancelBatch, handleSaveBatch, submitAddPanelType, submitEditPanelType,
    editingPanelTypeId, startEditingPanelType, stopEditingPanelType, handleInlineEdit, handleReorder,
  };
}

// --- HOOK: useStyles ---

function useStyles({ styles = [] }) {
  const router = useRouter();

  const stylesKey = useMemo(
    () => JSON.stringify(Array.isArray(styles) ? styles : []),
    [styles],
  );

  const seedStyles = useMemo(
    () =>
      (Array.isArray(styles) ? styles : [])
        .map((style, index) => mapStyleRow(style, index))
        .sort((left, right) => {
          const orderDiff = (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0);
          if (orderDiff !== 0) return orderDiff;
          return compareText(left.name, right.name);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stylesKey],
  );

  const [orderedStyles, setOrderedStyles] = useState(seedStyles);
  const [styleChanges, setStyleChanges] = useState(createEmptyStyleChanges());
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [styleDraft, setStyleDraft] = useState(emptyStyleDraft());
  const [editingStyleId, setEditingStyleId] = useState(null);
  const batchActiveRef = useRef(false);

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedStyles(seedStyles);
    setStyleChanges(createEmptyStyleChanges());
    setDialog(EMPTY_DIALOG);
    setStyleDraft(emptyStyleDraft());
    setIsMutatingAction(false);
    setIsSavingBatch(false);
    setEditingStyleId(null);
  }, [seedStyles]);

  const pendingSummary = useMemo(() => {
    const added = styleChanges.creates.length;
    const edited = Object.keys(styleChanges.updates || {}).length;
    const deactivated = styleChanges.deactivations.length;
    const hardDeleted = (styleChanges.hardDeletes || []).length;
    return { added, edited, deactivated, hardDeleted, total: added + edited + deactivated + hardDeleted };
  }, [styleChanges]);

  const hasPendingChanges = pendingSummary.total > 0;

  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedStyleIds = useMemo(
    () => new Set((styleChanges.deactivations || []).map((id) => String(id ?? ""))),
    [styleChanges.deactivations],
  );

  const decoratedStyles = useMemo(() => {
    const createdIds = new Set((styleChanges.creates || []).map((entry) => String(entry?.tempId ?? "")));
    const updatesMap = styleChanges.updates || {};
    const deactivatedIds = new Set((styleChanges.deactivations || []).map((entry) => String(entry ?? "")));
    const hardDeletedIds = new Set((styleChanges.hardDeletes || []).map((entry) => String(entry ?? "")));

    return orderedStyles.map((row) => {
      const id = String(row?.style_id ?? "");
      if (hardDeletedIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (deactivatedIds.has(id)) return { ...row, __batchState: "deleted" };
      if (createdIds.has(id)) return { ...row, __batchState: "created" };
      const updates = updatesMap[id];
      if (updates) {
        const hasIsActive = Object.prototype.hasOwnProperty.call(updates, "is_active");
        if (hasIsActive) return { ...row, __batchState: updates.is_active ? "activated" : "deactivated" };
        return { ...row, __batchState: "updated" };
      }
      return { ...row, __batchState: "none" };
    });
  }, [styleChanges.creates, styleChanges.deactivations, styleChanges.hardDeletes, styleChanges.updates, orderedStyles]);

  // -- dialog actions
  const closeDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog(EMPTY_DIALOG);
  }, [isMutatingAction, isSavingBatch]);

  const openAddStyleDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setStyleDraft(emptyStyleDraft());
    setDialog({ kind: "add-style", target: null, nextIsActive: true });
  }, [isMutatingAction, isSavingBatch]);

  const openEditStyleDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setStyleDraft({
      name: String(row?.name || ""),
      description: String(row?.description || ""),
      sortOrder: String(row?.sort_order ?? ""),
      renderKey: String(row?.render_key || ""),
      defaultRoofPitch: String(row?.default_roof_pitch ?? ""),
      defaultWidth: String(row?.default_width ?? ""),
      defaultLength: String(row?.default_length ?? ""),
      defaultHeight: String(row?.default_height ?? ""),
      defaultRoofOverhang: String(row?.default_roof_overhang ?? ""),
      hasWalls: row?.has_walls_bool ? "true" : "false",
      iconPath: String(row?.icon_path || ""),
    });
    setDialog({ kind: "edit-style", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const openToggleStyleDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const styleId = String(row?.style_id ?? "");
    if (pendingDeactivatedStyleIds.has(styleId)) {
      setStyleChanges((prev) => ({
        ...prev,
        deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, styleId)),
      }));
      toastSuccess("Style deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-style", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [isMutatingAction, isSavingBatch, pendingDeactivatedStyleIds]);

  const openDeactivateStyleDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog({ kind: "deactivate-style", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const stageHardDeleteStyle = useCallback((row) => {
    const styleId = String(row?.style_id ?? "");
    if (!styleId || isMutatingAction || isSavingBatch) return;

    if (isTempStyleId(styleId)) {
      setOrderedStyles((prev) => prev.filter((s) => !isSameId(s?.style_id, styleId)));
      setStyleChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, styleId)),
        updates: removeObjectKey(prev.updates, styleId),
      }));
      toastSuccess("Staged style removed.", "Batching");
      return;
    }

    setStyleChanges((prev) => ({
      ...prev,
      deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, styleId)),
      updates: removeObjectKey(prev.updates, String(styleId)),
      hardDeletes: appendUniqueId(prev.hardDeletes || [], styleId),
    }));
    toastSuccess("Style deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  const unstageHardDeleteStyle = useCallback((row) => {
    const styleId = String(row?.style_id ?? "");
    if (!styleId || isMutatingAction || isSavingBatch) return;
    setStyleChanges((prev) => ({
      ...prev,
      hardDeletes: (prev.hardDeletes || []).filter((id) => !isSameId(id, styleId)),
    }));
    toastSuccess("Style deletion un-staged.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  // -- batch actions
  const handleCancelBatch = useCallback(() => {
    if (isMutatingAction || isSavingBatch || !hasPendingChanges) return;
    batchActiveRef.current = false;
    setOrderedStyles(seedStyles);
    setStyleChanges(createEmptyStyleChanges());
    setDialog(EMPTY_DIALOG);
    setStyleDraft(emptyStyleDraft());
    setEditingStyleId(null);
    toastSuccess("Batch changes canceled.", "Batching");
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, seedStyles]);

  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isSavingBatch || isMutatingAction) return;
    setIsSavingBatch(true);
    setIsMutatingAction(true);
    try {
      await executeStyleBatchSave(styleChanges);
      setStyleChanges(createEmptyStyleChanges());
      batchActiveRef.current = false;
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally {
      setIsMutatingAction(false);
      setIsSavingBatch(false);
      setEditingStyleId(null);
    }
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, pendingSummary.total, router, styleChanges]);

  // -- submit handlers
  const submitAddStyle = useCallback(() => {
    const values = buildStyleDraftValues(styleDraft);
    if (!values.name) { toastError("Style name is required."); return; }
    const requestedOrder = normalizeSortOrder(styleDraft.sortOrder);
    const maxOrder = orderedStyles.reduce((max, s) => Math.max(max, Number(s?.sort_order || 0)), 0);
    const sortOrder = requestedOrder > 0 ? requestedOrder : maxOrder + 1;
    const tempStyleId = createTempId(TEMP_STYLE_PREFIX);
    const payload = { ...values, sort_order: sortOrder, is_active: true };

    setOrderedStyles((prev) => [...prev, mapStyleRow({ style_id: tempStyleId, ...payload }, prev.length)]);
    setStyleChanges((prev) => ({
      ...prev,
      creates: [...prev.creates, { tempId: tempStyleId, payload }],
    }));
    setDialog(EMPTY_DIALOG);
    setStyleDraft(emptyStyleDraft());
    toastSuccess("Style staged for Save Batch.", "Batching");
  }, [styleDraft, orderedStyles]);

  const submitEditStyle = useCallback(() => {
    const row = dialog?.target;
    if (!row?.style_id) { toastError("Invalid style."); return; }
    const values = buildStyleDraftValues(styleDraft);
    if (!values.name) { toastError("Style name is required."); return; }
    const sortOrder = normalizeSortOrder(styleDraft.sortOrder);
    const styleId = row.style_id;
    const payload = { ...values, sort_order: sortOrder };
    setOrderedStyles((prev) =>
      prev.map((style, index) => {
        if (!isSameId(style?.style_id, styleId)) return style;
        return mapStyleRow({ ...style, ...payload }, index);
      }),
    );
    setStyleChanges((prev) => {
      if (isTempStyleId(styleId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, styleId)) return entry;
            return { ...entry, payload: { ...entry.payload, ...payload } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(styleId)]: mergeUpdatePatch(prev.updates?.[String(styleId)], payload),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    setStyleDraft(emptyStyleDraft());
    toastSuccess("Style edit staged for Save Batch.", "Batching");
  }, [dialog?.target, styleDraft]);

  const submitToggleStyle = useCallback(() => {
    const row = dialog?.target;
    if (!row?.style_id) { toastError("Invalid style."); return; }
    const styleId = row.style_id;
    const nextIsActive = Boolean(dialog?.nextIsActive);
    setOrderedStyles((prev) =>
      prev.map((style, index) => {
        if (!isSameId(style?.style_id, styleId)) return style;
        return mapStyleRow({ ...style, is_active: nextIsActive }, index);
      }),
    );
    setStyleChanges((prev) => {
      if (isTempStyleId(styleId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, styleId)) return entry;
            return { ...entry, payload: { ...entry.payload, is_active: nextIsActive } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(styleId)]: mergeUpdatePatch(prev.updates?.[String(styleId)], { is_active: nextIsActive }),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(nextIsActive ? "Style enabled - staged for Save Batch." : "Style disabled - staged for Save Batch.", "Batching");
  }, [dialog?.nextIsActive, dialog?.target]);

  const submitDeactivateStyle = useCallback(() => {
    const row = dialog?.target;
    if (!row?.style_id) { toastError("Invalid style."); return; }
    const styleId = row.style_id;
    if (isTempStyleId(styleId)) {
      setOrderedStyles((prev) => prev.filter((style) => !isSameId(style?.style_id, styleId)));
      setStyleChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((entry) => !isSameId(entry?.tempId, styleId)),
        updates: removeObjectKey(prev.updates, String(styleId)),
      }));
      setDialog(EMPTY_DIALOG);
      toastSuccess("Staged style removed.", "Batching");
      return;
    }
    setStyleChanges((prev) => ({
      ...prev,
      deactivations: appendUniqueId(prev.deactivations, styleId),
    }));
    setDialog(EMPTY_DIALOG);
    toastSuccess("Style deactivation staged for Save Batch.", "Batching");
  }, [dialog?.target]);

  // -- row editing
  const startEditingStyle = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const id = String(row?.style_id ?? "");
    setEditingStyleId((prev) => prev === id ? null : id);
  }, [isMutatingAction, isSavingBatch]);

  const stopEditingStyle = useCallback(() => { setEditingStyleId(null); }, []);

  // -- inline edit
  const handleInlineEdit = useCallback((row, key, value) => {
    const styleId = row?.style_id;
    if (!styleId || isMutatingAction || isSavingBatch) return;
    let nextValue = value;
    if (key === "default_roof_pitch") {
      nextValue = normalizeDefaultNumber(value, 0.25);
    } else if (key === "default_width") {
      nextValue = normalizeDefaultInteger(value, 12);
    } else if (key === "default_length") {
      nextValue = normalizeDefaultInteger(value, 20);
    } else if (key === "default_height") {
      nextValue = normalizeDefaultInteger(value, 6);
    } else if (key === "sort_order") {
      nextValue = normalizeSortOrder(value);
    } else if (key === "description" || key === "render_key" || key === "icon_path" || key === "default_roof_overhang") {
      nextValue = normalizeOptionalText(value);
    } else {
      nextValue = normalizeText(value);
    }
    setOrderedStyles((prev) =>
      prev.map((style, index) => {
        if (!isSameId(style?.style_id, styleId)) return style;
        return mapStyleRow({ ...style, [key]: nextValue }, index);
      }),
    );
    setStyleChanges((prev) => {
      const isCreated = (prev.creates || []).some((entry) => isSameId(entry?.tempId, styleId));
      if (isCreated) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, styleId)) return entry;
            return { ...entry, payload: { ...entry.payload, [key]: nextValue } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(styleId)]: mergeUpdatePatch(prev.updates?.[String(styleId)], { [key]: nextValue }),
        },
      };
    });
  }, [isMutatingAction, isSavingBatch]);

  // -- drag-and-drop reorder
  const handleReorder = useCallback((nextRows) => {
    if (isMutatingAction || isSavingBatch) return;
    const ordered = Array.isArray(nextRows) ? nextRows : [];
    const nextIds = ordered.map((row) => String(row?.style_id ?? ""));
    const nextOrderById = new Map();
    nextIds.forEach((id, index) => nextOrderById.set(id, index + 1));

    setOrderedStyles((prev) => {
      const byId = new Map(prev.map((style) => [String(style?.style_id ?? ""), style]));
      return nextIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((style, index) => mapStyleRow({ ...style, sort_order: index + 1 }, index));
    });

    setStyleChanges((prev) => {
      const updates = { ...(prev.updates || {}) };
      const creates = (prev.creates || []).map((entry) => {
        const tempId = String(entry?.tempId ?? "");
        const nextOrder = nextOrderById.get(tempId);
        if (nextOrder == null) return entry;
        if (Number(entry?.payload?.sort_order ?? 0) === nextOrder) return entry;
        return { ...entry, payload: { ...entry.payload, sort_order: nextOrder } };
      });

      for (const row of ordered) {
        const styleId = String(row?.style_id ?? "");
        if (isTempStyleId(styleId)) continue;
        const nextOrder = nextOrderById.get(styleId);
        if (nextOrder == null) continue;
        if (Number(row?.sort_order ?? 0) === nextOrder) continue;
        updates[styleId] = mergeUpdatePatch(updates[styleId], { sort_order: nextOrder });
      }

      return { ...prev, updates, creates };
    });

    toastSuccess("Style order staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  return {
    decoratedStyles, dialog, styleDraft, isSavingBatch, isMutatingAction,
    pendingSummary, hasPendingChanges, pendingDeactivatedStyleIds,
    setDialog, setStyleDraft, closeDialog, openAddStyleDialog, openEditStyleDialog,
    openToggleStyleDialog, openDeactivateStyleDialog, stageHardDeleteStyle, unstageHardDeleteStyle,
    handleCancelBatch, handleSaveBatch, submitAddStyle, submitEditStyle,
    submitToggleStyle, submitDeactivateStyle, editingStyleId, startEditingStyle,
    stopEditingStyle, handleInlineEdit, handleReorder,
  };
}

// --- CATEGORY SUB-COMPONENTS ---

function CategoryHeader({ hasPendingChanges, pendingSummary, isSavingBatch, isMutatingAction, handleSaveBatch, handleCancelBatch, openAddCategoryDialog }) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <h4 className="mb-0">Categories</h4>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {hasPendingChanges ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "#856404", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "999px", padding: "0.25rem 0.7rem", lineHeight: 1.4 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#d39e00", flexShrink: 0 }} />
            {pendingSummary.total} pending
          </span>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSavingBatch} disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleSaveBatch}>
          Save Batch
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleCancelBatch}>
          Cancel Batch
        </Button>
        <Button type="button" size="sm" variant="success" disabled={isSavingBatch || isMutatingAction} onClick={openAddCategoryDialog}>
          Add Category
        </Button>
      </div>
    </div>
  );
}

function CategoryTable({ decoratedCategories, isMutatingAction, isSavingBatch, pendingDeactivatedCategoryIds, editingCategoryId, onStartEditing, onStopEditing, onInlineEdit, openToggleCategoryDialog, openDeactivateCategoryDialog, stageHardDeleteCategory, onUndoBatchAction, onReorder }) {
  const columns = useMemo(
    () => [
      {
        key: "name", label: "Category Name", width: "30%", sortable: true,
        render: (row) => {
          const batchState = String(row?.__batchState || "");
          const isEditing = String(row?.category_id ?? "") === String(editingCategoryId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          let markerText = "";
          let markerClass = "";
          switch (batchState) {
            case "hardDeleted": markerText = "Deleted"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "deleted": markerText = "Deactivated"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "created": markerText = "New"; markerClass = "psb-batch-marker psb-batch-marker-new"; break;
            case "updated": markerText = "Edited"; markerClass = "psb-batch-marker psb-batch-marker-edited"; break;
            case "activated": markerText = "Activated"; markerClass = "psb-batch-marker psb-batch-marker-activated"; break;
            case "deactivated": markerText = "Deactivated"; markerClass = "psb-batch-marker psb-batch-marker-deactivated"; break;
            default: break;
          }
          return (
            <span>
              <InlineEditCell value={row?.name || ""} onCommit={(val) => onInlineEdit?.(row, "name", val)} onCancel={onStopEditing} disabled={editDisabled} />
              {markerText ? <span className={markerClass}>{markerText}</span> : null}
            </span>
          );
        },
      },
      {
        key: "description", label: "Description", width: "34%", sortable: true,
        render: (row) => {
          const isEditing = String(row?.category_id ?? "") === String(editingCategoryId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={row?.description || ""} onCommit={(val) => onInlineEdit?.(row, "description", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "sort_order", label: "Sort Order", width: "16%", sortable: true, align: "center",
        render: (row) => <span>{row?.sort_order ?? 0}</span>,
      },
      {
        key: "is_active_bool", label: "Active", width: "20%", sortable: true, align: "center",
        render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />,
      },
    ],
    [editingCategoryId, isMutatingAction, isSavingBatch, onInlineEdit, onStopEditing],
  );

  const actions = useMemo(
    () => [
      { key: "edit-category", label: "Edit", type: "secondary", icon: "pen", visible: (row) => String(row?.category_id ?? "") !== String(editingCategoryId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => onStartEditing(row) },
      { key: "cancel-edit-category", label: "Cancel", type: "secondary", icon: "xmark", visible: (row) => String(row?.category_id ?? "") === String(editingCategoryId ?? ""), onClick: () => onStopEditing() },
      { key: "restore-category", label: "Restore", type: "secondary", icon: "rotate-left", visible: (row) => (!Boolean(row?.is_active_bool) || pendingDeactivatedCategoryIds.has(String(row?.category_id ?? ""))) && String(row?.category_id ?? "") !== String(editingCategoryId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openToggleCategoryDialog(row) },
      { key: "deactivate-category", label: "Deactivate", type: "secondary", icon: "ban", visible: (row) => Boolean(row?.is_active_bool) && !pendingDeactivatedCategoryIds.has(String(row?.category_id ?? "")) && String(row?.category_id ?? "") !== String(editingCategoryId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openDeactivateCategoryDialog(row) },
      { key: "delete-category", label: "Delete", type: "danger", icon: "trash", visible: (row) => String(row?.category_id ?? "") !== String(editingCategoryId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => stageHardDeleteCategory(row) },
    ],
    [editingCategoryId, isMutatingAction, isSavingBatch, pendingDeactivatedCategoryIds, onStartEditing, onStopEditing, openToggleCategoryDialog, openDeactivateCategoryDialog, stageHardDeleteCategory],
  );

  return (
    <div className="row g-3 align-items-start">
      <div className="col-12">
        <Card title="Categories" subtitle="Feature categories for Metal Buildings.">
          <TableZ columns={columns} data={decoratedCategories} rowIdKey="category_id" actions={actions} onUndoBatchAction={onUndoBatchAction} filterConfig={CATEGORY_FILTERS} draggable={!isMutatingAction && !isSavingBatch} onReorder={onReorder} emptyMessage="No categories found." />
        </Card>
      </div>
    </div>
  );
}

function CategoryDialog({ dialog, categoryDraft, isMutatingAction, isSavingBatch, setCategoryDraft, closeDialog, submitAddCategory, submitEditCategory, submitToggleCategory, submitDeactivateCategory }) {
  const dialogTitle = useMemo(() => {
    const kind = dialog?.kind;
    if (kind === "add-category") return "Add Category";
    if (kind === "edit-category") return "Edit Category";
    if (kind === "toggle-category") return dialog?.nextIsActive ? "Enable Category" : "Disable Category";
    if (kind === "deactivate-category") return "Deactivate Category";
    return "Category";
  }, [dialog?.kind, dialog?.nextIsActive]);

  if (!dialog?.kind) return null;
  const isBusy = isMutatingAction || isSavingBatch;

  return (
    <Modal show onHide={closeDialog} title={dialogTitle}>
      {(dialog.kind === "add-category" || dialog.kind === "edit-category") ? (
        <div>
          <div className="mb-3">
            <Input label="Category Name" value={categoryDraft.name} onChange={(e) => setCategoryDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Enter category name" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="Description" value={categoryDraft.description} onChange={(e) => setCategoryDraft((prev) => ({ ...prev, description: e.target.value }))} placeholder="Optional description" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="Sort Order" type="number" step="1" value={categoryDraft.sortOrder} onChange={(e) => setCategoryDraft((prev) => ({ ...prev, sortOrder: e.target.value }))} placeholder="0" disabled={isBusy} />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.kind === "add-category" ? "success" : "primary"} size="sm" loading={isBusy} disabled={isBusy} onClick={dialog.kind === "add-category" ? submitAddCategory : submitEditCategory}>
              {dialog.kind === "add-category" ? "Add" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "toggle-category" ? (
        <div>
          <p className="mb-3">{dialog.nextIsActive ? `Enable category "${dialog.target?.name || "--"}"?` : `Disable category "${dialog.target?.name || "--"}"?`}</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.nextIsActive ? "primary" : "secondary"} size="sm" loading={isBusy} disabled={isBusy} onClick={submitToggleCategory}>
              {dialog.nextIsActive ? "Enable" : "Disable"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "deactivate-category" ? (
        <div>
          <p className="mb-3">Deactivate category <strong>&quot;{dialog.target?.name || "--"}&quot;</strong>? This action will be staged for Save Batch.</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant="warning" size="sm" loading={isBusy} disabled={isBusy} onClick={submitDeactivateCategory}>Deactivate</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// --- PANEL TYPE SUB-COMPONENTS ---

function PanelTypeHeader({ hasPendingChanges, pendingSummary, isSavingBatch, isMutatingAction, handleSaveBatch, handleCancelBatch, openAddPanelTypeDialog }) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <h4 className="mb-0">Panel Types</h4>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {hasPendingChanges ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "#856404", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "999px", padding: "0.25rem 0.7rem", lineHeight: 1.4 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#d39e00", flexShrink: 0 }} />
            {pendingSummary.total} pending
          </span>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSavingBatch} disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleSaveBatch}>
          Save Batch
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleCancelBatch}>
          Cancel Batch
        </Button>
        <Button type="button" size="sm" variant="success" disabled={isSavingBatch || isMutatingAction} onClick={openAddPanelTypeDialog}>
          Add Panel Type
        </Button>
      </div>
    </div>
  );
}

function PanelTypeTable({ decoratedPanelTypes, isMutatingAction, isSavingBatch, editingPanelTypeId, onStartEditing, onStopEditing, onInlineEdit, stageHardDeletePanelType, onUndoBatchAction, onReorder }) {
  const columns = useMemo(
    () => [
      {
        key: "panel_name", label: "Panel Name", width: "30%", sortable: true,
        render: (row) => {
          const batchState = String(row?.__batchState || "");
          const isEditing = String(row?.panel_type_id ?? "") === String(editingPanelTypeId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          let markerText = "";
          let markerClass = "";
          switch (batchState) {
            case "hardDeleted": markerText = "Deleted"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "created": markerText = "New"; markerClass = "psb-batch-marker psb-batch-marker-new"; break;
            case "updated": markerText = "Edited"; markerClass = "psb-batch-marker psb-batch-marker-edited"; break;
            default: break;
          }
          return (
            <span>
              <InlineEditCell value={row?.panel_name || ""} onCommit={(val) => onInlineEdit?.(row, "panel_name", val)} onCancel={onStopEditing} disabled={editDisabled} />
              {markerText ? <span className={markerClass}>{markerText}</span> : null}
            </span>
          );
        },
      },
      {
        key: "panel_description", label: "Description", width: "34%", sortable: true,
        render: (row) => {
          const isEditing = String(row?.panel_type_id ?? "") === String(editingPanelTypeId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={row?.panel_description || ""} onCommit={(val) => onInlineEdit?.(row, "panel_description", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "location_type", label: "Location Type", width: "20%", sortable: true, align: "center",
        render: (row) => <span>{row?.location_type || "—"}</span>,
      },
      {
        key: "sort_order", label: "Sort Order", width: "16%", sortable: true, align: "center",
        render: (row) => <span>{row?.sort_order ?? 0}</span>,
      },
    ],
    [editingPanelTypeId, isMutatingAction, isSavingBatch, onInlineEdit, onStopEditing],
  );

  const actions = useMemo(
    () => [
      { key: "edit-panel-type", label: "Edit", type: "secondary", icon: "pen", visible: (row) => String(row?.panel_type_id ?? "") !== String(editingPanelTypeId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => onStartEditing(row) },
      { key: "cancel-edit-panel-type", label: "Cancel", type: "secondary", icon: "xmark", visible: (row) => String(row?.panel_type_id ?? "") === String(editingPanelTypeId ?? ""), onClick: () => onStopEditing() },
      { key: "delete-panel-type", label: "Delete", type: "danger", icon: "trash", visible: (row) => String(row?.panel_type_id ?? "") !== String(editingPanelTypeId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => stageHardDeletePanelType(row) },
    ],
    [editingPanelTypeId, isMutatingAction, isSavingBatch, onStartEditing, onStopEditing, stageHardDeletePanelType],
  );

  const panelTypeFilters = useMemo(() => createFilterConfig([
    { key: "panel_name", label: "Panel Name", type: TABLE_FILTER_TYPES.TEXT },
    { key: "panel_description", label: "Description", type: TABLE_FILTER_TYPES.TEXT },
    { key: "location_type", label: "Location Type", type: TABLE_FILTER_TYPES.SELECT, options: distinctOptions(decoratedPanelTypes, "location_type") },
  ]), [decoratedPanelTypes]);

  return (
    <div className="row g-3 align-items-start">
      <div className="col-12">
        <Card title="Panel Types" subtitle="Panel types available for Metal Buildings.">
          <TableZ columns={columns} data={decoratedPanelTypes} rowIdKey="panel_type_id" actions={actions} onUndoBatchAction={onUndoBatchAction} filterConfig={panelTypeFilters} draggable={!isMutatingAction && !isSavingBatch} onReorder={onReorder} emptyMessage="No panel types found." />
        </Card>
      </div>
    </div>
  );
}

function PanelTypeDialog({ dialog, panelTypeDraft, isMutatingAction, isSavingBatch, setPanelTypeDraft, closeDialog, submitAddPanelType, submitEditPanelType }) {
  const dialogTitle = useMemo(() => {
    const kind = dialog?.kind;
    if (kind === "add-panel-type") return "Add Panel Type";
    if (kind === "edit-panel-type") return "Edit Panel Type";
    return "Panel Type";
  }, [dialog?.kind]);

  if (!dialog?.kind) return null;
  const isBusy = isMutatingAction || isSavingBatch;

  return (
    <Modal show onHide={closeDialog} title={dialogTitle}>
      {(dialog.kind === "add-panel-type" || dialog.kind === "edit-panel-type") ? (
        <div>
          <div className="mb-3">
            <Input label="Panel Name" value={panelTypeDraft.panelName} onChange={(e) => setPanelTypeDraft((prev) => ({ ...prev, panelName: e.target.value }))} placeholder="Enter panel name" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="Description" value={panelTypeDraft.panelDescription} onChange={(e) => setPanelTypeDraft((prev) => ({ ...prev, panelDescription: e.target.value }))} placeholder="Description (optional)" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <label className="form-label">Location Type</label>
            <select className="form-select" value={panelTypeDraft.locationType} onChange={(e) => setPanelTypeDraft((prev) => ({ ...prev, locationType: e.target.value }))} disabled={isBusy}>
              <option value="">Select location type</option>
              <option value="side">Side</option>
              <option value="end">End</option>
            </select>
          </div>
          <div className="mb-3">
            <Input label="Sort Order" type="number" step="1" value={panelTypeDraft.sortOrder} onChange={(e) => setPanelTypeDraft((prev) => ({ ...prev, sortOrder: e.target.value }))} placeholder="0" disabled={isBusy} />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.kind === "add-panel-type" ? "success" : "primary"} size="sm" loading={isBusy} disabled={isBusy} onClick={dialog.kind === "add-panel-type" ? submitAddPanelType : submitEditPanelType}>
              {dialog.kind === "add-panel-type" ? "Add" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// --- STYLE SUB-COMPONENTS ---

function StyleHeader({ hasPendingChanges, pendingSummary, isSavingBatch, isMutatingAction, handleSaveBatch, handleCancelBatch, openAddStyleDialog }) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <h4 className="mb-0">Styles</h4>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {hasPendingChanges ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "#856404", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "999px", padding: "0.25rem 0.7rem", lineHeight: 1.4 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#d39e00", flexShrink: 0 }} />
            {pendingSummary.total} pending
          </span>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSavingBatch} disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleSaveBatch}>
          Save Batch
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleCancelBatch}>
          Cancel Batch
        </Button>
        <Button type="button" size="sm" variant="success" disabled={isSavingBatch || isMutatingAction} onClick={openAddStyleDialog}>
          Add Style
        </Button>
      </div>
    </div>
  );
}

function StyleTable({ decoratedStyles, isMutatingAction, isSavingBatch, pendingDeactivatedStyleIds, editingStyleId, onStartEditing, onStopEditing, onInlineEdit, openToggleStyleDialog, openDeactivateStyleDialog, stageHardDeleteStyle, onUndoBatchAction, onReorder }) {
  const columns = useMemo(
    () => [
      {
        key: "name", label: "Style Name", width: "16%", sortable: true,
        render: (row) => {
          const batchState = String(row?.__batchState || "");
          const isEditing = String(row?.style_id ?? "") === String(editingStyleId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          let markerText = "";
          let markerClass = "";
          switch (batchState) {
            case "hardDeleted": markerText = "Deleted"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "deleted": markerText = "Deactivated"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "created": markerText = "New"; markerClass = "psb-batch-marker psb-batch-marker-new"; break;
            case "updated": markerText = "Edited"; markerClass = "psb-batch-marker psb-batch-marker-edited"; break;
            case "activated": markerText = "Activated"; markerClass = "psb-batch-marker psb-batch-marker-activated"; break;
            case "deactivated": markerText = "Deactivated"; markerClass = "psb-batch-marker psb-batch-marker-deactivated"; break;
            default: break;
          }
          return (
            <span>
              <InlineEditCell value={row?.name || ""} onCommit={(val) => onInlineEdit?.(row, "name", val)} onCancel={onStopEditing} disabled={editDisabled} />
              {markerText ? <span className={markerClass}>{markerText}</span> : null}
            </span>
          );
        },
      },
      {
        key: "description", label: "Description", width: "18%", sortable: true,
        render: (row) => {
          const isEditing = String(row?.style_id ?? "") === String(editingStyleId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={row?.description || ""} onCommit={(val) => onInlineEdit?.(row, "description", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "render_key", label: "Render Key", width: "11%", sortable: true,
        render: (row) => {
          const isEditing = String(row?.style_id ?? "") === String(editingStyleId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={row?.render_key || ""} onCommit={(val) => onInlineEdit?.(row, "render_key", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "default_size", label: "Default Size (W × L × H)", width: "15%", align: "center",
        render: (row) => <span>{row?.default_width ?? 12} × {row?.default_length ?? 20} × {row?.default_height ?? 6}</span>,
      },
      {
        key: "default_roof_pitch", label: "Roof Pitch", width: "9%", sortable: true, align: "center",
        render: (row) => {
          const isEditing = String(row?.style_id ?? "") === String(editingStyleId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={String(row?.default_roof_pitch ?? "")} type="number" onCommit={(val) => onInlineEdit?.(row, "default_roof_pitch", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "default_roof_overhang", label: "Overhang", width: "9%", sortable: true, align: "center",
        render: (row) => {
          const isEditing = String(row?.style_id ?? "") === String(editingStyleId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={row?.default_roof_overhang || ""} onCommit={(val) => onInlineEdit?.(row, "default_roof_overhang", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "has_walls_bool", label: "Walls", width: "7%", sortable: true, align: "center",
        render: (row) => <span>{row?.has_walls_bool ? "Yes" : "No"}</span>,
      },
      {
        key: "sort_order", label: "Sort", width: "7%", sortable: true, align: "center",
        render: (row) => <span>{row?.sort_order ?? 0}</span>,
      },
      {
        key: "is_active_bool", label: "Active", width: "8%", sortable: true, align: "center",
        render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />,
      },
    ],
    [editingStyleId, isMutatingAction, isSavingBatch, onInlineEdit, onStopEditing],
  );

  const actions = useMemo(
    () => [
      { key: "edit-style", label: "Edit", type: "secondary", icon: "pen", visible: (row) => String(row?.style_id ?? "") !== String(editingStyleId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => onStartEditing(row) },
      { key: "cancel-edit-style", label: "Cancel", type: "secondary", icon: "xmark", visible: (row) => String(row?.style_id ?? "") === String(editingStyleId ?? ""), onClick: () => onStopEditing() },
      { key: "restore-style", label: "Restore", type: "secondary", icon: "rotate-left", visible: (row) => (!Boolean(row?.is_active_bool) || pendingDeactivatedStyleIds.has(String(row?.style_id ?? ""))) && String(row?.style_id ?? "") !== String(editingStyleId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openToggleStyleDialog(row) },
      { key: "deactivate-style", label: "Deactivate", type: "secondary", icon: "ban", visible: (row) => Boolean(row?.is_active_bool) && !pendingDeactivatedStyleIds.has(String(row?.style_id ?? "")) && String(row?.style_id ?? "") !== String(editingStyleId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openDeactivateStyleDialog(row) },
      { key: "delete-style", label: "Delete", type: "danger", icon: "trash", visible: (row) => String(row?.style_id ?? "") !== String(editingStyleId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => stageHardDeleteStyle(row) },
    ],
    [editingStyleId, isMutatingAction, isSavingBatch, pendingDeactivatedStyleIds, onStartEditing, onStopEditing, openToggleStyleDialog, openDeactivateStyleDialog, stageHardDeleteStyle],
  );

  return (
    <div className="row g-3 align-items-start">
      <div className="col-12">
        <Card title="Styles" subtitle="Building styles and configurator defaults.">
          <TableZ columns={columns} data={decoratedStyles} rowIdKey="style_id" actions={actions} onUndoBatchAction={onUndoBatchAction} filterConfig={STYLE_FILTERS} draggable={!isMutatingAction && !isSavingBatch} onReorder={onReorder} emptyMessage="No styles found." />
        </Card>
      </div>
    </div>
  );
}

function StyleDialog({ dialog, styleDraft, isMutatingAction, isSavingBatch, setStyleDraft, closeDialog, submitAddStyle, submitEditStyle, submitToggleStyle, submitDeactivateStyle }) {
  const dialogTitle = useMemo(() => {
    const kind = dialog?.kind;
    if (kind === "add-style") return "Add Style";
    if (kind === "edit-style") return "Edit Style";
    if (kind === "toggle-style") return dialog?.nextIsActive ? "Enable Style" : "Disable Style";
    if (kind === "deactivate-style") return "Deactivate Style";
    return "Style";
  }, [dialog?.kind, dialog?.nextIsActive]);

  if (!dialog?.kind) return null;
  const isBusy = isMutatingAction || isSavingBatch;

  return (
    <Modal show onHide={closeDialog} title={dialogTitle}>
      {(dialog.kind === "add-style" || dialog.kind === "edit-style") ? (
        <div>
          <div className="mb-3">
            <Input label="Style Name" value={styleDraft.name} onChange={(e) => setStyleDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Enter style name" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="Description" value={styleDraft.description} onChange={(e) => setStyleDraft((prev) => ({ ...prev, description: e.target.value }))} placeholder="Optional description" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="Render Key" value={styleDraft.renderKey} onChange={(e) => setStyleDraft((prev) => ({ ...prev, renderKey: e.target.value }))} placeholder="e.g. regular, aframe (optional)" disabled={isBusy} />
          </div>
          <div className="row g-3 mb-3">
            <div className="col-md-4">
              <Input label="Default Width" type="number" step="1" value={styleDraft.defaultWidth} onChange={(e) => setStyleDraft((prev) => ({ ...prev, defaultWidth: e.target.value }))} placeholder="12" disabled={isBusy} />
            </div>
            <div className="col-md-4">
              <Input label="Default Length" type="number" step="1" value={styleDraft.defaultLength} onChange={(e) => setStyleDraft((prev) => ({ ...prev, defaultLength: e.target.value }))} placeholder="20" disabled={isBusy} />
            </div>
            <div className="col-md-4">
              <Input label="Default Height" type="number" step="1" value={styleDraft.defaultHeight} onChange={(e) => setStyleDraft((prev) => ({ ...prev, defaultHeight: e.target.value }))} placeholder="6" disabled={isBusy} />
            </div>
          </div>
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <Input label="Default Roof Pitch" type="number" step="0.01" value={styleDraft.defaultRoofPitch} onChange={(e) => setStyleDraft((prev) => ({ ...prev, defaultRoofPitch: e.target.value }))} placeholder="0.25" disabled={isBusy} />
            </div>
            <div className="col-md-6">
              <Input label="Default Roof Overhang" value={styleDraft.defaultRoofOverhang} onChange={(e) => setStyleDraft((prev) => ({ ...prev, defaultRoofOverhang: e.target.value }))} placeholder="0" disabled={isBusy} />
            </div>
          </div>
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label">Has Walls</label>
              <select className="form-select" value={styleDraft.hasWalls} onChange={(e) => setStyleDraft((prev) => ({ ...prev, hasWalls: e.target.value }))} disabled={isBusy}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div className="col-md-6">
              <Input label="Sort Order" type="number" step="1" value={styleDraft.sortOrder} onChange={(e) => setStyleDraft((prev) => ({ ...prev, sortOrder: e.target.value }))} placeholder="0" disabled={isBusy} />
            </div>
          </div>
          <div className="mb-3">
            <Input label="Icon Path" value={styleDraft.iconPath} onChange={(e) => setStyleDraft((prev) => ({ ...prev, iconPath: e.target.value }))} placeholder="icon-carportview-barn.png (optional)" disabled={isBusy} />
          </div>

          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.kind === "add-style" ? "success" : "primary"} size="sm" loading={isBusy} disabled={isBusy} onClick={dialog.kind === "add-style" ? submitAddStyle : submitEditStyle}>
              {dialog.kind === "add-style" ? "Add" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "toggle-style" ? (
        <div>
          <p className="mb-3">{dialog.nextIsActive ? `Enable style "${dialog.target?.name || "--"}"?` : `Disable style "${dialog.target?.name || "--"}"?`}</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.nextIsActive ? "primary" : "secondary"} size="sm" loading={isBusy} disabled={isBusy} onClick={submitToggleStyle}>
              {dialog.nextIsActive ? "Enable" : "Disable"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "deactivate-style" ? (
        <div>
          <p className="mb-3">Deactivate style <strong>&quot;{dialog.target?.name || "--"}&quot;</strong>? This action will be staged for Save Batch.</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant="warning" size="sm" loading={isBusy} disabled={isBusy} onClick={submitDeactivateStyle}>Deactivate</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// --- HOOK: useCustomAdjustments (metal_s_custom_adjustment) ---
// Same batching model as Categories. Fields use the DB column names
// (option_name, option_desctiption, sort). Drag-and-drop renumbers sort 1..n.

const EMPTY_CA_DRAFT = { optionName: "", optionDescription: "", sort: "" };

function useCustomAdjustments({ customAdjustments = [] }) {
  const router = useRouter();
  const sourceKey = useMemo(
    () => JSON.stringify(Array.isArray(customAdjustments) ? customAdjustments : []),
    [customAdjustments],
  );
  const seedRows = useMemo(
    () =>
      (Array.isArray(customAdjustments) ? customAdjustments : [])
        .map((row, index) => mapCustomAdjustmentRow(row, index))
        .sort((a, b) => {
          const diff = (Number(a.sort) || 0) - (Number(b.sort) || 0);
          if (diff !== 0) return diff;
          return compareText(a.option_name, b.option_name);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceKey],
  );

  const [orderedRows, setOrderedRows] = useState(seedRows);
  const [changes, setChanges] = useState(createEmptyCustomAdjustmentChanges());
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [draft, setDraft] = useState(EMPTY_CA_DRAFT);
  const [editingId, setEditingId] = useState(null);
  const batchActiveRef = useRef(false);

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedRows(seedRows);
    setChanges(createEmptyCustomAdjustmentChanges());
    setDialog(EMPTY_DIALOG);
    setDraft(EMPTY_CA_DRAFT);
    setIsMutatingAction(false);
    setIsSavingBatch(false);
    setEditingId(null);
  }, [seedRows]);

  const pendingSummary = useMemo(() => {
    const added = changes.creates.length;
    const edited = Object.keys(changes.updates || {}).length;
    const deactivated = changes.deactivations.length;
    const hardDeleted = (changes.hardDeletes || []).length;
    return { added, edited, deactivated, hardDeleted, total: added + edited + deactivated + hardDeleted };
  }, [changes]);
  const hasPendingChanges = pendingSummary.total > 0;
  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedIds = useMemo(
    () => new Set((changes.deactivations || []).map((id) => String(id ?? ""))),
    [changes.deactivations],
  );

  const decoratedRows = useMemo(() => {
    const createdIds = new Set((changes.creates || []).map((e) => String(e?.tempId ?? "")));
    const updatesMap = changes.updates || {};
    const deactivatedIds = new Set((changes.deactivations || []).map((e) => String(e ?? "")));
    const hardDeletedIds = new Set((changes.hardDeletes || []).map((e) => String(e ?? "")));
    return orderedRows.map((row) => {
      const id = String(row?.id ?? "");
      if (hardDeletedIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (deactivatedIds.has(id)) return { ...row, __batchState: "deleted" };
      if (createdIds.has(id)) return { ...row, __batchState: "created" };
      const updates = updatesMap[id];
      if (updates) {
        if (Object.prototype.hasOwnProperty.call(updates, "is_active")) return { ...row, __batchState: updates.is_active ? "activated" : "deactivated" };
        return { ...row, __batchState: "updated" };
      }
      return { ...row, __batchState: "none" };
    });
  }, [changes.creates, changes.deactivations, changes.hardDeletes, changes.updates, orderedRows]);

// Apply a patch to a row in the table + stage it (create payload or update).
  const stagePatch = useCallback((id, patch) => {
    setOrderedRows((prev) => prev.map((row, index) => (isSameId(row?.id, id) ? mapCustomAdjustmentRow({ ...row, ...patch }, index) : row)));
    setChanges((prev) => {
      if (isTempCustomAdjustmentId(id)) {
        return { ...prev, creates: prev.creates.map((e) => (isSameId(e?.tempId, id) ? { ...e, payload: { ...e.payload, ...patch } } : e)) };
      }
      return { ...prev, updates: { ...prev.updates, [String(id)]: mergeUpdatePatch(prev.updates?.[String(id)], patch) } };
    });
  }, []);

  const busy = isMutatingAction || isSavingBatch;

  const closeDialog = useCallback(() => { if (!busy) setDialog(EMPTY_DIALOG); }, [busy]);

  const openAddDialog = useCallback(() => {
    if (busy) return;
    setDraft(EMPTY_CA_DRAFT);
    setDialog({ kind: "add-custom-adjustment", target: null, nextIsActive: true });
  }, [busy]);

  const openToggleDialog = useCallback((row) => {
    if (busy) return;
    const id = String(row?.id ?? "");
    if (pendingDeactivatedIds.has(id)) {
      setChanges((prev) => ({ ...prev, deactivations: (prev.deactivations || []).filter((x) => !isSameId(x, id)) }));
      toastSuccess("Custom adjustment deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-custom-adjustment", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [busy, pendingDeactivatedIds]);

  const openDeactivateDialog = useCallback((row) => {
    if (busy) return;
    setDialog({ kind: "deactivate-custom-adjustment", target: row, nextIsActive: null });
  }, [busy]);

  const stageHardDelete = useCallback((row) => {
    const id = String(row?.id ?? "");
    if (!id || busy) return;
    if (isTempCustomAdjustmentId(id)) {
      setOrderedRows((prev) => prev.filter((r) => !isSameId(r?.id, id)));
      setChanges((prev) => ({ ...prev, creates: prev.creates.filter((e) => !isSameId(e?.tempId, id)), updates: removeObjectKey(prev.updates, id) }));
      toastSuccess("Staged custom adjustment removed.", "Batching");
      return;
    }
    setChanges((prev) => ({
      ...prev,
      deactivations: (prev.deactivations || []).filter((x) => !isSameId(x, id)),
      updates: removeObjectKey(prev.updates, id),
      hardDeletes: appendUniqueId(prev.hardDeletes || [], id),
    }));
    toastSuccess("Custom adjustment deletion staged for Save Batch.", "Batching");
  }, [busy]);

  const unstageHardDelete = useCallback((row) => {
    const id = String(row?.id ?? "");
    if (!id || busy) return;
    setChanges((prev) => ({ ...prev, hardDeletes: (prev.hardDeletes || []).filter((x) => !isSameId(x, id)) }));
    toastSuccess("Custom adjustment deletion un-staged.", "Batching");
  }, [busy]);

const handleCancelBatch = useCallback(() => {
    if (busy || !hasPendingChanges) return;
    batchActiveRef.current = false;
    setOrderedRows(seedRows);
    setChanges(createEmptyCustomAdjustmentChanges());
    setDialog(EMPTY_DIALOG);
    setDraft(EMPTY_CA_DRAFT);
    setEditingId(null);
    toastSuccess("Batch changes canceled.", "Batching");
  }, [busy, hasPendingChanges, seedRows]);

  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || busy) return;
    setIsSavingBatch(true);
    setIsMutatingAction(true);
    try {
      await executeCustomAdjustmentBatchSave(changes);
      setChanges(createEmptyCustomAdjustmentChanges());
      batchActiveRef.current = false;
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally {
      setIsMutatingAction(false);
      setIsSavingBatch(false);
      setEditingId(null);
    }
  }, [busy, changes, hasPendingChanges, pendingSummary.total, router]);

  const submitAdd = useCallback(() => {
    const optionName = normalizeText(draft.optionName);
    if (!optionName) { toastError("Option name is required."); return; }
    const description = normalizeOptionalText(draft.optionDescription);
    const requested = normalizeSortOrder(draft.sort);
    const maxSort = orderedRows.reduce((max, r) => Math.max(max, Number(r?.sort || 0)), 0);
    const sort = requested > 0 ? requested : maxSort + 1;
    const tempId = createTempId(TEMP_CUSTOM_ADJUSTMENT_PREFIX);
    const payload = { option_name: optionName, option_desctiption: description, sort, is_active: true };
    setOrderedRows((prev) => [...prev, mapCustomAdjustmentRow({ id: tempId, ...payload }, prev.length)]);
    setChanges((prev) => ({ ...prev, creates: [...prev.creates, { tempId, payload }] }));
    setDialog(EMPTY_DIALOG);
    setDraft(EMPTY_CA_DRAFT);
    toastSuccess("Custom adjustment staged for Save Batch.", "Batching");
  }, [draft.optionDescription, draft.optionName, draft.sort, orderedRows]);

const submitToggle = useCallback(() => {
    const row = dialog?.target;
    if (!row?.id) { toastError("Invalid custom adjustment."); return; }
    const nextIsActive = Boolean(dialog?.nextIsActive);
    stagePatch(row.id, { is_active: nextIsActive });
    setDialog(EMPTY_DIALOG);
    toastSuccess(nextIsActive ? "Custom adjustment enabled - staged for Save Batch." : "Custom adjustment disabled - staged for Save Batch.", "Batching");
  }, [dialog?.nextIsActive, dialog?.target, stagePatch]);

  const submitDeactivate = useCallback(() => {
    const row = dialog?.target;
    if (!row?.id) { toastError("Invalid custom adjustment."); return; }
    const id = row.id;
    if (isTempCustomAdjustmentId(id)) {
      setOrderedRows((prev) => prev.filter((r) => !isSameId(r?.id, id)));
      setChanges((prev) => ({ ...prev, creates: prev.creates.filter((e) => !isSameId(e?.tempId, id)), updates: removeObjectKey(prev.updates, String(id)) }));
      setDialog(EMPTY_DIALOG);
      toastSuccess("Staged custom adjustment removed.", "Batching");
      return;
    }
    setChanges((prev) => ({ ...prev, deactivations: appendUniqueId(prev.deactivations, id) }));
    setDialog(EMPTY_DIALOG);
    toastSuccess("Custom adjustment deactivation staged for Save Batch.", "Batching");
  }, [dialog?.target]);

  const startEditing = useCallback((row) => {
    if (busy) return;
    const id = String(row?.id ?? "");
    setEditingId((prev) => (prev === id ? null : id));
  }, [busy]);
  const stopEditing = useCallback(() => { setEditingId(null); }, []);

  const handleInlineEdit = useCallback((row, key, value) => {
    const id = row?.id;
    if (!id || busy) return;
    let nextValue;
    if (key === "option_desctiption") nextValue = normalizeOptionalText(value);
    else if (key === "option_name") {
      nextValue = normalizeText(value);
      if (!nextValue) { toastError("Option name cannot be empty."); return; }
    } else return;
    stagePatch(id, { [key]: nextValue });
  }, [busy, stagePatch]);

  // Drag-and-drop (TableZ onReorder) → sort = 1..n in the new order.
  const handleReorder = useCallback((nextRows) => {
    if (busy) return;
    const ordered = Array.isArray(nextRows) ? nextRows : [];
    const nextIds = ordered.map((row) => String(row?.id ?? ""));
    const nextSortById = new Map(nextIds.map((id, index) => [id, index + 1]));

    setOrderedRows((prev) => {
      const byId = new Map(prev.map((row) => [String(row?.id ?? ""), row]));
      return nextIds.map((id) => byId.get(id)).filter(Boolean).map((row, index) => mapCustomAdjustmentRow({ ...row, sort: index + 1 }, index));
    });

    setChanges((prev) => {
      const updates = { ...(prev.updates || {}) };
      const creates = (prev.creates || []).map((entry) => {
        const nextSort = nextSortById.get(String(entry?.tempId ?? ""));
        if (nextSort == null || Number(entry?.payload?.sort ?? 0) === nextSort) return entry;
        return { ...entry, payload: { ...entry.payload, sort: nextSort } };
      });
      for (const row of ordered) {
        const id = String(row?.id ?? "");
        if (isTempCustomAdjustmentId(id)) continue;
        const nextSort = nextSortById.get(id);
        if (nextSort == null || Number(row?.sort ?? 0) === nextSort) continue;
        updates[id] = mergeUpdatePatch(updates[id], { sort: nextSort });
      }
      return { ...prev, updates, creates };
    });

    toastSuccess("Custom adjustment order staged for Save Batch.", "Batching");
  }, [busy]);

  return {
    decoratedRows, dialog, draft, setDraft, isSavingBatch, isMutatingAction, pendingSummary, hasPendingChanges,
    pendingDeactivatedIds, closeDialog, openAddDialog, openToggleDialog, openDeactivateDialog, stageHardDelete,
    unstageHardDelete, handleCancelBatch, handleSaveBatch, submitAdd, submitToggle, submitDeactivate,
    editingId, startEditing, stopEditing, handleInlineEdit, handleReorder,
  };
}

function CustomAdjustmentHeader({ hook }) {
  const { hasPendingChanges, pendingSummary, isSavingBatch, isMutatingAction, handleSaveBatch, handleCancelBatch, openAddDialog } = hook;
  return (
    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <h4 className="mb-0">Custom Adjustments</h4>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {hasPendingChanges ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "#856404", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "999px", padding: "0.25rem 0.7rem", lineHeight: 1.4 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#d39e00", flexShrink: 0 }} />
            {pendingSummary.total} pending
          </span>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSavingBatch} disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleSaveBatch}>
          Save Batch
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleCancelBatch}>
          Cancel Batch
        </Button>
        <Button type="button" size="sm" variant="success" disabled={isSavingBatch || isMutatingAction} onClick={openAddDialog}>
          Add Custom Adjustment
        </Button>
      </div>
    </div>
  );
}

function CustomAdjustmentTable({ hook }) {
  const { decoratedRows, isMutatingAction, isSavingBatch, pendingDeactivatedIds, editingId, startEditing, stopEditing, handleInlineEdit, openToggleDialog, openDeactivateDialog, stageHardDelete, unstageHardDelete, handleReorder } = hook;
  const busy = isMutatingAction || isSavingBatch;
  const isRowEditing = useCallback((row) => String(row?.id ?? "") === String(editingId ?? ""), [editingId]);

  const columns = useMemo(
    () => [
      {
        key: "option_name", label: "Option Name", width: "32%", sortable: true,
        render: (row) => {
          const markers = {
            hardDeleted: ["Deleted", "psb-batch-marker psb-batch-marker-deleted"],
            deleted: ["Deactivated", "psb-batch-marker psb-batch-marker-deleted"],
            created: ["New", "psb-batch-marker psb-batch-marker-new"],
            updated: ["Edited", "psb-batch-marker psb-batch-marker-edited"],
            activated: ["Activated", "psb-batch-marker psb-batch-marker-activated"],
            deactivated: ["Deactivated", "psb-batch-marker psb-batch-marker-deactivated"],
          };
          const [markerText, markerClass] = markers[String(row?.__batchState || "")] || ["", ""];
          return (
            <span>
              <InlineEditCell value={row?.option_name || ""} onCommit={(val) => handleInlineEdit(row, "option_name", val)} onCancel={stopEditing} disabled={!isRowEditing(row) || busy} />
              {markerText ? <span className={markerClass}>{markerText}</span> : null}
            </span>
          );
        },
      },
      {
        key: "option_desctiption", label: "Description", width: "40%", sortable: true,
        render: (row) => (
          <InlineEditCell value={row?.option_desctiption || ""} onCommit={(val) => handleInlineEdit(row, "option_desctiption", val)} onCancel={stopEditing} disabled={!isRowEditing(row) || busy} />
        ),
      },
      {
        key: "sort", label: "Sort", width: "10%", sortable: true, align: "center",
        render: (row) => <span>{row?.sort ?? 0}</span>,
      },
      {
        key: "is_active_bool", label: "Active", width: "18%", sortable: true, align: "center",
        render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />,
      },
    ],
    [busy, handleInlineEdit, isRowEditing, stopEditing],
  );

  const actions = useMemo(
    () => [
      { key: "edit-ca", label: "Edit", type: "secondary", icon: "pen", visible: (row) => !isRowEditing(row), disabled: () => busy, onClick: (row) => startEditing(row) },
      { key: "cancel-edit-ca", label: "Cancel", type: "secondary", icon: "xmark", visible: (row) => isRowEditing(row), onClick: () => stopEditing() },
      { key: "restore-ca", label: "Restore", type: "secondary", icon: "rotate-left", visible: (row) => (!Boolean(row?.is_active_bool) || pendingDeactivatedIds.has(String(row?.id ?? ""))) && !isRowEditing(row), disabled: () => busy, onClick: (row) => openToggleDialog(row) },
      { key: "deactivate-ca", label: "Deactivate", type: "secondary", icon: "ban", visible: (row) => Boolean(row?.is_active_bool) && !pendingDeactivatedIds.has(String(row?.id ?? "")) && !isRowEditing(row), disabled: () => busy, onClick: (row) => openDeactivateDialog(row) },
      { key: "delete-ca", label: "Delete", type: "danger", icon: "trash", visible: (row) => !isRowEditing(row), disabled: () => busy, onClick: (row) => stageHardDelete(row) },
    ],
    [busy, isRowEditing, openDeactivateDialog, openToggleDialog, pendingDeactivatedIds, stageHardDelete, startEditing, stopEditing],
  );

  return (
    <div className="row g-3 align-items-start">
      <div className="col-12">
        <Card title="Custom Adjustments" subtitle="Custom adjustment options (drag rows to change the sort order).">
          <TableZ columns={columns} data={decoratedRows} rowIdKey="id" actions={actions} onUndoBatchAction={unstageHardDelete} filterConfig={CUSTOM_ADJUSTMENT_FILTERS} draggable={!busy} onReorder={handleReorder} emptyMessage="No custom adjustments found." />
        </Card>
      </div>
    </div>
  );
}

function CustomAdjustmentDialog({ hook }) {
  const { dialog, draft, setDraft, isMutatingAction, isSavingBatch, closeDialog, submitAdd, submitToggle, submitDeactivate } = hook;
  if (!dialog?.kind || !String(dialog.kind).endsWith("custom-adjustment")) return null;
  const isBusy = isMutatingAction || isSavingBatch;
  const title =
    dialog.kind === "add-custom-adjustment" ? "Add Custom Adjustment"
      : dialog.kind === "toggle-custom-adjustment" ? (dialog.nextIsActive ? "Enable Custom Adjustment" : "Disable Custom Adjustment")
        : "Deactivate Custom Adjustment";

  return (
    <Modal show onHide={closeDialog} title={title}>
      {dialog.kind === "add-custom-adjustment" ? (
        <div>
          <div className="mb-3">
            <Input label="Option Name" value={draft.optionName} onChange={(e) => setDraft((p) => ({ ...p, optionName: e.target.value }))} placeholder="Enter option name" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="Description" value={draft.optionDescription} onChange={(e) => setDraft((p) => ({ ...p, optionDescription: e.target.value }))} placeholder="Optional description" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="Sort" type="number" step="1" value={draft.sort} onChange={(e) => setDraft((p) => ({ ...p, sort: e.target.value }))} placeholder="Blank = last" disabled={isBusy} />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant="success" size="sm" loading={isBusy} disabled={isBusy} onClick={submitAdd}>Add</Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "toggle-custom-adjustment" ? (
        <div>
          <p className="mb-3">{dialog.nextIsActive ? "Enable" : "Disable"} custom adjustment &quot;{dialog.target?.option_name || "--"}&quot;?</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.nextIsActive ? "primary" : "secondary"} size="sm" loading={isBusy} disabled={isBusy} onClick={submitToggle}>
              {dialog.nextIsActive ? "Enable" : "Disable"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "deactivate-custom-adjustment" ? (
        <div>
          <p className="mb-3">Deactivate custom adjustment <strong>&quot;{dialog.target?.option_name || "--"}&quot;</strong>? This action will be staged for Save Batch.</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant="warning" size="sm" loading={isBusy} disabled={isBusy} onClick={submitDeactivate}>Deactivate</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// --- CONFIG SIDE NAV ---

function ConfigSideNav({ activeSection, sections, onSelect, disabled }) {
  return (
    <aside className="setup-side-nav" aria-label="Master data tables">
      <p className="setup-side-nav-label">Master Data</p>
      <div className="setup-side-nav-list">
        {sections.map((section) => {
          const isActive = section.key === activeSection;
          return (
            <button
              key={section.key}
              type="button"
              className={`setup-side-nav-item${isActive ? " is-active" : ""}`}
              disabled={disabled}
              onClick={() => onSelect(section.key)}
            >
              <span className="setup-side-nav-item-main">
                <span className="setup-side-nav-item-title">{section.title}</span>
                <span className="setup-side-nav-item-meta">{section.meta}</span>
              </span>
              <span className="setup-side-nav-item-end">
                {section.pending ? <span className="setup-side-nav-dirty-dot" aria-hidden="true" /> : null}
                <i className="fa-solid fa-chevron-right fa-xs" aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// --- MAIN VIEW (default export) ---

export default function MetalMasterDataConfigView({ regions, zipCodes, categories, panelTypes, styles, customAdjustments }) {
  const [activeSection, setActiveSection] = useState("regions");
  const regionsHook = useRegions({ regions });
  const zipCodesHook = useZipCodes({ zipCodes, regions });
  const categoriesHook = useCategories({ categories });
  const panelTypesHook = usePanelTypes({ panelTypes });
  const stylesHook = useStyles({ styles });
  const customAdjustmentsHook = useCustomAdjustments({ customAdjustments });

  const sections = [
    { key: "regions", title: "Regions", meta: "Region pricing multipliers", pending: regionsHook.hasPendingChanges },
    { key: "zip-codes", title: "Zip Codes", meta: "ZIP-to-region mapping", pending: zipCodesHook.hasPendingChanges },
    { key: "categories", title: "Categories", meta: "Feature categories", pending: categoriesHook.hasPendingChanges },
    { key: "panel-types", title: "Panel Types", meta: "Panel types", pending: panelTypesHook.hasPendingChanges },
    { key: "styles", title: "Styles", meta: "Building styles & configurator defaults", pending: stylesHook.hasPendingChanges },
    { key: "custom-adjustments", title: "Custom Adjustments", meta: "Custom adjustment options", pending: customAdjustmentsHook.hasPendingChanges },
    { key: "documents", title: "Documents", meta: "Stored PDFs (e.g. Purchaser Agreement)", pending: false },
    { key: "snow-load", title: "Snow Load", meta: "Snow load (psf) per ZIP", pending: false },
  ];

  const sideNavDisabled =
    regionsHook.isSavingBatch || regionsHook.isMutatingAction || zipCodesHook.isSavingBatch || zipCodesHook.isMutatingAction || categoriesHook.isSavingBatch || categoriesHook.isMutatingAction || panelTypesHook.isSavingBatch || panelTypesHook.isMutatingAction || stylesHook.isSavingBatch || stylesHook.isMutatingAction || customAdjustmentsHook.isSavingBatch || customAdjustmentsHook.isMutatingAction;

  return (
    <main className="container-fluid py-4">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h3 mb-1">Metal Master Data Config</h1>
          <p className="text-muted mb-0">Manage master data tables for Metal Buildings.</p>
        </div>
      </div>

      <div className="setup-split-layout">
        <ConfigSideNav
          activeSection={activeSection}
          sections={sections}
          onSelect={setActiveSection}
          disabled={sideNavDisabled}
        />

        <div className="setup-content-pane">
          {activeSection === "regions" ? (
            <>
              <RegionHeader
                hasPendingChanges={regionsHook.hasPendingChanges}
                pendingSummary={regionsHook.pendingSummary}
                isSavingBatch={regionsHook.isSavingBatch}
                isMutatingAction={regionsHook.isMutatingAction}
                handleSaveBatch={regionsHook.handleSaveBatch}
                handleCancelBatch={regionsHook.handleCancelBatch}
                openAddRegionDialog={regionsHook.openAddRegionDialog}
              />
              <RegionTable
                decoratedRegions={regionsHook.decoratedRegions}
                isMutatingAction={regionsHook.isMutatingAction}
                isSavingBatch={regionsHook.isSavingBatch}
                pendingDeactivatedRegionIds={regionsHook.pendingDeactivatedRegionIds}
                editingRegionId={regionsHook.editingRegionId}
                onStartEditing={regionsHook.startEditingRegion}
                onStopEditing={regionsHook.stopEditingRegion}
                onInlineEdit={regionsHook.handleInlineEdit}
                openToggleRegionDialog={regionsHook.openToggleRegionDialog}
                openDeactivateRegionDialog={regionsHook.openDeactivateRegionDialog}
                stageHardDeleteRegion={regionsHook.stageHardDeleteRegion}
                onUndoBatchAction={regionsHook.unstageHardDeleteRegion}
              />
              <RegionDialog
                dialog={regionsHook.dialog}
                regionDraft={regionsHook.regionDraft}
                isMutatingAction={regionsHook.isMutatingAction}
                isSavingBatch={regionsHook.isSavingBatch}
                setRegionDraft={regionsHook.setRegionDraft}
                closeDialog={regionsHook.closeDialog}
                submitAddRegion={regionsHook.submitAddRegion}
                submitEditRegion={regionsHook.submitEditRegion}
                submitToggleRegion={regionsHook.submitToggleRegion}
                submitDeactivateRegion={regionsHook.submitDeactivateRegion}
              />
            </>
          ) : activeSection === "categories" ? (
            <>
              <CategoryHeader
                hasPendingChanges={categoriesHook.hasPendingChanges}
                pendingSummary={categoriesHook.pendingSummary}
                isSavingBatch={categoriesHook.isSavingBatch}
                isMutatingAction={categoriesHook.isMutatingAction}
                handleSaveBatch={categoriesHook.handleSaveBatch}
                handleCancelBatch={categoriesHook.handleCancelBatch}
                openAddCategoryDialog={categoriesHook.openAddCategoryDialog}
              />
              <CategoryTable
                decoratedCategories={categoriesHook.decoratedCategories}
                isMutatingAction={categoriesHook.isMutatingAction}
                isSavingBatch={categoriesHook.isSavingBatch}
                pendingDeactivatedCategoryIds={categoriesHook.pendingDeactivatedCategoryIds}
                editingCategoryId={categoriesHook.editingCategoryId}
                onStartEditing={categoriesHook.startEditingCategory}
                onStopEditing={categoriesHook.stopEditingCategory}
                onInlineEdit={categoriesHook.handleInlineEdit}
                openToggleCategoryDialog={categoriesHook.openToggleCategoryDialog}
                openDeactivateCategoryDialog={categoriesHook.openDeactivateCategoryDialog}
                stageHardDeleteCategory={categoriesHook.stageHardDeleteCategory}
                onUndoBatchAction={categoriesHook.unstageHardDeleteCategory}
                onReorder={categoriesHook.handleReorder}
              />
              <CategoryDialog
                dialog={categoriesHook.dialog}
                categoryDraft={categoriesHook.categoryDraft}
                isMutatingAction={categoriesHook.isMutatingAction}
                isSavingBatch={categoriesHook.isSavingBatch}
                setCategoryDraft={categoriesHook.setCategoryDraft}
                closeDialog={categoriesHook.closeDialog}
                submitAddCategory={categoriesHook.submitAddCategory}
                submitEditCategory={categoriesHook.submitEditCategory}
                submitToggleCategory={categoriesHook.submitToggleCategory}
                submitDeactivateCategory={categoriesHook.submitDeactivateCategory}
              />
            </>
          ) : activeSection === "panel-types" ? (
            <>
              <PanelTypeHeader
                hasPendingChanges={panelTypesHook.hasPendingChanges}
                pendingSummary={panelTypesHook.pendingSummary}
                isSavingBatch={panelTypesHook.isSavingBatch}
                isMutatingAction={panelTypesHook.isMutatingAction}
                handleSaveBatch={panelTypesHook.handleSaveBatch}
                handleCancelBatch={panelTypesHook.handleCancelBatch}
                openAddPanelTypeDialog={panelTypesHook.openAddPanelTypeDialog}
              />
              <PanelTypeTable
                decoratedPanelTypes={panelTypesHook.decoratedPanelTypes}
                isMutatingAction={panelTypesHook.isMutatingAction}
                isSavingBatch={panelTypesHook.isSavingBatch}
                editingPanelTypeId={panelTypesHook.editingPanelTypeId}
                onStartEditing={panelTypesHook.startEditingPanelType}
                onStopEditing={panelTypesHook.stopEditingPanelType}
                onInlineEdit={panelTypesHook.handleInlineEdit}
                stageHardDeletePanelType={panelTypesHook.stageHardDeletePanelType}
                onUndoBatchAction={panelTypesHook.unstageHardDeletePanelType}
                onReorder={panelTypesHook.handleReorder}
              />
              <PanelTypeDialog
                dialog={panelTypesHook.dialog}
                panelTypeDraft={panelTypesHook.panelTypeDraft}
                isMutatingAction={panelTypesHook.isMutatingAction}
                isSavingBatch={panelTypesHook.isSavingBatch}
                setPanelTypeDraft={panelTypesHook.setPanelTypeDraft}
                closeDialog={panelTypesHook.closeDialog}
                submitAddPanelType={panelTypesHook.submitAddPanelType}
                submitEditPanelType={panelTypesHook.submitEditPanelType}
              />
            </>
          ) : activeSection === "styles" ? (
            <>
              <StyleHeader
                hasPendingChanges={stylesHook.hasPendingChanges}
                pendingSummary={stylesHook.pendingSummary}
                isSavingBatch={stylesHook.isSavingBatch}
                isMutatingAction={stylesHook.isMutatingAction}
                handleSaveBatch={stylesHook.handleSaveBatch}
                handleCancelBatch={stylesHook.handleCancelBatch}
                openAddStyleDialog={stylesHook.openAddStyleDialog}
              />
              <StyleTable
                decoratedStyles={stylesHook.decoratedStyles}
                isMutatingAction={stylesHook.isMutatingAction}
                isSavingBatch={stylesHook.isSavingBatch}
                pendingDeactivatedStyleIds={stylesHook.pendingDeactivatedStyleIds}
                editingStyleId={stylesHook.editingStyleId}
                onStartEditing={stylesHook.startEditingStyle}
                onStopEditing={stylesHook.stopEditingStyle}
                onInlineEdit={stylesHook.handleInlineEdit}
                openToggleStyleDialog={stylesHook.openToggleStyleDialog}
                openDeactivateStyleDialog={stylesHook.openDeactivateStyleDialog}
                stageHardDeleteStyle={stylesHook.stageHardDeleteStyle}
                onUndoBatchAction={stylesHook.unstageHardDeleteStyle}
                onReorder={stylesHook.handleReorder}
              />
              <StyleDialog
                dialog={stylesHook.dialog}
                styleDraft={stylesHook.styleDraft}
                isMutatingAction={stylesHook.isMutatingAction}
                isSavingBatch={stylesHook.isSavingBatch}
                setStyleDraft={stylesHook.setStyleDraft}
                closeDialog={stylesHook.closeDialog}
                submitAddStyle={stylesHook.submitAddStyle}
                submitEditStyle={stylesHook.submitEditStyle}
                submitToggleStyle={stylesHook.submitToggleStyle}
                submitDeactivateStyle={stylesHook.submitDeactivateStyle}
              />
            </>
          ) : activeSection === "snow-load" ? (
            <SnowLoadSection />
          ) : activeSection === "documents" ? (
            <DocumentsSection />
          ) : activeSection === "custom-adjustments" ? (
            <>
              <CustomAdjustmentHeader hook={customAdjustmentsHook} />
              <CustomAdjustmentTable hook={customAdjustmentsHook} />
              <CustomAdjustmentDialog hook={customAdjustmentsHook} />
            </>
          ) : (
            <>
              <ZipCodeHeader
                hasPendingChanges={zipCodesHook.hasPendingChanges}
                pendingSummary={zipCodesHook.pendingSummary}
                isSavingBatch={zipCodesHook.isSavingBatch}
                isMutatingAction={zipCodesHook.isMutatingAction}
                handleSaveBatch={zipCodesHook.handleSaveBatch}
                handleCancelBatch={zipCodesHook.handleCancelBatch}
                openAddZipCodeDialog={zipCodesHook.openAddZipCodeDialog}
              />
              <ZipCodeTable
                decoratedZipCodes={zipCodesHook.decoratedZipCodes}
                regions={regions}
                isMutatingAction={zipCodesHook.isMutatingAction}
                isSavingBatch={zipCodesHook.isSavingBatch}
                editingZipCode={zipCodesHook.editingZipCode}
                onStartEditing={zipCodesHook.startEditingZipCode}
                onStopEditing={zipCodesHook.stopEditingZipCode}
                onInlineEdit={zipCodesHook.handleInlineEdit}
                stageHardDeleteZipCode={zipCodesHook.stageHardDeleteZipCode}
                onUndoBatchAction={zipCodesHook.unstageHardDeleteZipCode}
              />
              <ZipCodeDialog
                dialog={zipCodesHook.dialog}
                zipDraft={zipCodesHook.zipDraft}
                regions={regions}
                isMutatingAction={zipCodesHook.isMutatingAction}
                isSavingBatch={zipCodesHook.isSavingBatch}
                setZipDraft={zipCodesHook.setZipDraft}
                closeDialog={zipCodesHook.closeDialog}
                submitAddZipCode={zipCodesHook.submitAddZipCode}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}