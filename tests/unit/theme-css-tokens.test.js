import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const indexCssPath = path.resolve(__dirname, "../../src/index.css");

describe("Motyw — index.css", () => {
  it("jasny motyw: ciemny tekst (foreground) i jasne tło; sidebar nie używa fioletu jako tła", () => {
    const css = readFileSync(indexCssPath, "utf8");
    expect(css).toMatch(/--foreground:\s*30\s+4%\s+19%/);
    expect(css).toMatch(/--background:\s*40\s+7%\s+96%/);
    expect(css).toMatch(/--sidebar-foreground:\s*30\s+5%\s+20%/);
    expect(css).not.toMatch(/--sidebar-background:\s*310/);
  });
});
