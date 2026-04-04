import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

describe("Layout — brak przewijania poziomego (kontrakt plików)", () => {
  it("Layout.jsx ustawia overflow-x-hidden na głównych kontenerach", () => {
    const layoutPath = path.join(repoRoot, "src", "Layout.jsx");
    const src = readFileSync(layoutPath, "utf8");
    expect(src).toMatch(/overflow-x-hidden/);
    expect(src).toMatch(/min-w-0 flex-1 overflow-x-hidden/);
    expect(src).toMatch(/min-w-0 flex-1 flex-col overflow-x-hidden/);
  });

  it("index.css — body overflow-x-hidden", () => {
    const cssPath = path.join(repoRoot, "src", "index.css");
    const css = readFileSync(cssPath, "utf8");
    expect(css).toMatch(/overflow-x-hidden/);
  });
});
