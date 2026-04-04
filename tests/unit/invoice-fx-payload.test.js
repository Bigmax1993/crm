import { describe, it, expect } from "vitest";
import { pickInvoiceApiPayload } from "@/lib/invoice-fx";
import { DEFAULT_INVOICE_PAYER } from "@/lib/invoice-schema";

describe("pickInvoiceApiPayload (jednostkowe)", () => {
  it("zostawia tylko dozwolone pola API", () => {
    const raw = {
      invoice_number: "FV/1",
      amount: 100,
      currency: "EUR",
      amount_pln: 420,
      nbp_mid_issue: 4.2,
      nbp_table_date_issue: "2024-01-02",
      paid_at: "2024-02-01",
      amount_pln_at_payment: 435,
      nbp_mid_paid: 4.35,
      nbp_table_date_paid: "2024-02-01",
      fx_difference_pln: 15,
      _importRow: 7,
      internalNote: "skip",
    };
    const out = pickInvoiceApiPayload(raw);
    expect(out).toEqual({
      invoice_number: "FV/1",
      amount: 100,
      currency: "EUR",
      amount_pln: 420,
      nbp_mid_issue: 4.2,
      nbp_table_date_issue: "2024-01-02",
      paid_at: "2024-02-01",
      amount_pln_at_payment: 435,
      nbp_mid_paid: 4.35,
      nbp_table_date_paid: "2024-02-01",
      fx_difference_pln: 15,
    });
    expect(out._importRow).toBeUndefined();
    expect(out.internalNote).toBeUndefined();
  });

  it("pomija undefined", () => {
    const out = pickInvoiceApiPayload({ invoice_number: "X", amount: 1 });
    expect(Object.keys(out).sort()).toEqual(["amount", "invoice_number"].sort());
  });

  it("zamienia zapisany stary domyślny płatnik w polu payer", () => {
    const oldPlaceholder = `${["KA", "NB", "UD"].join("")} Sp. z o.o. Sp.k.`;
    const out = pickInvoiceApiPayload({
      invoice_number: "FV/9",
      amount: 1,
      currency: "PLN",
      payer: oldPlaceholder,
    });
    expect(out.payer).toBe(DEFAULT_INVOICE_PAYER);
  });

  it("przepuszcza seller_name, contractor_name, notes i amount_eur", () => {
    const out = pickInvoiceApiPayload({
      invoice_number: "FV/2",
      seller_name: "Sprzedawca SA",
      seller_nip: "5252445767",
      contractor_name: "Firma SA",
      amount: 200,
      amount_eur: 44.5,
      notes: "Do zapłaty przelewem",
      currency: "PLN",
    });
    expect(out).toMatchObject({
      invoice_number: "FV/2",
      seller_name: "Sprzedawca SA",
      seller_nip: "5252445767",
      contractor_name: "Firma SA",
      amount: 200,
      amount_eur: 44.5,
      notes: "Do zapłaty przelewem",
      currency: "PLN",
    });
  });
});
