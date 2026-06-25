import { describe, it, expect } from "vitest";
import { inferSiteCountryIso2, siteHasCoords } from "@/lib/site-geocode";

describe("site-geocode", () => {
  it("rozpoznaje PL po kodzie pocztowym", () => {
    expect(inferSiteCountryIso2({ city: "Szczecin", postal_code: "70-001" })).toBe("PL");
  });

  it("rozpoznaje DE po mieście i kodzie niemieckim", () => {
    expect(inferSiteCountryIso2({ city: "Dresden", postal_code: "01067" })).toBe("DE");
    expect(inferSiteCountryIso2({ city: "Saalfeld" })).toBe("DE");
  });

  it("siteHasCoords wymaga poprawnych liczb", () => {
    expect(siteHasCoords({ latitude: 52.1, longitude: 21 })).toBe(true);
    expect(siteHasCoords({ latitude: null, longitude: null })).toBe(false);
    expect(siteHasCoords({ latitude: "", longitude: "" })).toBe(false);
  });
});
