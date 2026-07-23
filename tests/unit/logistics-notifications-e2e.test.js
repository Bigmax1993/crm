import { describe, it, expect } from "vitest";
import {
  createLogisticsChecklistFromTemplate,
  projectsWithOpenLogistics,
  listOpenLogisticsItems,
} from "@/lib/project-logistics-checklist";
import { buildBusinessNotifications, saveNotificationSettings } from "@/lib/business-notifications";

describe("logistyka — powiadomienia end-to-end (unit)", () => {
  it("projekty z otwartymi pozycjami generują alerty i listę CEO", () => {
    saveNotificationSettings({ wlaczone: true, dni_przed_terminem: 3, prog_budzetu_pct: 80 });
    const checklist = createLogisticsChecklistFromTemplate();
    checklist.sections.find((s) => s.id === "tiles").items[0].comment = "zamówione";

    const projects = [{ id: "p1", object_name: "Netto", city: "Angelbachtal", status: "aktywny" }];
    const siteExtensions = [{ site_id: "p1", logistics_checklist: checklist }];

    const openRows = projectsWithOpenLogistics({ projects, siteExtensions });
    expect(openRows).toHaveLength(1);
    expect(listOpenLogisticsItems(checklist).some((i) => i.id === "tiles_order")).toBe(true);

    const notes = buildBusinessNotifications({
      invoices: [],
      projects,
      refundClaims: [],
      siteExtensions,
    });
    const logistics = notes.find((n) => n.id === "logistics-p1");
    expect(logistics).toBeTruthy();
    expect(logistics.body).toMatch(/15 do załatwienia/);
    expect(logistics.href).toContain("Construction?site=p1");
  });

  it("gdy wszystko done/N/D — brak alertu logistyki", () => {
    saveNotificationSettings({ wlaczone: true, dni_przed_terminem: 3, prog_budzetu_pct: 80 });
    const checklist = createLogisticsChecklistFromTemplate();
    for (const sec of checklist.sections) {
      for (const item of sec.items) item.status = "done";
    }
    const notes = buildBusinessNotifications({
      invoices: [],
      projects: [{ id: "p1", object_name: "X", status: "aktywny" }],
      refundClaims: [],
      siteExtensions: [{ site_id: "p1", logistics_checklist: checklist }],
    });
    expect(notes.some((n) => String(n.id).startsWith("logistics-"))).toBe(false);
  });
});
