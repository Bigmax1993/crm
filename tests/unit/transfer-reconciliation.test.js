import { describe, it, expect } from "vitest";
import {
  invoiceNumbersMatch,
  amountsMatch,
  transferMatchesInvoice,
  suggestPayableReconciliation,
} from "@/lib/transfer-reconciliation";

describe("transfer-reconciliation", () => {
  it("invoiceNumbersMatch — toleruje spacje i wielkość liter", () => {
    expect(invoiceNumbersMatch("RG 2026/27052", "rg202627052")).toBe(true);
  });

  it("transferMatchesInvoice — numer i kwota EUR", () => {
    const inv = {
      invoice_number: "RG202627052",
      amount: 1083.55,
      currency: "EUR",
      seller_name: "Concept-B GmbH",
    };
    const tr = {
      invoice_number: "RG202627052",
      amount: 1083.55,
      currency: "EUR",
      contractor_name: "Concept-B",
    };
    const r = transferMatchesInvoice(tr, inv);
    expect(r.match).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(35);
  });

  it("suggestPayableReconciliation — zwraca sugestię dla otwartej FV", () => {
    const payables = [
      { id: "i1", invoice_number: "FV/1", amount: 100, currency: "PLN", status: "unpaid", invoice_type: "cost" },
    ];
    const transfers = [{ id: "t1", invoice_number: "FV/1", amount: 100, currency: "PLN" }];
    const s = suggestPayableReconciliation(payables, transfers);
    expect(s).toHaveLength(1);
    expect(s[0].invoice.id).toBe("i1");
  });
});
