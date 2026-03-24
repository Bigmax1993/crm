import { describe, it, expect, vi } from "vitest";
import { loadFxConfig, saveFxConfig } from "@/lib/fx-config-store";

describe("fx-config-store (jednostkowe)", () => {
  it("loadFxConfig zwraca domyślne gdy brak wpisu", () => {
    const c = loadFxConfig();
    expect(c.baseCurrency).toBe("PLN");
    expect(Array.isArray(c.activeCurrencies)).toBe(true);
    expect(c.activeCurrencies).toContain("EUR");
  });

  it("saveFxConfig zapisuje i wywołuje zdarzenie fakturowo-fx-config", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    try {
      saveFxConfig({
        baseCurrency: "PLN",
        activeCurrencies: ["PLN", "EUR"],
        manualMid: { EUR: 4.5 },
      });
      expect(spy).toHaveBeenCalled();
      const evt = spy.mock.calls.find((c) => c[0]?.type === "fakturowo-fx-config");
      expect(evt).toBeDefined();
      const again = loadFxConfig();
      expect(again.manualMid.EUR).toBe(4.5);
      expect(again.activeCurrencies).toEqual(["PLN", "EUR"]);
    } finally {
      spy.mockRestore();
    }
  });
});
