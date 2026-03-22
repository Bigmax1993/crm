import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const indexCssPath = path.resolve(__dirname, "../../src/index.css");

describe("Motyw — index.css", () => {
  it("utrzymuje granatowe tło canvas i sidebar w tonacji niebieskiej (220/222); sidebar-background nie jest hue 310", () => {
    const css = readFileSync(indexCssPath, "utf8");
    expect(css).toMatch(/--background:\s*220\s+45%/);
    expect(css).toMatch(/--sidebar-background:\s*220\s+42%/);
    expect(css).toMatch(/--sidebar-background:\s*222\s+48%\s+9%/);
    expect(css).not.toMatch(/--sidebar-background:\s*310/);
  });
});
