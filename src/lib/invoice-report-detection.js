/**
 * Wykrywanie plików wyglądających na raport bankowy / wyciąg zamiast faktury VAT.
 */

export function looksLikeBankReportName(name) {
  const n = (name || "").toLowerCase();
  return (
    /\braport\b/i.test(n) ||
    /mizar/i.test(n) ||
    /\bwyciąg\b/.test(n) ||
    /\bwyciag\b/.test(n) ||
    /\bextract\b/.test(n) ||
    /\bstatement\b/.test(n)
  );
}

export function looksLikeBankReportPlain(plain) {
  if (!plain || typeof plain !== "string") return false;
  const sample = plain.slice(0, 5000);
  const lower = sample.toLowerCase();
  const looksLikeInvoice =
    /(faktura\s+vat|numer\s+faktury|nabywca|sprzedawca|^fv\s|nip\s*(\d|pl))/i.test(sample) &&
    /(brutto|netto|vat|do\s+zapłaty)/i.test(sample);
  if (looksLikeInvoice) return false;
  return /\b(raport|wyciąg|wyciag|lista\s+transakcji|obroty|saldo|operacje|przelew|wyciąg\s+bankowy|account\s+statement)\b/i.test(
    lower
  );
}
