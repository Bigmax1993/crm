/**
 * GitHub Pages: dla tras React Router (np. /crm/ProjectCostMonitoring) serwer zwraca 404.
 * Jeśli w katalogu jest 404.html identyczny jak index.html, GH Pages wyświetla SPA i router działa.
 */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const indexHtml = join(dist, "index.html");
const notFoundHtml = join(dist, "404.html");

if (!existsSync(indexHtml)) {
  console.warn("[copy-spa-404] brak dist/index.html — pomijam");
  process.exit(0);
}

copyFileSync(indexHtml, notFoundHtml);
console.log("[copy-spa-404] skopiowano dist/index.html → dist/404.html (SPA na GitHub Pages)");
