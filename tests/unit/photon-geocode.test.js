import { describe, it, expect } from "vitest";
import { parsePhotonFeature } from "@/lib/photon-geocode";

describe("photon-geocode", () => {
  it("parsuje punkt miejski z nazwą po polsku", () => {
    const row = parsePhotonFeature({
      type: "Feature",
      geometry: { type: "Point", coordinates: [17.038538, 51.107885] },
      properties: { name: "Wrocław", city: "Wrocław", country: "Poland", type: "city" },
    });
    expect(row?.cityValue).toBe("Wrocław");
    expect(row?.lat).toBeCloseTo(51.107885, 4);
    expect(row?.lon).toBeCloseTo(17.038538, 4);
  });

  it("łączy POI z miejscowością w etykiecie", () => {
    const row = parsePhotonFeature({
      type: "Feature",
      geometry: { type: "Point", coordinates: [17.03, 51.11] },
      properties: { name: "Rynek", city: "Wrocław" },
    });
    expect(row?.label).toContain("Rynek");
    expect(row?.label).toContain("Wrocław");
    expect(row?.cityValue).toBe("Wrocław");
  });
});
