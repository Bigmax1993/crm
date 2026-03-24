import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Osobny plik — po stubie BASE_URL dynamiczny import utils (uniknięcie cache modułu z domyślnym base).
 */
describe("utils — createAbsolutePageHref przy base jak na GitHub Pages", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("prefixuje ścieżkę repozytorium (/crm/)", async () => {
    vi.stubEnv("BASE_URL", "/crm/");
    const { createAbsolutePageHref } = await import("@/utils/index.ts");
    expect(createAbsolutePageHref("Settings")).toBe("/crm/Settings");
    expect(createAbsolutePageHref("CEODashboard")).toBe("/crm/CEODashboard");
  });
});
