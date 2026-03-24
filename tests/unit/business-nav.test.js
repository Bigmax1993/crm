import { describe, it, expect } from "vitest";
import { NAV_GROUP_ORDER, PAGE_TITLES, titleForPage } from "@/lib/business-nav";

describe("business-nav — titleForPage", () => {
  it("znany klucz zwraca tytuł z PAGE_TITLES", () => {
    expect(titleForPage("CEODashboard")).toBe("Dashboard CEO");
    expect(titleForPage("ExportReports")).toBe("Eksport Excel / PDF");
    expect(titleForPage("ContractorDetails")).toBe("Kontrahent");
  });

  it("nieznany klucz CamelCase rozbija na słowa", () => {
    expect(titleForPage("FooBar")).toBe("Foo Bar");
  });

  it("pusty / brak klucza — fallback", () => {
    expect(titleForPage(undefined)).toBe("Fakturowo");
    expect(titleForPage(null)).toBe("Fakturowo");
    expect(titleForPage("")).toBe("Fakturowo");
  });
});

describe("business-nav — NAV_GROUP_ORDER", () => {
  it("każda strona w grupach ma wpis w PAGE_TITLES", () => {
    const pages = NAV_GROUP_ORDER.flatMap((g) => g.pages);
    for (const p of pages) {
      expect(PAGE_TITLES[p], `brak tytułu dla ${p}`).toBeDefined();
      expect(String(PAGE_TITLES[p]).length).toBeGreaterThan(0);
    }
  });

  it("strony w nawigacji nie powtarzają się", () => {
    const pages = NAV_GROUP_ORDER.flatMap((g) => g.pages);
    const uniq = new Set(pages);
    expect(uniq.size).toBe(pages.length);
  });

  it("identyfikatory grup są unikalne", () => {
    const ids = NAV_GROUP_ORDER.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("grupa System: Roadmap, SettingsAI, Settings (bez Security — strona usunięta)", () => {
    const system = NAV_GROUP_ORDER.find((g) => g.id === "system");
    expect(system?.pages).toEqual(["SettingsAI", "Roadmap", "Settings"]);
    expect(PAGE_TITLES.Roadmap).toBe("Plan rozwoju");
    expect(PAGE_TITLES.Settings).toBe("Ustawienia");
    expect(PAGE_TITLES.SettingsAI).toBe("Ustawienia AI");
  });

  it("Security nie występuje w nawigacji ani w tytułach", () => {
    const navPages = NAV_GROUP_ORDER.flatMap((g) => g.pages);
    expect(navPages).not.toContain("Security");
    expect(PAGE_TITLES.Security).toBeUndefined();
  });
});
