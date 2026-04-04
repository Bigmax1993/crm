/**
 * Base44 Core.UploadFile — w praktyce zwraca publiczny adres pod kluczem `url`
 * (por. Invoices.jsx, Construction.jsx). Starsze fragmenty mogły używać `file_url`.
 */
export function getUploadFilePublicUrl(res) {
  if (!res || typeof res !== "object") return null;
  return res.url ?? res.file_url ?? res.fileUrl ?? null;
}
