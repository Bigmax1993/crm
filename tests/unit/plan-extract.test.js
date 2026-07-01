import { describe, it, expect } from "vitest";
import {
  mapPlanJsonToInternal,
  resolveClaudeProjectMatch,
  planMappedHasUsableData,
  buildProjectsContextForClaude,
} from "@/lib/plan-extract";

const projects = [
  {
    id: "p1",
    object_name: "Hala sportowa Alpha",
    city: "Warszawa",
    postal_code: "00-001",
    client_name: "Miasto Warszawa",
    project_match_keywords: "Alpha, hala",
  },
  {
    id: "p2",
    object_name: "Edeka Dresden",
    city: "Dresden",
    client_name: "EDEKA",
    project_match_keywords: "DE, Edeka",
  },
];

describe("plan-extract", () => {
  it("mapPlanJsonToInternal mapuje pola polskie", () => {
    const mapped = mapPlanJsonToInternal({
      tytul: "Rzut parteru",
      numer_arkusza: "A-01",
      rewizja: "Rev.2",
      skala: "1:100",
      typ_planu: "floor",
      miasto: "Warszawa",
      projekt_id: "p1",
      projekt_dopasowanie_pewnosc: 85,
      projekt_dopasowanie_uzasadnienie: "Miasto i nazwa obiektu zgodne.",
      pomieszczenia: [{ nazwa: "Sala", powierzchnia_m2: 120 }],
    });
    expect(mapped.title).toBe("Rzut parteru");
    expect(mapped.sheet_number).toBe("A-01");
    expect(mapped.plan_type).toBe("floor");
    expect(mapped.project_id).toBe("p1");
    expect(mapped.rooms[0]).toEqual({ name: "Sala", area_m2: 120 });
  });

  it("resolveClaudeProjectMatch akceptuje id przy pewności >= 50", () => {
    const mapped = mapPlanJsonToInternal({
      tytul: "Plan",
      projekt_id: "p1",
      projekt_dopasowanie_pewnosc: 80,
    });
    const resolved = resolveClaudeProjectMatch(mapped, projects);
    expect(resolved.project_id).toBe("p1");
    expect(resolved._projectMatchReason).toBe("claude");
  });

  it("resolveClaudeProjectMatch odrzuca niską pewność", () => {
    const mapped = mapPlanJsonToInternal({
      tytul: "Plan",
      projekt_id: "p1",
      projekt_dopasowanie_pewnosc: 30,
    });
    const resolved = resolveClaudeProjectMatch(mapped, projects);
    expect(resolved.project_id).toBe("");
    expect(resolved._projectMatchReason).toBeNull();
  });

  it("resolveClaudeProjectMatch odrzuca nieznane id", () => {
    const mapped = mapPlanJsonToInternal({
      tytul: "Plan",
      projekt_id: "unknown",
      projekt_dopasowanie_pewnosc: 90,
    });
    const resolved = resolveClaudeProjectMatch(mapped, projects);
    expect(resolved.project_id).toBe("");
  });

  it("planMappedHasUsableData wymaga sensownych pól", () => {
    expect(planMappedHasUsableData({ title: "Rzut" })).toBe(true);
    expect(planMappedHasUsableData({})).toBe(false);
  });

  it("buildProjectsContextForClaude zawiera id projektów", () => {
    const ctx = buildProjectsContextForClaude(projects);
    expect(ctx).toHaveLength(2);
    expect(ctx[0].id).toBe("p1");
    expect(ctx[0].nazwa_obiektu).toBe("Hala sportowa Alpha");
  });
});
