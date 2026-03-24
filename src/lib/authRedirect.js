import { createAbsolutePageHref, createPageUrl } from "@/utils";

/**
 * Pełny URL przekierowania (OAuth, magic link, reset hasła, potwierdzenie e-maila).
 *
 * `VITE_PUBLIC_SITE_URL` — baza publiczna **bez** podwójnej ścieżki repo, np. `https://user.github.io/crm`
 * (potem dokładamy `/Login`). Jeśli puste, używamy `origin` + ścieżki z Vite `base` (`createAbsolutePageHref`).
 */
export function getAuthRedirectToPath(pageName = "Login") {
  const pathOnly = createPageUrl(pageName);
  const site = import.meta.env.VITE_PUBLIC_SITE_URL?.trim();
  if (site) {
    const base = site.replace(/\/$/, "");
    const p = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
    return `${base}${p}`.replace(/([^:]\/)\/+/g, "$1");
  }
  if (typeof window === "undefined") {
    return createAbsolutePageHref(pageName);
  }
  const pathWithBase = createAbsolutePageHref(pageName);
  return `${window.location.origin}${pathWithBase}`.replace(/([^:]\/)\/+/g, "$1");
}
