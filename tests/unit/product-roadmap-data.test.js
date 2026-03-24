import { describe, it, expect } from "vitest";
import { ROADMAP_PHASES, ROADMAP_INTRO, PRIORITY_LABELS } from "@/lib/product-roadmap-data";

describe("product-roadmap-data", () => {
  it("ma wprowadzenie i co najmniej jedną fazę z pozycjami", () => {
    expect(ROADMAP_INTRO.title.length).toBeGreaterThan(0);
    expect(ROADMAP_INTRO.subtitle?.length ?? 0).toBeGreaterThan(0);
    expect(ROADMAP_PHASES.length).toBeGreaterThan(0);
    for (const phase of ROADMAP_PHASES) {
      expect(phase.id).toBeTruthy();
      expect(phase.title).toBeTruthy();
      expect(phase.summary).toBeTruthy();
      expect(phase.items?.length).toBeGreaterThan(0);
      for (const item of phase.items) {
        expect(item.title).toBeTruthy();
        expect(item.detail).toBeTruthy();
        expect(item.priority).toBeDefined();
        expect(PRIORITY_LABELS[item.priority], `priority: ${item.priority} — ${item.title}`).toBeDefined();
      }
    }
  });

  it("identyfikatory faz są unikalne", () => {
    const ids = ROADMAP_PHASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("zawiera kluczowe obszary (regresja id faz)", () => {
    const idSet = new Set(ROADMAP_PHASES.map((p) => p.id));
    expect(idSet.has("quick-wins")).toBe(true);
    expect(idSet.has("governance-budget-i18n")).toBe(true);
    expect(idSet.has("compliance-archive-tax")).toBe(true);
    expect(idSet.has("scoring-holding-cf")).toBe(true);
    expect(idSet.has("construction-ops")).toBe(true);
    expect(idSet.has("platform-products")).toBe(true);
    expect(idSet.has("analytics-snapshots-segments")).toBe(true);
    expect(idSet.has("mobile-presentation")).toBe(true);
  });
});
