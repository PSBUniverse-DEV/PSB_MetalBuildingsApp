"use server";

/**
 * Generic stored documents (PDFs) — Supabase Storage bucket "metal-documents"
 * + table metal_s_document. `document_type` says which document a row is
 * (see data/documentTypes.js). Per type, the NEWEST active row is the one in
 * use (e.g. printed with the Order Form).
 */

import { getSupabaseAdmin } from "@/core/supabase/admin";
import { createSignedFileUpload, getSignedFileUrl, removeStoredFiles } from "@/core/storage/files.service";

const BUCKET = "metal-documents";
const TABLE = "metal_s_document";
const ALLOWED_TYPES = ["application/pdf"];
const COLUMNS = "id, document_type, file_name, file_size, mime_type, is_active, sort, created_at";

function normalizeSort(value) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const n = parseInt(text, 10);
  return Number.isNaN(n) ? null : n;
}

function cleanType(documentType) {
  const t = String(documentType ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!t) throw new Error("Document type is required.");
  return t;
}

/** Uploads of one document type, newest first (Master Data list). */
export async function listDocuments(documentType) {
  const type = cleanType(documentType);
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE).select(COLUMNS).eq("document_type", type)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Failed to load documents");
  return data ?? [];
}

/**
 * Table summary for several document types in one query:
 * [{ document_type, activeId, activeFileName, activeFileSize, activeCreatedAt, versions, sort }]
 */
export async function listDocumentSummaries(documentTypes) {
  const types = [...new Set((documentTypes ?? []).map(cleanType))];
  if (types.length === 0) return [];
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE).select(COLUMNS).in("document_type", types)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Failed to load documents");
  return types.map((type) => {
    const rows = (data ?? []).filter((r) => r.document_type === type);
    const active = rows.find((r) => r.is_active) ?? null;
    const sortRow = rows.find((r) => r.sort != null) ?? null;
    return {
      document_type: type,
      activeId: active?.id ?? null,
      activeFileName: active?.file_name ?? null,
      activeFileSize: active?.file_size ?? null,
      activeCreatedAt: active?.created_at ?? null,
      versions: rows.length,
      sort: sortRow?.sort ?? null,
    };
  });
}

/** One-time signed upload target (PDF only), folder = document type. */
export async function createDocumentUpload(documentType, meta) {
  const type = cleanType(documentType);
  return createSignedFileUpload({ bucket: BUCKET, folder: type, file: meta, allowedTypes: ALLOWED_TYPES });
}

/** Record an uploaded file; it becomes the active document of its type. */
export async function saveDocument(documentType, storagePath, meta) {
  const type = cleanType(documentType);
  const path = String(storagePath ?? "").trim();
  if (!path.startsWith(`${type}/`)) throw new Error("Invalid storage path.");
  const supabase = getSupabaseAdmin();
  // Keep the document's print sort on the new version.
  const { data: prev } = await supabase.from(TABLE).select("sort")
    .eq("document_type", type).not("sort", "is", null)
    .order("created_at", { ascending: false }).limit(1);
  const keptSort = prev?.[0]?.sort ?? null;
  const { error: offErr } = await supabase.from(TABLE).update({ is_active: false })
    .eq("document_type", type).eq("is_active", true);
  if (offErr) throw new Error(offErr.message || "Failed to update documents");
  const { data, error } = await supabase.from(TABLE).insert({
    document_type: type,
    file_name: String(meta?.name ?? "document.pdf"),
    storage_path: path,
    file_size: Number(meta?.size) || null,
    mime_type: String(meta?.type ?? "application/pdf"),
    is_active: true,
    sort: keptSort,
  }).select(COLUMNS).single();
  if (error) throw new Error(error.message || "Failed to save document");
  return data;
}

async function getRow(id) {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select("*").eq("id", id).single();
  if (error || !data) throw new Error("Document not found.");
  return data;
}

/** Short-lived link to open one stored document. */
export async function getDocumentUrl(id) {
  const row = await getRow(id);
  return getSignedFileUrl({ bucket: BUCKET, storagePath: row.storage_path });
}

/** Delete one upload; if it was active, the next newest of its type becomes active. */
export async function deleteDocument(id) {
  const row = await getRow(id);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from(TABLE).delete().eq("id", row.id);
  if (error) throw new Error(error.message || "Failed to delete document");
  try { await removeStoredFiles({ bucket: BUCKET, storagePaths: [row.storage_path] }); } catch { /* best-effort file cleanup */ }
  if (row.is_active) {
    const { data: next } = await supabase.from(TABLE).select("id")
      .eq("document_type", row.document_type).order("created_at", { ascending: false }).limit(1);
    if (next?.[0]?.id) await supabase.from(TABLE).update({ is_active: true }).eq("id", next[0].id);
  }
  return { id: row.id, deleted: true };
}

/** Current print sort of a document type (null when not set). */
export async function getDocumentTypeSort(documentType) {
  const type = cleanType(documentType);
  const { data, error } = await getSupabaseAdmin().from(TABLE).select("sort")
    .eq("document_type", type).not("sort", "is", null)
    .order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message || "Failed to load sort");
  return data?.[0]?.sort ?? null;
}

/** Set the print sort for every row of a document type (all versions). */
export async function updateDocumentTypeSort(documentType, sortValue) {
  const type = cleanType(documentType);
  const sort = normalizeSort(sortValue);
  const { error } = await getSupabaseAdmin().from(TABLE).update({ sort }).eq("document_type", type);
  if (error) throw new Error(error.message || "Failed to save sort");
  return { documentType: type, sort };
}

/** Save the print sort of several document types (drag-and-drop result). */
export async function updateDocumentTypeSorts(items) {
  const results = [];
  for (const item of items ?? []) {
    results.push(await updateDocumentTypeSort(item?.type, item?.sort));
  }
  return results;
}

/** Active document of a type for printing: { url, sort } (null when none). */
export async function getActiveDocument(documentType) {
  const type = cleanType(documentType);
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE).select("storage_path, sort").eq("document_type", type).eq("is_active", true)
    .order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message || "Failed to load document");
  const row = data?.[0];
  if (!row?.storage_path) return null;
  const url = await getSignedFileUrl({ bucket: BUCKET, storagePath: row.storage_path, expiresIn: 300 });
  return { url, sort: row.sort ?? null };
}

/** Signed URL of the active document of a type (null when none). */
export async function getActiveDocumentUrl(documentType) {
  const type = cleanType(documentType);
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE).select("storage_path").eq("document_type", type).eq("is_active", true)
    .order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message || "Failed to load document");
  const path = data?.[0]?.storage_path;
  return path ? getSignedFileUrl({ bucket: BUCKET, storagePath: path, expiresIn: 300 }) : null;
}