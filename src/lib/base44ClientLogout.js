import { appParams } from "@/lib/app-params";
import { createAbsolutePageHref } from "@/utils";

/**
 * Czy można użyć zdalnego wylogowania Base44 (przekierowanie na serwer aplikacji).
 * Na GitHub Pages `appBaseUrl` często jest puste lub błędne — wtedy SDK buduje URL pod
 * `*.github.io/api/...` i dostajesz 404.
 */
export function canUseBase44RemoteLogout() {
  const raw = appParams.appBaseUrl?.trim();
  if (!raw) return false;
  try {
    const { hostname } = new URL(raw);
    const h = hostname.toLowerCase();
    if (h.endsWith("github.io")) return false;
    return true;
  } catch {
    return false;
  }
}

/** Usuwa tokeny Base44 z localStorage (prefiks base44_ + token). */
export function clearBase44BrowserSession() {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(window.localStorage);
    for (const k of keys) {
      if (k.startsWith("base44_") || k === "token") {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}

/** Pełne przeładowanie SPA pod katalogiem Vite base (np. /crm/). */
export function assignSpaRootUrl() {
  if (typeof window === "undefined") return;
  const href = `${window.location.origin}${createAbsolutePageHref("")}`;
  window.location.assign(href.replace(/([^:]\/)\/+/g, "$1"));
}
