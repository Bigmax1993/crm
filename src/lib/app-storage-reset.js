import { resetDB } from "@/lib/database";

const EXTRA_KEYS = new Set(["app_home_page", "crm_admin_ui", "token"]);

/**
 * Czyści dane aplikacji w tej przeglądarce: snapshot SQL.js, encje CRM w localStorage,
 * AI, cache NBP, parametry Base44 z URL itd. Po wywołaniu warto zrobić `location.reload()`.
 */
export function clearAllWebAppStorage() {
  if (typeof window === "undefined" || !window.localStorage) return;
  resetDB();
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith("fakturowo_") || k.startsWith("base44_") || EXTRA_KEYS.has(k)) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) {
    localStorage.removeItem(k);
  }
}
