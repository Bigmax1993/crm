import { describe, it, expect } from "vitest";
import {
  getInvoicePlnAtIssue,
  getInvoicePlnForCashflow,
  sumReceivablesPln,
  sumPayablesPln,
  monthlyCashFlowPaidPln,
  monthlyRevenueVsCostPln,
  globalPLPln,
  plByProjectPln,
  quarterlyYoYTrendPln,
  foreignExposureRatio,
  budgetAlertsPln,
  isUnpaidStatus,
} from "@/lib/finance-pln";

describe("finance-pln (jednostkowe)", () => {
  it("getInvoicePlnAtIssue używa amount_pln gdy jest liczbą", () => {
    expect(
      getInvoicePlnAtIssue({
        amount: 100,
        currency: "EUR",
        amount_pln: 430,
      })
    ).toBe(430);
  });

  it("getInvoicePlnAtIssue dla PLN bierze amount", () => {
    expect(
      getInvoicePlnAtIssue({
        amount: 2500,
        currency: "PLN",
      })
    ).toBe(2500);
  });

  it("getInvoicePlnAtIssue dla obcej waluty bez amount_pln zwraca null", () => {
    expect(
      getInvoicePlnAtIssue({
        amount: 100,
        currency: "USD",
      })
    ).toBeNull();
  });

  it("getInvoicePlnForCashflow dla opłaconej faktury preferuje amount_pln_at_payment", () => {
    expect(
      getInvoicePlnForCashflow({
        status: "paid",
        amount_pln_at_payment: 4350,
        amount_pln: 4200,
        amount: 1000,
        currency: "EUR",
        invoice_type: "sales",
        paid_at: "2024-02-15",
      })
    ).toBe(4350);
  });

  it("getInvoicePlnForCashflow dla nieopłaconej zwraca 0", () => {
    expect(
      getInvoicePlnForCashflow({
        status: "unpaid",
        amount_pln: 100,
        invoice_type: "sales",
      })
    ).toBe(0);
  });

  it("sumReceivablesPln sumuje tylko sprzedaż niezapłaconą po PLN wystawienia", () => {
    const invoices = [
      {
        invoice_type: "sales",
        status: "unpaid",
        amount_pln: 1000,
        currency: "PLN",
        amount: 1000,
      },
      {
        invoice_type: "sales",
        status: "paid",
        amount_pln: 500,
        currency: "PLN",
        amount: 500,
      },
      {
        invoice_type: "purchase",
        status: "unpaid",
        amount_pln: 999,
        currency: "PLN",
        amount: 999,
      },
    ];
    expect(sumReceivablesPln(invoices)).toBe(1000);
  });

  it("sumPayablesPln sumuje koszty niezapłacone", () => {
    const invoices = [
      {
        invoice_type: "cost",
        status: "overdue",
        amount_pln: 200,
        currency: "PLN",
        amount: 200,
      },
      {
        invoice_type: "sales",
        status: "unpaid",
        amount_pln: 10000,
        currency: "PLN",
        amount: 10000,
      },
    ];
    expect(sumPayablesPln(invoices)).toBe(200);
  });

  it("monthlyCashFlowPaidPln grupuje wpływy i wydatki po miesiącu płatności", () => {
    const invoices = [
      {
        invoice_type: "sales",
        status: "paid",
        paid_at: "2024-03-10",
        amount_pln_at_payment: 1000,
        currency: "PLN",
        amount: 1000,
      },
      {
        invoice_type: "cost",
        status: "paid",
        paid_at: "2024-03-20",
        amount_pln_at_payment: 400,
        currency: "PLN",
        amount: 400,
      },
    ];
    const rows = monthlyCashFlowPaidPln(invoices);
    expect(rows).toHaveLength(1);
    expect(rows[0].month).toBe("2024-03");
    expect(rows[0].wplywy).toBe(1000);
    expect(rows[0].wydatki).toBe(400);
    expect(rows[0].saldoNarastajace).toBe(600);
  });

  it("monthlyRevenueVsCostPln używa daty wystawienia i kwoty wystawienia PLN", () => {
    const invoices = [
      {
        invoice_type: "sales",
        status: "unpaid",
        issue_date: "2024-01-15",
        amount_pln: 800,
        currency: "EUR",
        amount: 200,
      },
      {
        invoice_type: "cost",
        status: "paid",
        issue_date: "2024-01-20",
        amount_pln: 300,
        currency: "PLN",
        amount: 300,
      },
    ];
    const rows = monthlyRevenueVsCostPln(invoices);
    const jan = rows.find((r) => r.month === "2024-01");
    expect(jan.przychody).toBe(800);
    expect(jan.koszty).toBe(300);
  });

  it("globalPLPln liczy tylko opłacone z cashflow PLN", () => {
    const r = globalPLPln([
      {
        invoice_type: "sales",
        status: "paid",
        amount_pln_at_payment: 1000,
        paid_at: "2024-01-01",
        currency: "PLN",
        amount: 1000,
      },
      {
        invoice_type: "cost",
        status: "paid",
        amount_pln_at_payment: 200,
        paid_at: "2024-01-02",
        currency: "PLN",
        amount: 200,
      },
      {
        invoice_type: "sales",
        status: "unpaid",
        amount_pln: 5000,
        currency: "PLN",
        amount: 5000,
      },
    ]);
    expect(r.przychody).toBe(1000);
    expect(r.koszty).toBe(200);
    expect(r.brutto).toBe(800);
  });

  it("foreignExposureRatio — udział faktur w walucie obcej", () => {
    expect(
      foreignExposureRatio([
        { currency: "PLN" },
        { currency: "EUR" },
        { currency: "USD" },
      ])
    ).toBeCloseTo(2 / 3, 5);
  });

  it("budgetAlertsPln ostrzega gdy koszt >= próg budżetu", () => {
    const projects = [{ id: "p1", budget_planned: 1000, object_name: "A" }];
    const invoices = [
      {
        project_id: "p1",
        invoice_type: "cost",
        status: "paid",
        amount_pln: 850,
        currency: "PLN",
        amount: 850,
      },
    ];
    const alerts = budgetAlertsPln(projects, invoices, 0.8);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].ratio).toBeCloseTo(0.85, 5);
  });

  it("isUnpaidStatus", () => {
    expect(isUnpaidStatus("unpaid")).toBe(true);
    expect(isUnpaidStatus("overdue")).toBe(true);
    expect(isUnpaidStatus("paid")).toBe(false);
  });

  it("plByProjectPln — tylko opłacone FV z project_id", () => {
    const projects = [{ id: "p1", object_name: "A" }];
    const invoices = [
      {
        project_id: "p1",
        invoice_type: "sales",
        status: "paid",
        amount_pln: 400,
        currency: "PLN",
        amount: 400,
      },
      {
        project_id: "p1",
        invoice_type: "purchase",
        status: "paid",
        amount_pln: 100,
        currency: "PLN",
        amount: 100,
      },
      {
        project_id: "p1",
        invoice_type: "sales",
        status: "unpaid",
        amount_pln: 999,
        currency: "PLN",
        amount: 999,
      },
    ];
    const [row] = plByProjectPln(invoices, projects);
    expect(row.przychody).toBe(400);
    expect(row.koszty).toBe(100);
    expect(row.brutto).toBe(300);
  });

  it("quarterlyYoYTrendPln — kwartał wg daty płatności", () => {
    const invoices = [
      {
        invoice_type: "sales",
        status: "paid",
        paid_at: "2024-02-01",
        amount_pln_at_payment: 100,
        currency: "PLN",
        amount: 100,
      },
    ];
    const rows = quarterlyYoYTrendPln(invoices);
    expect(rows.some((r) => r.key === "2024-Q1" && r.przychody === 100)).toBe(true);
  });
});
