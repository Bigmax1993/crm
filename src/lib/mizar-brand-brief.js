/**
 * Kontekst marki dla AI i eksportów — spójny z komunikacją Mizar Sport.
 * @see https://mizarsport.eu/
 */

export const MIZAR_EXPORT_COMPANY_NAME = "Mizar Sport / MIZAR Sp. z o.o.";
export const MIZAR_EXPORT_ADDRESS = "ul. Sulechowska 39a, 65-022 Zielona Góra";
export const MIZAR_EXPORT_WEB = "https://mizarsport.eu/";

/** Krótki opis do promptów systemowych / user (OpenAI). */
export const MIZAR_BRAND_BRIEF_PL = `Firma: Mizar Sport (MIZAR Sp. z o.o.) — kompleksowe wykonawstwo obiektów i nawierzchni sportowych (obiekty otwarte i hale).
Oferta: boiska wielofunkcyjne i korty, boiska piłkarskie, hale sportowe, obiekty lekkoatletyczne, renowacje nawierzchni, place zabaw, podłogi wewnętrzne.
Kompetencje: normy krajowe i UE, atesty, wytyczne PZLA i FIFA, przygotowanie do certyfikacji; wsparcie przy wnioskach o dofinansowanie (m.in. ORLIK, Sportowa Polska, Olimpia, fundusze UE, Lubuska Baza Sportowa i inne).
Adres: ${MIZAR_EXPORT_ADDRESS}. Strona: ${MIZAR_EXPORT_WEB}`;

export function getMizarBrandBriefForPrompt() {
  return MIZAR_BRAND_BRIEF_PL;
}

export function getExportReportTitle(suffix = "") {
  const s = suffix ? ` — ${suffix}` : "";
  return `${MIZAR_EXPORT_COMPANY_NAME}${s}`;
}

/** RGB marki (#6c3460) — nagłówki PDF. */
export const MIZAR_BRAND_RGB = { r: 108, g: 52, b: 96 };

/** Excel ARGB nagłówka tabel (fiolet marki). */
export const MIZAR_BRAND_EXCEL_ARGB = "FF6C3460";
