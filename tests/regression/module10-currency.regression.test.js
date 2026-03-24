/**
 * Regresja modułu 10 (wielowalutowość, NBP, różnice kursowe).
 * Te scenariusze dokumentują oczekiwane zachowanie biznesowe — przy zmianie logiki
 * świadomie zaktualizuj wartości lub uzasadnij zmianę produktową.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const nbpMocks = vi.hoisted(() => ({
  resolveMidForCurrencyOnDate: vi.fn(),
  getNbpTableAForBusinessDay: vi.fn(),
}));

vi.mock("@/lib/nbp-rates", () => ({
  resolveMidForCurrencyOnDate: nbpMocks.resolveMidForCurrencyOnDate,
  getNbpTableAForBusinessDay: nbpMocks.getNbpTableAForBusinessDay,
  getMidFromTable(table, code) {
    if (!table?.rates || !code) return null;
    const c = String(code).toUpperCase();
    if (c === "PLN") return 1;
    const v = table.rates[c];
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  },
}));

import { computePaidPlnSnapshot, computeIssuePlnSnapshot } from "@/lib/invoice-fx";
import { getInvoicePlnForCashflow, foreignExposureRatio } from "@/lib/finance-pln";

describe("regresja — moduł 10 waluty", () => {
  beforeEach(() => {
    nbpMocks.resolveMidForCurrencyOnDate.mockReset();
    nbpMocks.getNbpTableAForBusinessDay.mockReset();
  });

  it("REG-01: przykład z spec — 1000 EUR @ 4.20 → 4200 PLN wystawienie", async () => {
    nbpMocks.resolveMidForCurrencyOnDate.mockResolvedValue({
      mid: 4.2,
      effectiveDate: "2024-01-15",
      table: {},
    });
    const s = await computeIssuePlnSnapshot({
      amount: 1000,
      currency: "EUR",
      issue_date: "2024-01-15",
    });
    expect(s.amount_pln).toBe(4200);
    expect(s.nbp_mid_issue).toBe(4.2);
  });

  it("REG-02: zapłata 1000 EUR @ 4.35 → różnica +150 PLN vs wystawienie 4200", async () => {
    nbpMocks.getNbpTableAForBusinessDay.mockResolvedValue({
      effectiveDate: "2024-02-20",
      rates: { PLN: 1, EUR: 4.35 },
    });
    const s = await computePaidPlnSnapshot({
      status: "paid",
      amount: 1000,
      currency: "EUR",
      amount_pln: 4200,
      nbp_mid_issue: 4.2,
      paid_at: "2024-02-20",
    });
    expect(s.amount_pln_at_payment).toBe(4350);
    expect(s.fx_difference_pln).toBe(150);
  });

  it("REG-03: cash flow używa kwoty po kursie płatności gdy jest zapisana", () => {
    const plnCf = getInvoicePlnForCashflow({
      status: "paid",
      invoice_type: "sales",
      currency: "EUR",
      amount: 500,
      amount_pln: 2100,
      amount_pln_at_payment: 2180,
      paid_at: "2024-06-01",
    });
    expect(plnCf).toBe(2180);
  });

  it("REG-04: alert ryzyka walutowego — próg 20% faktur obcych", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      currency: i < 3 ? "PLN" : "EUR",
    }));
    expect(foreignExposureRatio(many)).toBe(0.7);
    const safe = Array.from({ length: 10 }, () => ({ currency: "PLN" }));
    expect(foreignExposureRatio(safe)).toBe(0);
  });
});
