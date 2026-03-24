import path from "node:path";
import { fileURLToPath } from "node:url";
import base44 from "@base44/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isVitest = Boolean(process.env.VITEST);

/** GitHub Pages (projekt): VITE_BASE_PATH=/nazwa-repo/ — lokalnie zwykle nie ustawiasz (domyślnie "/"). */
function viteBase() {
  const raw = process.env.VITE_BASE_PATH?.trim();
  if (!raw || raw === "/") return "/";
  const withLead = raw.startsWith("/") ? raw : `/${raw}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
}

// https://vite.dev/config/
export default defineConfig({
  base: viteBase(),
  logLevel: "error", // Suppress warnings, only show errors
  // Build produkcyjny = statyczny SPA (HTML + JS + CSS w katalogu dist/)
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    sourcemap: false,
  },
  optimizeDeps: {
    // sql.js to CJS — pre-bundle (esbuild) dodaje interop `default`; exclude powodował surowy plik bez default → biały ekran w przeglądarce.
    include: ["sql.js"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // sql.js: eksport "browser" (sql-wasm-browser.js) nie ma poprawnego default w ESM → biały ekran w Vite.
      // Build sql-wasm.js + locateFile → public/sql-wasm.wasm (patrz database.js, scripts/copy-sql-wasm.mjs).
      "sql.js": path.resolve(__dirname, "node_modules/sql.js/dist/sql-wasm.js"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    include: [
      "tests/**/*.test.{js,jsx}",
      "tests/**/*.contract.test.js",
      "tests/**/*.perf.test.js",
      "tests/**/*.a11y.test.{js,jsx}",
    ],
  },
  plugins: [
    ...(isVitest
      ? []
      : [
          base44({
            // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
            // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
            legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === "true",
            hmrNotifier: true,
            navigationNotifier: true,
            visualEditAgent: true,
          }),
        ]),
    react(),
  ],
});