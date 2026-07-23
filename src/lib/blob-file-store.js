/**
 * Duże pliki (PDF, zdjęcia) — IndexedDB zamiast localStorage / data URL w SQLite.
 * Referencja: fakturowo-blob://<uuid>
 */

const DB_NAME = "fakturowo_blob_store_v1";
const STORE = "files";
const REF_PREFIX = "fakturowo-blob://";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error || new Error("IndexedDB niedostępne"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function newBlobId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `b_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isStoredFileRef(url) {
  return typeof url === "string" && url.startsWith(REF_PREFIX);
}

export function storedFileRefId(url) {
  if (!isStoredFileRef(url)) return null;
  return url.slice(REF_PREFIX.length);
}

/** @param {Blob|File} blob */
export async function putBlob(blob, meta = {}) {
  const id = newBlobId();
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put({
      id,
      blob,
      mime: blob.type || meta.type || "application/octet-stream",
      name: meta.name || "",
      created_at: new Date().toISOString(),
    });
  });
  db.close();
  return `${REF_PREFIX}${id}`;
}

export async function getBlob(refOrId) {
  const id = isStoredFileRef(refOrId) ? storedFileRefId(refOrId) : refOrId;
  if (!id) return null;
  const db = await openDb();
  const row = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return row?.blob ?? null;
}

const objectUrlCache = new Map();

/** URL do podglądu / fetch (blob:). */
export async function getBlobObjectUrl(ref) {
  if (!ref) return "";
  if (!isStoredFileRef(ref)) return ref;
  if (objectUrlCache.has(ref)) return objectUrlCache.get(ref);
  const blob = await getBlob(ref);
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(ref, url);
  return url;
}

export async function deleteBlob(ref) {
  const id = storedFileRefId(ref);
  if (!id) return;
  const cached = objectUrlCache.get(ref);
  if (cached) {
    URL.revokeObjectURL(cached);
    objectUrlCache.delete(ref);
  }
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(id);
  });
  db.close();
}
