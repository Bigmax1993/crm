import { getBlobObjectUrl, isStoredFileRef } from "@/lib/blob-file-store";

/** Zwraca URL nadający się do <img src>, fetch, window.open. */
export async function resolveStoredFileUrl(url) {
  if (!url) return "";
  if (isStoredFileRef(url)) return getBlobObjectUrl(url);
  return url;
}

export async function openStoredFile(url) {
  const resolved = await resolveStoredFileUrl(url);
  if (!resolved) throw new Error("Plik niedostępny");
  window.open(resolved, "_blank", "noopener,noreferrer");
}

export async function downloadStoredFile(url, filename = "plik") {
  const resolved = await resolveStoredFileUrl(url);
  if (!resolved) throw new Error("Plik niedostępny");
  const a = document.createElement("a");
  a.href = resolved;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
