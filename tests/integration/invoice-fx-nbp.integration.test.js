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

import {
  computeIssuePlnSnapshot,
  computePaidPlnSnapshot,
  enrichInvoiceForSave,
} from "@/lib/invoice-fx";

describe("invoice-fx × nbp (integracyjne)", () => {
  beforeEach(() => {
    nbpMocks.resolveMidForCurrencyOnDate.mockReset();
    nbpMocks.getNbpTableAForBusinessDay.mockReset();
  });

  it("computeIssuePlnSnapshot — EUR z historycznym mid z NBP", async () => {
    nbpMocks.resolveMidForCurrencyOnDate.mockResolvedValue({
      mid: 4.2,
      effectiveDate: "2024-01-02",
      table: { rates: { EUR: 4.2 } },
    });
    const snap = await computeIssuePlnSnapshot({
      amount: 1000,
      currency: "eur",
      issue_date: "2024-01-02",
    });
    expect(snap.amount_pln).toBeCloseTo(4200, 5);
    expect(snap.nbp_mid_issue).toBe(4.2);
    expect(snap.nbp_table_date_issue).toBe("2024-01-02");
  });

  it("computeIssuePlnSnapshot — PLN bez wywołania NBP", async () => {
    const snap = await computeIssuePlnSnapshot({
      amount: 500,
      currency: "PLN",
      issue_date: "2024-05-01",
    });
    expect(snap.amount_pln).toBe(500);
    expect(snap.nbp_mid_issue).toBe(1);
    expect(nbpMocks.resolveMidForCurrencyOnDate).not.toHaveBeenCalled();
  });

  it("computePaidPlnSnapshot — różnica kursowa EUR", async () => {
    nbpMocks.getNbpTableAForBusinessDay.mockResolvedValue({
      effectiveDate: "2024-02-01",
      rates: { PLN: 1, EUR: 4.35 },
    });
    const snap = await computePaidPlnSnapshot({
      status: "paid",
      amount: 1000,
      currency: "EUR",
      amount_pln: 4200,
      nbp_mid_issue: 4.2,
      paid_at: "2024-02-01",
    });
    expect(snap.amount_pln_at_payment).toBeCloseTo(4350, 5);
    expect(snap.fx_difference_pln).toBeCloseTo(150, 5);
    expect(snap.nbp_mid_paid).toBe(4.35);
  });

  it("enrichInvoiceForSave scala wystawienie i opcjonalnie płatność", async () => {
    nbpMocks.resolveMidForCurrencyOnDate.mockResolvedValue({
      mid: 4,
      effectiveDate: "2024-03-01",
      table: {},
    });
    nbpMocks.getNbpTableAForBusinessDay.mockResolvedValue({
      effectiveDate: "2024-03-10",
      rates: { PLN: 1, EUR: 4.1 },
    });
    const out = await enrichInvoiceForSave(
      {
        invoice_number: "1",
        amount: 100,
        currency: "EUR",
        issue_date: "2024-03-01",
        status: "paid",
        paid_at: "2024-03-10",
      },
      { recomputePaid: true }
    );
    expect(out.amount_pln).toBeCloseTo(400, 5);
    expect(out.amount_pln_at_payment).toBeCloseTo(410, 5);
    expect(out.fx_difference_pln).toBeCloseTo(10, 5);
  });
});
