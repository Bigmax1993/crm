/**
 * Kontrakt wejście/wyjście: ten sam zestaw faktur musi dawać stabilne KPI dla dashboardów.
 */
import { describe, it, expect } from "vitest";
import { monthlyCashFlowPaidPln, globalPLPln, sumReceivablesPln } from "@/lib/finance-pln";

const CONTRACT_INVOICES = [
  {
    invoice_type: "sales",
    status: "paid",
    paid_at: "2025-01-15",
    amount_pln_at_payment: 500,
    currency: "PLN",
    amount: 500,
  },
  {
    invoice_type: "cost",
    status: "paid",
    paid_at: "2025-01-15",
    amount_pln_at_payment: 200,
    currency: "PLN",
    amount: 200,
  },
  {
    invoice_type: "sales",
    status: "unpaid",
    amount_pln: 999,
    currency: "PLN",
    amount: 999,
  },
];

describe("kontrakt — cash flow / KPI (finance-pln)", () => {
  it("globalPLPln dla zestawu kontraktowego", () => {
    const g = globalPLPln(CONTRACT_INVOICES);
    expect(g).toMatchObject({ przychody: 500, koszty: 200, brutto: 300 });
  });

  it("sumReceivablesPln", () => {
    expect(sumReceivablesPln(CONTRACT_INVOICES)).toBe(999);
  });

  it("monthlyCashFlowPaidPln — miesiąc 2025-01", () => {
    const rows = monthlyCashFlowPaidPln(CONTRACT_INVOICES);
    const jan = rows.find((r) => r.month === "2025-01");
    expect(jan).toMatchObject({ wplywy: 500, wydatki: 200, saldoNarastajace: 300 });
  });
});
