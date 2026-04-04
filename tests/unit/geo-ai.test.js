import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  openaiChatCompletions: vi.fn(),
}));

vi.mock("@/lib/openai-crm", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    openaiChatCompletions: hoisted.openaiChatCompletions,
  };
});

import {
  isLikelyGeoQuestion,
  haversineKm,
  buildProjectLocationMatches,
  resolveGeoIntentWithGpt,
  geocodeCityWithGpt,
  formatGeoProjectsReply,
} from "@/lib/geo-ai";

describe("geo-ai helpers", () => {
  beforeEach(() => {
    hoisted.openaiChatCompletions.mockReset();
    localStorage.clear();
  });

  it("wykrywa pytania geolokalizacyjne dla projektów", () => {
    expect(isLikelyGeoQuestion("Pokaż wszystkie projekty z miejscowości Krosno Odrzańskie")).toBe(true);
    expect(isLikelyGeoQuestion("Jakie są marże projektów?")).toBe(false);
  });

  it("liczy odległość haversine", () => {
    const krosno = { lat: 52.0536, lon: 15.0988 };
    const zielona = { lat: 51.9356, lon: 15.5062 };
    const d = haversineKm(krosno, zielona);
    expect(d).toBeGreaterThan(20);
    expect(d).toBeLessThan(40);
  });

  it("filtruje projekty w promieniu", () => {
    const center = { lat: 52.0536, lon: 15.0988 };
    const projects = [
      { id: "p1", object_name: "A", latitude: 52.055, longitude: 15.11 },
      { id: "p2", object_name: "B", latitude: 51.9356, longitude: 15.5062 },
    ];
    const near = buildProjectLocationMatches(projects, center, 15);
    expect(near).toHaveLength(1);
    expect(near[0].project.id).toBe("p1");
  });

  it("parsuje intencję geolokalizacyjną z GPT", async () => {
    hoisted.openaiChatCompletions.mockResolvedValueOnce({
      text: '{"is_geo_query":true,"city":"Krosno Odrzańskie","country_iso2":"PL","radius_km":25}',
    });
    const r = await resolveGeoIntentWithGpt("Pokaż projekty w Krosno Odrzańskie");
    expect(r.is_geo_query).toBe(true);
    expect(r.city).toBe("Krosno Odrzańskie");
    expect(r.country_iso2).toBe("PL");
    expect(r.radius_km).toBe(25);
  });

  it("geokoduje miejscowość i używa cache", async () => {
    hoisted.openaiChatCompletions.mockResolvedValueOnce({
      text: '{"city":"Krosno Odrzańskie","official_name_pl":"Krosno Odrzańskie","country_iso2":"PL","lat":52.054,"lon":15.098,"confidence":0.95}',
    });
    const first = await geocodeCityWithGpt("Krosno Odrzańskie", "PL");
    const second = await geocodeCityWithGpt("Krosno Odrzańskie", "PL");
    expect(first.source).toBe("gpt");
    expect(first.official_name_pl).toBe("Krosno Odrzańskie");
    expect(second.source).toBe("cache");
    expect(hoisted.openaiChatCompletions).toHaveBeenCalledTimes(1);
  });

  it("formatuje odpowiedź z listą projektów", () => {
    const text = formatGeoProjectsReply({
      city: "Krosno Odrzańskie",
      countryIso2: "PL",
      radiusKm: 20,
      rows: [{ project: { object_name: "Orlik", city: "Krosno Odrzańskie" }, distanceKm: 2.34 }],
    });
    expect(text).toContain("promień 20 km");
    expect(text).toContain("Orlik");
    expect(text).toContain("2.3 km");
  });
});
