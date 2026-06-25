import { describe, it, expect, beforeEach } from "vitest";
import { buildBusinessNotifications, saveNotificationSettings } from "@/lib/business-notifications";

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
});
