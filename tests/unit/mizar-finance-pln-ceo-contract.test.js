import { describe, it, expect } from "vitest";
import {
  sumReceivablesPln,
  sumPayablesPln,
  globalPLPln,
  monthlyCashFlowPaidPln,
  monthlyRevenueVsCostPln,
  projectProfitabilityPln,
  budgetAlertsPln,
} from "@/lib/mizar-finance-pln";

/**
 * Stały zestaw danych — „kontrakt” dla dashboardów (CEO / eksport):
 * te wartości dokumentują spójność KPI, cash flow i rentowności projektu.
 */
const CEO_FIXTURE_INVOICES = [
  {
    invoice_type: "sales",
    status: "unpaid",
    amount_pln: 3000,
    currency: "PLN",
    amount: 3000,
  },
  {
    invoice_type: "sales",
    status: "paid",
    project_id: "p1",
    paid_at: "2024-06-10",
    amount_pln: 1000,
    amount_pln_at_payment: 950,
    currency: "PLN",
    amount: 1000,
    issue_date: "2024-05-01",
  },
  {
    invoice_type: "cost",
    status: "unpaid",
    amount_pln: 500,
    currency: "PLN",
    amount: 500,
  },
  {
    invoice_type: "cost",
    status: "paid",
    project_id: "p1",
    paid_at: "2024-06-20",
    amount_pln: 2000,
    amount_pln_at_payment: 2000,
    currency: "PLN",
    amount: 2000,
    issue_date: "2024-05-15",
  },
];

const CEO_FIXTURE_PROJECTS = [{ id: "p1", object_name: "Arena test", budget_planned: 10000 }];

describe("mizar-finance-pln — kontrakt CEO / dashboard", () => {
  it("KPI: należności, zobowiązania, wynik netto (FV zapłacone)", () => {
    expect(sumReceivablesPln(CEO_FIXTURE_INVOICES)).toBe(3000);
    expect(sumPayablesPln(CEO_FIXTURE_INVOICES)).toBe(500);
    const { przychody, koszty, brutto } = globalPLPln(CEO_FIXTURE_INVOICES);
    expect(przychody).toBe(950);
    expect(koszty).toBe(2000);
    expect(brutto).toBe(-1050);
  });

  it("cash flow miesięczny — czerwiec 2024", () => {
    const rows = monthlyCashFlowPaidPln(CEO_FIXTURE_INVOICES);
    const june = rows.find((r) => r.month === "2024-06");
    expect(june).toBeDefined();
    expect(june.wplywy).toBe(950);
    expect(june.wydatki).toBe(2000);
    expect(june.saldoNarastajace).toBe(-1050);
  });

  it("przychody vs koszty po dacie wystawienia", () => {
    const rows = monthlyRevenueVsCostPln(CEO_FIXTURE_INVOICES);
    const may = rows.find((r) => r.month === "2024-05");
    expect(may.przychody).toBe(1000);
    expect(may.koszty).toBe(2000);
  });

  it("rentowność projektu p1", () => {
    const [row] = projectProfitabilityPln(CEO_FIXTURE_INVOICES, CEO_FIXTURE_PROJECTS);
    expect(row.project.id).toBe("p1");
    expect(row.przychody).toBe(950);
    expect(row.koszty).toBe(2000);
    expect(row.wynik).toBe(-1050);
    expect(row.marza).toBeCloseTo((-1050 / 950) * 100, 5);
  });

  it("alert budżetu — koszt 2000 / budżet 10000 = 20%", () => {
    const alerts = budgetAlertsPln(CEO_FIXTURE_PROJECTS, CEO_FIXTURE_INVOICES, 0.8);
    expect(alerts).toHaveLength(0);
  });
});
