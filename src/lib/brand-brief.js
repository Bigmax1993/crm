/**
 * Dane firmy do eksportów, PDF i promptów AI — uzupełnij pod własną organizację.
 */

export const EXPORT_COMPANY_NAME = "Fakturowo CRM";
export const EXPORT_ADDRESS = "";
export const EXPORT_WEB = "";

/** Krótki opis do promptów systemowych / user (OpenAI). */
export const BRAND_BRIEF_PL = `Aplikacja: Fakturowo CRM — faktury, projekty budowlane, kontrahenci, cash flow i raporty.
Skonfiguruj w ustawieniach własną nazwę firmy, adres i branżę.`;

export function getBrandBriefForPrompt() {
  return BRAND_BRIEF_PL;
}

export function getExportReportTitle(suffix = "") {
  const s = suffix ? ` — ${suffix}` : "";
  return `${EXPORT_COMPANY_NAME}${s}`;
}

/** RGB nagłówków PDF / akcentu UI. */
export const EXPORT_BRAND_RGB = { r: 108, g: 52, b: 96 };

/** Excel ARGB nagłówka tabel. */
export const EXPORT_BRAND_EXCEL_ARGB = "FF6C3460";
