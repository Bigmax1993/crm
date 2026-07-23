import { describe, it, expect } from "vitest";
import {
  emptyConstructionPlan,
  pickConstructionPlanApiPayload,
  normalizeRooms,
  roomsToDisplay,
  CONSTRUCTION_PLAN_TYPES,
  constructionPlanSchema,
  projectMatchPayloadFromPlan,
} from "@/lib/construction-plan-schema";

describe("construction-plan-schema", () => {
  it("CONSTRUCTION_PLAN_TYPES ma kluczowe typy", () => {
    expect(CONSTRUCTION_PLAN_TYPES.floor).toMatch(/piętra|rzut/i);
    expect(CONSTRUCTION_PLAN_TYPES.site).toBeTruthy();
  });

  it("emptyConstructionPlan scala overrides", () => {
    const p = emptyConstructionPlan({ title: "EG", city: "Emmerich" });
    expect(p.title).toBe("EG");
    expect(p.city).toBe("Emmerich");
    expect(p.plan_type).toBe("floor");
    expect(p.rooms).toEqual([]);
  });

  it("normalizeRooms mapuje nazwa/powierzchnia_m2", () => {
    expect(normalizeRooms([{ nazwa: "WC", powierzchnia_m2: "12.5" }])).toEqual([
      { name: "WC", area_m2: 12.5 },
    ]);
    expect(normalizeRooms(null)).toEqual([]);
  });

  it("roomsToDisplay formatuje listę", () => {
    expect(roomsToDisplay([])).toBe("—");
    expect(roomsToDisplay([{ name: "Aula", area_m2: 100 }])).toContain("100");
  });

  it("constructionPlanSchema wymaga tytułu", () => {
    expect(constructionPlanSchema.safeParse({ title: "" }).success).toBe(false);
    expect(constructionPlanSchema.safeParse({ title: "Plan EG" }).success).toBe(true);
  });

  it("pickConstructionPlanApiPayload czyści payload API", () => {
    const payload = pickConstructionPlanApiPayload({
      title: "  Rzut  ",
      sheet_number: "A-01",
      rooms: [{ name: "X", area_m2: 1 }],
      project_id: "p1",
      _projectMatchReason: "claude",
      _projectMatchConfidence: 90,
      _fileRef: {},
    });
    expect(payload.title).toBe("Rzut");
    expect(payload.sheet_number).toBe("A-01");
    expect(payload.project_id).toBe("p1");
    expect(payload.project_match_reason).toBe("claude");
    expect(payload._fileRef).toBeUndefined();
  });

  it("projectMatchPayloadFromPlan buduje tekst do matchingu", () => {
    const m = projectMatchPayloadFromPlan({
      title: "Fliesenspiegel",
      city: "Emmerich",
      site_address: "Hauptstr.",
      rooms: [{ name: "EG", area_m2: 50 }],
    });
    expect(m.position).toMatch(/Fliesenspiegel/);
    expect(m.position).toMatch(/Emmerich/);
  });
});
