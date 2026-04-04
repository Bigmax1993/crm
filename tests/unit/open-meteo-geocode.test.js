import { describe, it, expect } from "vitest";
import { mapOpenMeteoResult } from "@/lib/open-meteo-geocode";

describe("open-meteo-geocode", () => {
  it("mapuje wynik Wrocław", () => {
    const row = mapOpenMeteoResult({
      id: 3081368,
      name: "Wrocław",
      latitude: 51.1,
      longitude: 17.03333,
      country_code: "PL",
      admin2: "Wrocław",
    });
    expect(row?.cityValue).toBe("Wrocław");
    expect(row?.lat).toBeCloseTo(51.1, 3);
    expect(row?.lon).toBeCloseTo(17.03333, 3);
    expect(row?.label).toContain("Wrocław");
  });
});
