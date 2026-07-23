/**
 * Duże pliki (PDF, zdjęcia) — IndexedDB zamiast localStorage / data URL w SQLite.
 * Referencja: fakturowo-blob://<uuid>
 * Zawartość jako base64 (niezawodny structured clone w IDB / jsdom).
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

async function toUint8Array(blob) {
  if (blob instanceof Uint8Array) return blob;
  if (blob instanceof ArrayBuffer) return new Uint8Array(blob);
  if (ArrayBuffer.isView(blob)) {
    return new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength);
  }
  if (blob instanceof Blob || (typeof File !== "undefined" && blob instanceof File)) {
    if (typeof blob.arrayBuffer === "function") {
      try {
        const ab = await blob.arrayBuffer();
        if (ab instanceof ArrayBuffer) return new Uint8Array(ab);
      } catch {
        /* jsdom: FileReader */
      }
    }
    if (typeof FileReader !== "undefined") {
      const ab = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("FileReader error"));
        reader.readAsArrayBuffer(blob);
      });
      return new Uint8Array(ab);
    }
  }
  throw new Error("Nie można odczytać bajtów pliku do IndexedDB");
}

function uint8ToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** @param {Blob|File|ArrayBuffer|Uint8Array} blob */
export async function putBlob(blob, meta = {}) {
  const id = newBlobId();
  const bytes = await toUint8Array(blob);
  const mime =
    (blob && typeof blob === "object" && "type" in blob && blob.type) ||
    meta.type ||
    "application/octet-stream";
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put({
      id,
      data_b64: uint8ToBase64(bytes),
      mime,
      name: meta.name || (blob instanceof File ? blob.name : "") || "",
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
  if (!row) return null;
  const mime = row.mime || "application/octet-stream";
  if (typeof row.data_b64 === "string" && row.data_b64) {
    return new Blob([base64ToUint8(row.data_b64)], { type: mime });
  }
  if (row.buffer instanceof ArrayBuffer) {
    return new Blob([row.buffer], { type: mime });
  }
  if (row.blob instanceof Blob) return row.blob;
  return null;
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
