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
  projectExpensesByPeriodPln,
  projectExpensesByPeriod,
  projectExpenseAmountForReporting,
  formatProjectExpensePeriodLabel,
  openPayableInvoices,
  formatInvoiceSourceAmount,
  formatPayablesTotalsByCurrency,
  payablesKpiDisplayLines,
  getInvoiceSourceAmount,
  currenciesInProjectMetrics,
  costByProjectInCurrency,
  projectProfitabilityInCurrency,
  plByProjectInCurrency,
  formatCurrencyAmount,
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

  it("openPayableInvoices zwraca tylko zakup niezapłacony, przeterminowane pierwsze", () => {
    const rows = openPayableInvoices([
      {
        invoice_type: "cost",
        status: "unpaid",
        payment_deadline: "2026-12-01",
        invoice_number: "A",
      },
      {
        invoice_type: "cost",
        status: "overdue",
        payment_deadline: "2026-01-01",
        invoice_number: "B",
      },
      {
        invoice_type: "sales",
        status: "unpaid",
        invoice_number: "C",
      },
      {
        invoice_type: "cost",
        status: "paid",
        invoice_number: "D",
      },
    ]);
    expect(rows.map((r) => r.invoice_number)).toEqual(["B", "A"]);
  });

  it("formatInvoiceSourceAmount pokazuje kwotę w walucie FV bez przeliczenia", () => {
    expect(
      formatInvoiceSourceAmount({
        amount: 1074.5,
        currency: "EUR",
        amount_pln: 4585.8,
      })
    ).toBe("1074,50 EUR");
    expect(formatPayablesTotalsByCurrency([
      { amount: 1074.5, currency: "EUR", invoice_type: "cost", status: "unpaid" },
      { amount: 100, currency: "PLN", invoice_type: "cost", status: "unpaid" },
    ])).toBe("1074,50 EUR · 100,00 PLN");
  });

  it("payablesKpiDisplayLines — EUR i PLN na KPI zobowiązań", () => {
    expect(payablesKpiDisplayLines([])).toEqual(["0,00 PLN"]);

    const onlyEur = [
      { amount: 1083.55, currency: "EUR", amount_pln: 4585.8, invoice_type: "cost", status: "unpaid" },
    ];
    expect(payablesKpiDisplayLines(onlyEur)).toEqual([
      "1083,55 EUR",
      "4585,80 PLN (szac. NBP)",
    ]);

    const onlyPln = [
      { amount: 500, currency: "PLN", amount_pln: 500, invoice_type: "cost", status: "unpaid" },
    ];
    expect(payablesKpiDisplayLines(onlyPln)).toEqual(["500,00 PLN"]);

    const mixed = [
      { amount: 1083.55, currency: "EUR", amount_pln: 4585.8, invoice_type: "cost", status: "unpaid" },
      { amount: 200, currency: "PLN", amount_pln: 200, invoice_type: "cost", status: "unpaid" },
    ];
    expect(payablesKpiDisplayLines(mixed)).toEqual([
      "1083,55 EUR · 200,00 PLN",
      "łącznie szac. 4785,80 PLN (NBP)",
    ]);
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

  it("projectExpensesByPeriodPln — miesiąc, kwartał, rok dla jednego projektu", () => {
    const invoices = [
      {
        project_id: "p1",
        invoice_type: "cost",
        issue_date: "2024-01-10",
        amount_pln: 100,
        currency: "PLN",
        amount: 100,
      },
      {
        project_id: "p1",
        invoice_type: "cost",
        issue_date: "2024-03-15",
        amount_pln: 200,
        currency: "PLN",
        amount: 200,
      },
      {
        project_id: "p2",
        invoice_type: "cost",
        issue_date: "2024-01-20",
        amount_pln: 999,
        currency: "PLN",
        amount: 999,
      },
      {
        project_id: "p1",
        invoice_type: "sales",
        issue_date: "2024-01-05",
        amount_pln: 5000,
        currency: "PLN",
        amount: 5000,
      },
    ];
    const monthly = projectExpensesByPeriodPln(invoices, "p1", "month");
    expect(monthly).toHaveLength(2);
    expect(monthly.find((r) => r.period === "2024-01")?.wydatki).toBe(100);
    expect(monthly.find((r) => r.period === "2024-03")?.wydatki).toBe(200);

    const quarterly = projectExpensesByPeriodPln(invoices, "p1", "quarter");
    expect(quarterly).toHaveLength(1);
    expect(quarterly.find((r) => r.period === "2024-Q1")?.wydatki).toBe(300);

    const yearly = projectExpensesByPeriodPln(invoices, "p1", "year");
    expect(yearly).toHaveLength(1);
    expect(yearly[0].wydatki).toBe(300);
  });

  it("projectExpensesByPeriod — EUR dla REWE/EDEKA bez amount_pln (jak wykres kołowy)", () => {
    const reweEmmerich = {
      id: "rewe-emmerich",
      object_name: "Rewe Emmerich",
      city: "Emmerich am Rhein",
      project_match_keywords: "DE, Rewe",
    };
    const edekaEmmerich = {
      id: "edeka-emmerich",
      object_name: "Edeka (Emmerich)",
      city: "Emmerich am Rhein",
      project_match_keywords: "DE, Edeka",
    };
    const invoices = [
      {
        project_id: "rewe-emmerich",
        invoice_type: "cost",
        currency: "EUR",
        amount: 7252.11,
        paid_at: "2024-06-15",
      },
      {
        project_id: "edeka-emmerich",
        invoice_type: "cost",
        currency: "EUR",
        amount: 999,
        issue_date: "2024-01-10",
      },
    ];
    const reweMonthly = projectExpensesByPeriod(invoices, "rewe-emmerich", "month", reweEmmerich);
    expect(reweMonthly).toHaveLength(1);
    expect(reweMonthly[0].wydatki).toBeCloseTo(7252.11, 2);
    expect(reweMonthly[0].currency).toBe("EUR");

    const edekaMonthly = projectExpensesByPeriod(invoices, "edeka-emmerich", "month", edekaEmmerich);
    expect(edekaMonthly).toHaveLength(1);
    expect(edekaMonthly[0].wydatki).toBe(999);

    expect(projectExpensesByPeriodPln(invoices, "rewe-emmerich", "month")).toHaveLength(0);
  });

  it("projectExpenseAmountForReporting preferuje EUR dla projektu DE", () => {
    const inv = { currency: "EUR", amount: 100, invoice_type: "cost" };
    expect(projectExpenseAmountForReporting(inv, "EUR")).toBe(100);
    expect(projectExpenseAmountForReporting(inv, "PLN")).toBeNull();
  });

  it("formatProjectExpensePeriodLabel", () => {
    expect(formatProjectExpensePeriodLabel("2024-03", "month")).toBe("03/2024");
    expect(formatProjectExpensePeriodLabel("2024-Q2", "quarter")).toBe("Q2 2024");
    expect(formatProjectExpensePeriodLabel("2025", "year")).toBe("2025");
  });

  it("costByProjectInCurrency — osobno PLN i EUR bez przeliczenia NBP", () => {
    const projects = [
      { id: "rewe", object_name: "Rewe" },
      { id: "aldi", object_name: "Aldi" },
    ];
    const invoices = [
      {
        project_id: "rewe",
        invoice_type: "cost",
        currency: "EUR",
        amount: 1000.5,
        amount_pln: 4300,
      },
      {
        project_id: "aldi",
        invoice_type: "cost",
        currency: "PLN",
        amount: 500,
        amount_pln: 500,
      },
      {
        project_id: "rewe",
        invoice_type: "cost",
        currency: "PLN",
        amount: 200,
        amount_pln: 200,
      },
    ];
    const eurCosts = costByProjectInCurrency(invoices, projects, "EUR");
    expect(eurCosts).toHaveLength(1);
    expect(eurCosts[0].koszt).toBe(1000.5);

    const plnCosts = costByProjectInCurrency(invoices, projects, "PLN");
    expect(plnCosts).toHaveLength(1);
    expect(plnCosts.find((x) => x.project.id === "aldi")?.koszt).toBe(500);
    expect(plnCosts.find((x) => x.project.id === "rewe")).toBeUndefined();
  });

  it("currenciesInProjectMetrics zwraca PLN i EUR osobno", () => {
    const invoices = [
      { project_id: "p1", invoice_type: "cost", currency: "EUR", amount: 10 },
      { project_id: "p2", invoice_type: "cost", currency: "PLN", amount: 20 },
    ];
    expect(currenciesInProjectMetrics(invoices)).toEqual(["PLN", "EUR"]);
  });

  it("currenciesInProjectMetrics uwzględnia przypisanie waluty projektu (REWE → EUR)", () => {
    const projects = [{ id: "rewe", object_name: "Rewe" }];
    expect(currenciesInProjectMetrics([], projects)).toEqual(["EUR"]);
  });

  it("projectProfitabilityInCurrency — tylko FV w danej walucie", () => {
    const projects = [{ id: "p1", object_name: "Rewe" }];
    const invoices = [
      {
        project_id: "p1",
        invoice_type: "sales",
        status: "paid",
        currency: "EUR",
        amount: 5000,
      },
      {
        project_id: "p1",
        invoice_type: "cost",
        currency: "EUR",
        amount: 1200,
      },
      {
        project_id: "p1",
        invoice_type: "cost",
        currency: "PLN",
        amount: 999,
        amount_pln: 999,
      },
    ];
    const [row] = projectProfitabilityInCurrency(invoices, projects, "EUR");
    expect(row.przychody).toBe(5000);
    expect(row.koszty).toBe(1200);
    expect(row.wynik).toBe(3800);

    const plnRows = projectProfitabilityInCurrency(invoices, projects, "PLN");
    expect(plnRows).toHaveLength(0);
  });

  it("formatCurrencyAmount", () => {
    expect(formatCurrencyAmount(1234.5, "EUR")).toMatch(/1[\s\u00a0]?234,50 EUR/);
  });
});
