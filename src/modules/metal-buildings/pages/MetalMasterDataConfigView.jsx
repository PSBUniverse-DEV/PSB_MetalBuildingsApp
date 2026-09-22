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

export default function MetalMasterDataConfigView({ regions, zipCodes }) {
  const [activeSection, setActiveSection] = useState("regions");
  const regionsHook = useRegions({ regions });
  const zipCodesHook = useZipCodes({ zipCodes, regions });

  const sections = [
    { key: "regions", title: "Regions", meta: "Region pricing multipliers", pending: regionsHook.hasPendingChanges },
    { key: "zip-codes", title: "Zip Codes", meta: "ZIP-to-region mapping", pending: zipCodesHook.hasPendingChanges },
  ];

  const sideNavDisabled =
    regionsHook.isSavingBatch || regionsHook.isMutatingAction || zipCodesHook.isSavingBatch || zipCodesHook.isMutatingAction;

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