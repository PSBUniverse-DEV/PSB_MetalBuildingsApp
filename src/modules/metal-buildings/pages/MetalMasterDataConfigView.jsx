"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, InlineEditCell, Input, Modal, StatusBadge, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
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
          <TableZ columns={columns} data={decoratedRegions} rowIdKey="region_id" actions={actions} onUndoBatchAction={onUndoBatchAction} emptyMessage="No regions found." />
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
        key: "region_id", label: "Region", width: "18%", sortable: true,
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

  return (
    <div className="row g-3 align-items-start">
      <div className="col-12">
        <Card title="Zip Codes" subtitle="ZIP-to-region mapping.">
          <TableZ columns={columns} data={decoratedZipCodes} rowIdKey="zip_code" actions={actions} onUndoBatchAction={onUndoBatchAction} emptyMessage="No zip codes found." />
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
          <TableZ columns={columns} data={decoratedCategories} rowIdKey="category_id" actions={actions} onUndoBatchAction={onUndoBatchAction} draggable={!isMutatingAction && !isSavingBatch} onReorder={onReorder} emptyMessage="No categories found." />
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

  return (
    <div className="row g-3 align-items-start">
      <div className="col-12">
        <Card title="Panel Types" subtitle="Panel types available for Metal Buildings.">
          <TableZ columns={columns} data={decoratedPanelTypes} rowIdKey="panel_type_id" actions={actions} onUndoBatchAction={onUndoBatchAction} draggable={!isMutatingAction && !isSavingBatch} onReorder={onReorder} emptyMessage="No panel types found." />
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

export default function MetalMasterDataConfigView({ regions, zipCodes, categories, panelTypes }) {
  const [activeSection, setActiveSection] = useState("regions");
  const regionsHook = useRegions({ regions });
  const zipCodesHook = useZipCodes({ zipCodes, regions });
  const categoriesHook = useCategories({ categories });
  const panelTypesHook = usePanelTypes({ panelTypes });

  const sections = [
    { key: "regions", title: "Regions", meta: "Region pricing multipliers", pending: regionsHook.hasPendingChanges },
    { key: "zip-codes", title: "Zip Codes", meta: "ZIP-to-region mapping", pending: zipCodesHook.hasPendingChanges },
    { key: "categories", title: "Categories", meta: "Feature categories", pending: categoriesHook.hasPendingChanges },
    { key: "panel-types", title: "Panel Types", meta: "Panel types", pending: panelTypesHook.hasPendingChanges },
  ];

  const sideNavDisabled =
    regionsHook.isSavingBatch || regionsHook.isMutatingAction || zipCodesHook.isSavingBatch || zipCodesHook.isMutatingAction || categoriesHook.isSavingBatch || categoriesHook.isMutatingAction || panelTypesHook.isSavingBatch || panelTypesHook.isMutatingAction;

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