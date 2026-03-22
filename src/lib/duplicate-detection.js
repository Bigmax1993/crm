/**
 * Normalizacja numeru faktury do porównań (spacje, wielkość liter, myślniki).
 */
export function normalizeInvoiceNumberKey(raw) {
  if (raw == null) return "";
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[–—−]/g, "-");
}

/**
 * Czy dwa numery faktury uznajemy za ten sam (dokładnie lub jeden zawiera drugi po normalizacji).
 */
export function invoiceNumberMatches(a, b) {
  const ka = normalizeInvoiceNumberKey(a);
  const kb = normalizeInvoiceNumberKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  return ka.includes(kb) || kb.includes(ka);
}

/** Pierwsza istniejąca faktura o tym samym numerze (wg dopasowania powyżej). */
export function findDuplicateInvoice(existingInvoices, candidate) {
  const num = candidate?.invoice_number;
  if (!String(num ?? "").trim()) return null;
  return existingInvoices.find((ex) => invoiceNumberMatches(ex.invoice_number, num)) ?? null;
}

/**
 * Duplikat numeru względem listy, z pominięciem rekordu o danym id (edycja).
 * @returns {object | null} — konfliktująca faktura lub null
 */
export function findInvoiceNumberConflict(existingInvoices, invoiceNumber, excludeId) {
  if (!String(invoiceNumber ?? "").trim()) return null;
  return (
    existingInvoices.find(
      (ex) => ex.id !== excludeId && invoiceNumberMatches(ex.invoice_number, invoiceNumber)
    ) ?? null
  );
}

/**
 * Odcisk przelewu: ta sama data, kwota, waluta, konto, tytuł i kontrahent → uznajemy za duplikat importu.
 */
export function transferFingerprint(t) {
  const date = String(t.transfer_date || "").trim().slice(0, 10);
  const amt = Number(t.amount);
  const rounded = Number.isFinite(amt) ? Math.round(amt * 100) / 100 : 0;
  const cur = String(t.currency || "PLN")
    .trim()
    .toUpperCase();
  const acc = String(t.account_number || "")
    .replace(/\s/g, "")
    .toLowerCase();
  const title = String(t.title || "")
    .trim()
    .toLowerCase()
    .slice(0, 240);
  const contractor = String(t.contractor_name || "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  return `${date}|${rounded}|${cur}|${acc}|${title}|${contractor}`;
}
