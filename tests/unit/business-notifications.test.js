import { describe, it, expect, beforeEach } from "vitest";
import { buildBusinessNotifications, saveNotificationSettings } from "@/lib/business-notifications";
import { createLogisticsChecklistFromTemplate } from "@/lib/project-logistics-checklist";

describe("business-notifications", () => {
  beforeEach(() => {
    saveNotificationSettings({ wlaczone: true, dni_przed_terminem: 3, prog_budzetu_pct: 80 });
  });

  it("alertuje o FV po terminie", () => {
    const items = buildBusinessNotifications({
      invoices: [
        {
          invoice_type: "cost",
          status: "overdue",
          invoice_number: "FV/99",
          payment_deadline: "2020-01-01",
        },
      ],
      projects: [],
      refundClaims: [],
    });
    expect(items.some((i) => i.title === "Faktura po terminie")).toBe(true);
  });

  it("wyłączone powiadomienia — pusta lista", () => {
    const items = buildBusinessNotifications({
      invoices: [{ invoice_type: "cost", status: "overdue", payment_deadline: "2020-01-01" }],
      projects: [],
      refundClaims: [],
      settings: { wlaczone: false, dni_przed_terminem: 3, prog_budzetu_pct: 80 },
    });
    expect(items).toHaveLength(0);
  });

  it("alertuje o otwartej logistyce projektu", () => {
    const checklist = createLogisticsChecklistFromTemplate();
    checklist.sections[0].items[0].status = "done";
    const items = buildBusinessNotifications({
      invoices: [],
      projects: [{ id: "p1", object_name: "REWE Dresden", city: "Dresden", status: "aktywny" }],
      refundClaims: [],
      siteExtensions: [{ site_id: "p1", logistics_checklist: checklist }],
    });
    const logistics = items.find((i) => i.id === "logistics-p1");
    expect(logistics).toBeTruthy();
    expect(logistics.title).toContain("REWE Dresden");
    expect(logistics.body).toMatch(/14 do załatwienia/);
    expect(logistics.href).toBe("/ProjectsMap");
  });
});
