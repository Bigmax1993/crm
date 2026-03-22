export function createPageUrl(pageName: string) {
  return "/" + pageName.replace(/ /g, "-");
}

/**
 * Pełna ścieżka z prefiksem `base` Vite (np. /crm/ na GitHub Pages).
 * Używaj przy `window.location` — React Router i `<Link>` korzystają z `createPageUrl` + `basename`.
 */
export function createAbsolutePageHref(pageName: string) {
  const path = createPageUrl(pageName);
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  if (base === "") return path;
  const rest = path.replace(/^\/+/, "");
  return `/${base}/${rest}`.replace(/\/+/g, "/");
}