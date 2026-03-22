/**
 * Kopiuje sql-wasm.wasm z node_modules/sql.js do public/ (hosting statyczny, bez CDN).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const dest = path.join(root, "public", "sql-wasm.wasm");

if (!fs.existsSync(src)) {
  console.warn("[copy-sql-wasm] Brak pliku źródłowego (uruchom npm install):", src);
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log("[copy-sql-wasm] OK → public/sql-wasm.wasm");
