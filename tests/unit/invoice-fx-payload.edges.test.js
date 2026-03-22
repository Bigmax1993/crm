import { describe, it, expect } from "vitest";
import { pickInvoiceApiPayload } from "@/lib/invoice-fx";

describe("pickInvoiceApiPayload — przypadki brzegowe", () => {
  it("pomija null (tylko undefined jest „brakiem” w API_KEYS)", () => {
    const out = pickInvoiceApiPayload({
      invoice_number: "A",
      amount: 10,
      contractor_name: null,
      notes: undefined,
    });
    expect(out).toEqual({ invoice_number: "A", amount: 10, contractor_name: null });
    expect("notes" in out).toBe(false);
  });

  it("przepuszcza pusty string dla dozwolonego klucza", () => {
    const out = pickInvoiceApiPayload({
      invoice_number: "",
      amount: 1,
      currency: "PLN",
      notes: "",
    });
    expect(out.invoice_number).toBe("");
    expect(out.notes).toBe("");
  });

  it("nie kopiuje dowolnych meta pól", () => {
    const out = pickInvoiceApiPayload({
      invoice_number: "X",
      amount: 1,
      currency: "PLN",
      _clientEstimatedPln: true,
      foo: "bar",
    });
    expect(out).toEqual({ invoice_number: "X", amount: 1, currency: "PLN" });
  });
});
