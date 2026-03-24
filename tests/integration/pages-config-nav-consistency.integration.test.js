import { describe, it, expect } from "vitest";
import { NAV_GROUP_ORDER, PAGE_TITLES } from "@/lib/business-nav";
import { pagesConfig } from "@/pages.config.js";

/**
 * Import pages.config ładuje moduły stron — celowo w pliku „integracja”, nie w unit.
 */
describe("pages.config ↔ business-nav — spójność routingu i nawigacji", () => {
  const appPageKeys = Object.keys(pagesConfig.Pages);
  const excludedFromRail = new Set(["ContractorDetails"]);

  it("każda routowana strona (oprócz wyjątków) jest w nawigacji grupowej", () => {
    const navPages = new Set(NAV_GROUP_ORDER.flatMap((g) => g.pages));
    for (const key of appPageKeys) {
      if (excludedFromRail.has(key)) continue;
      expect(navPages.has(key), `Brak ${key} w NAV_GROUP_ORDER`).toBe(true);
    }
  });

  it("każda strona z nawigacji istnieje w pages.config.Pages", () => {
    const navPages = NAV_GROUP_ORDER.flatMap((g) => g.pages);
    for (const p of navPages) {
      expect(pagesConfig.Pages[p], `Nieznana strona w nav: ${p}`).toBeDefined();
    }
  });

  it("strony wykluczone z railu mają tytuł w PAGE_TITLES", () => {
    for (const key of excludedFromRail) {
      expect(PAGE_TITLES[key]).toBeDefined();
    }
  });

  it("Security nie jest trasą ani pozycją menu (usunięte z aplikacji)", () => {
    expect(appPageKeys).not.toContain("Security");
    const navPages = NAV_GROUP_ORDER.flatMap((g) => g.pages);
    expect(navPages).not.toContain("Security");
  });
});
