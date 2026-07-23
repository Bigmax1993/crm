import { describe, it, expect, beforeEach } from "vitest";
import { patchSiteExtension, getSiteExtension } from "@/lib/crm-local-store";
import { createLogisticsChecklistFromTemplate, logisticsChecklistProgress } from "@/lib/project-logistics-checklist";

describe("crm-local-store — logistics_checklist", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("zapisuje i odczytuje checklistę logistyki", () => {
    const checklist = createLogisticsChecklistFromTemplate();
    checklist.cement_load_date = "2026-07-22";
    checklist.sections[0].items[0].status = "done";
    checklist.sections[0].items[0].comment = "Viktor";
    patchSiteExtension("site_a", { logistics_checklist: checklist });

    const ext = getSiteExtension("site_a");
    expect(ext.logistics_checklist.cement_load_date).toBe("2026-07-22");
    expect(ext.logistics_checklist.sections[0].items[0].status).toBe("done");
    expect(ext.logistics_checklist.sections[0].items[0].comment).toBe("Viktor");
    expect(logisticsChecklistProgress(ext.logistics_checklist).label).toBe("1/15");
  });

  it("patch bez logistics_checklist nie kasuje poprzedniej", () => {
    const checklist = createLogisticsChecklistFromTemplate();
    patchSiteExtension("site_b", { logistics_checklist: checklist, offer_segment: "inne" });
    patchSiteExtension("site_b", { norms_note: "OK" });
    const ext = getSiteExtension("site_b");
    expect(ext.norms_note).toBe("OK");
    expect(ext.logistics_checklist?.sections?.length).toBe(4);
  });

  it("można wyzerować checklistę na null", () => {
    patchSiteExtension("site_c", { logistics_checklist: createLogisticsChecklistFromTemplate() });
    patchSiteExtension("site_c", { logistics_checklist: null });
    expect(getSiteExtension("site_c").logistics_checklist).toBeNull();
  });
});
