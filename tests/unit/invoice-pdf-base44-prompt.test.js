import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

describe("invoice-pdf-base44 — kontrakt promptów", () => {
  it("moduł łączy addendum skanów i tryb głęboki w kolejnych próbach", () => {
    const p = path.join(repoRoot, "src", "lib", "invoice-pdf-base44.js");
    const src = readFileSync(p, "utf8");
    expect(src).toContain("INVOICE_OCR_SCAN_ADDENDUM");
    expect(src).toContain("INVOICE_OCR_SCAN_ADDENDUM_DEEP");
    expect(src).toMatch(/attemptIndex >= 2/);
  });
});
