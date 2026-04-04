import { describe, it, expect } from "vitest";
import {
  mapOpenMeteoResult,
  normalizeAsciiKey,
  resolvePolishCityName,
} from "@/lib/open-meteo-geocode";

describe("open-meteo-geocode", () => {
  it("normalizeAsciiKey usuwa ogonki", () => {
    expect(normalizeAsciiKey("Łódź")).toBe("lodz");
    expect(normalizeAsciiKey("Wrocław")).toBe("wroclaw");
  });

  it("mapuje wynik Wrocław", () => {
    const row = mapOpenMeteoResult({
      id: 3081368,
      name: "Wrocław",
      latitude: 51.1,
      longitude: 17.03333,
      country_code: "PL",
      feature_code: "PPLA",
      admin2: "Wrocław",
    });
    expect(row?.cityValue).toBe("Wrocław");
  });

  it("zamienia Breslau na Wrocław", () => {
    expect(
      resolvePolishCityName({
        name: "Breslau",
        feature_code: "PPLA",
        latitude: 51.1,
        longitude: 17.03,
        admin2: "Wrocław",
      })
    ).toBe("Wrocław");
  });

  it("pomija Landkreis (ADM) z nazwy niemieckiej", () => {
    expect(
      mapOpenMeteoResult({
        id: 1,
        name: "Landkreis Breslau",
        feature_code: "ADM2",
        latitude: 51.04,
        longitude: 16.87,
      })
    ).toBeNull();
  });
});
