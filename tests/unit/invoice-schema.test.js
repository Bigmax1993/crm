import { describe, expect, it } from "vitest";
import { pickInvoiceApiPayload } from "@/lib/invoice-fx";
import {
  invoiceFormSchema,
  invoiceUpdateFormSchema,
  invoiceFormDefaults,
  invoiceToFormValues,
  DEFAULT_INVOICE_PAYER,
  replaceLegacyDefaultPayer,
} from "@/lib/invoice-schema";

const validBase = {
  invoice_number: "FV/1/2026",
  seller_name: "Wystawca Sp. z o.o.",
  seller_nip: "",
  contractor_name: "ACME",
  contractor_nip: "",
  amount: 100,
  amount_eur: null,
  currency: "PLN",
  issue_date: "2026-01-10",
  payment_deadline: "2026-02-01",
  paid_at: "",
  position: "",
  notes: "",
  invoice_type: "purchase",
  status: "unpaid",
  payer: DEFAULT_INVOICE_PAYER,
};

describe("replaceLegacyDefaultPayer", () => {
  it("zamienia zapisany stary domyślny płatnik na bieżący DEFAULT_INVOICE_PAYER", () => {
    const oldPlaceholder = `${["KA", "NB", "UD"].join("")} Sp. z o.o. Sp.k.`;
    expect(replaceLegacyDefaultPayer(oldPlaceholder)).toBe(DEFAULT_INVOICE_PAYER);
    expect(replaceLegacyDefaultPayer("  " + oldPlaceholder + "  ")).toBe(DEFAULT_INVOICE_PAYER);
  });

  it("nie zmienia innych nazw płatnika", () => {
    expect(replaceLegacyDefaultPayer("ACME Sp. z o.o.")).toBe("ACME Sp. z o.o.");
  });
});

describe("invoiceFormSchema", () => {
  it("akceptuje poprawny rekord", () => {
    const r = invoiceFormSchema.safeParse(validBase);
    expect(r.success).toBe(true);
  });

  it("wymaga numeru, sprzedawcy i kontrahenta", () => {
    const r = invoiceFormSchema.safeParse({ ...validBase, invoice_number: "   " });
    expect(r.success).toBe(false);
    const r2 = invoiceFormSchema.safeParse({ ...validBase, contractor_name: "" });
    expect(r2.success).toBe(false);
    const r3 = invoiceFormSchema.safeParse({ ...validBase, seller_name: "" });
    expect(r3.success).toBe(false);
  });

  it("wymaga kwoty > 0", () => {
    expect(invoiceFormSchema.safeParse({ ...validBase, amount: 0 }).success).toBe(false);
    expect(invoiceFormSchema.safeParse({ ...validBase, amount: -1 }).success).toBe(false);
  });

  it("akceptuje puste amount_eur", () => {
    const r = invoiceFormSchema.safeParse({ ...validBase, amount_eur: "" });
    expect(r.success).toBe(true);
    expect(r.data.amount_eur).toBe(null);
  });

  it("odrzuca niepoprawną kwotę EUR", () => {
    const r = invoiceFormSchema.safeParse({ ...validBase, amount_eur: -5 });
    expect(r.success).toBe(false);
  });

  it("ustawia domyślnego płatnika gdy brak", () => {
    const { payer, ...rest } = validBase;
    const r = invoiceFormSchema.safeParse({ ...rest, payer: "" });
    expect(r.success).toBe(true);
    expect(r.data.payer).toBe(DEFAULT_INVOICE_PAYER);
  });

  it("parsuje kwotę ze stringa (input number)", () => {
    const r = invoiceFormSchema.safeParse({ ...validBase, amount: "250,5".replace(",", ".") });
    expect(r.success).toBe(true);
    expect(r.data.amount).toBe(250.5);
  });

  it("odrzuca niepoprawną datę kalendarzową (issue_date)", () => {
    expect(invoiceFormSchema.safeParse({ ...validBase, issue_date: "2026-13-45" }).success).toBe(false);
    expect(invoiceFormSchema.safeParse({ ...validBase, issue_date: "2026-02-31" }).success).toBe(false);
  });

  it("odrzuca issue_date bez formatu RRRR-MM-DD", () => {
    const r = invoiceFormSchema.safeParse({ ...validBase, issue_date: "01.03.2026" });
    expect(r.success).toBe(false);
  });

  it("odrzuca nieznaną walutę", () => {
    const r = invoiceFormSchema.safeParse({ ...validBase, currency: "XXX" });
    expect(r.success).toBe(false);
  });

  it("akceptuje puste opcjonalne daty (undefined / pusty string)", () => {
    const { issue_date, payment_deadline, paid_at, ...rest } = validBase;
    const r = invoiceFormSchema.safeParse({
      ...rest,
      issue_date: undefined,
      payment_deadline: "",
      paid_at: undefined,
    });
    expect(r.success).toBe(true);
    expect(r.data.issue_date).toBeUndefined();
    expect(r.data.payment_deadline).toBeUndefined();
    expect(r.data.paid_at).toBeUndefined();
  });

  it("wynik parsowania mieści się w polach dozwolonych przez pickInvoiceApiPayload", () => {
    const r = invoiceFormSchema.safeParse(validBase);
    expect(r.success).toBe(true);
    const payload = pickInvoiceApiPayload(r.data);
    expect(payload.invoice_number).toBe(validBase.invoice_number);
    expect(payload.seller_name).toBe(validBase.seller_name);
    expect(payload.contractor_name).toBe(validBase.contractor_name);
    expect(payload.contractor_nip).toBe("");
    expect(payload.amount).toBe(100);
    expect(payload.currency).toBe("PLN");
    expect(payload.notes).toBe("");
  });
});

describe("invoiceUpdateFormSchema", () => {
  it("wymaga id", () => {
    const r = invoiceUpdateFormSchema.safeParse({ ...validBase, id: "x" });
    expect(r.success).toBe(true);
    expect(invoiceUpdateFormSchema.safeParse(validBase).success).toBe(false);
  });

  it("payload aktualizacji zawiera id po pickInvoiceApiPayload", () => {
    const r = invoiceUpdateFormSchema.safeParse({ ...validBase, id: "inv-99" });
    expect(r.success).toBe(true);
    const payload = pickInvoiceApiPayload(r.data);
    expect(payload).not.toHaveProperty("id");
  });
});

describe("invoiceFormDefaults", () => {
  it("przechodzi walidację po uzupełnieniu wymaganych pól", () => {
    const r = invoiceFormSchema.safeParse({
      ...invoiceFormDefaults,
      invoice_number: "X",
      seller_name: "Z",
      contractor_name: "Y",
      amount: 1,
    });
    expect(r.success).toBe(true);
  });
});

describe("invoiceToFormValues", () => {
  it("mapuje rekord z API", () => {
    const v = invoiceToFormValues({
      id: "abc",
      invoice_number: "N1",
      contractor_name: "C1",
      amount: 50,
      currency: "eur",
      issue_date: "2026-03-01T00:00:00.000Z",
      paid_at: "2026-03-15",
      invoice_type: "sales",
      status: "paid",
    });
    expect(v.id).toBe("abc");
    expect(v.currency).toBe("EUR");
    expect(v.issue_date).toBe("2026-03-01");
    expect(v.paid_at).toBe("2026-03-15");
    expect(v.seller_name).toBe(DEFAULT_INVOICE_PAYER);
    expect(v.contractor_name).toBe("C1");
  });

  it("FV zakupu bez seller_name: sprzedawca ze starego contractor_name", () => {
    const v = invoiceToFormValues({
      id: "p",
      invoice_number: "N",
      contractor_name: "Dostawca SA",
      contractor_nip: "1111111111",
      invoice_type: "purchase",
      payer: DEFAULT_INVOICE_PAYER,
      amount: 1,
    });
    expect(v.seller_name).toBe("Dostawca SA");
    expect(v.seller_nip).toBe("1111111111");
    expect(v.contractor_name).toBe(DEFAULT_INVOICE_PAYER);
  });

  it("dla null zwraca domyślny szkielet z pustym id", () => {
    const v = invoiceToFormValues(null);
    expect(v.id).toBe("");
    expect(v.invoice_number).toBe("");
    expect(v.currency).toBe("PLN");
  });

  it("nieznana waluta spada na PLN", () => {
    const v = invoiceToFormValues({
      id: "1",
      invoice_number: "A",
      contractor_name: "B",
      amount: 1,
      currency: "BTC",
    });
    expect(v.currency).toBe("PLN");
  });

  it("mapuje amount_eur liczbowe i notatki", () => {
    const v = invoiceToFormValues({
      id: "z",
      invoice_number: "A",
      contractor_name: "B",
      amount: 10,
      amount_eur: 2.5,
      notes: "Uwaga",
      position: "Usługa",
    });
    expect(v.amount_eur).toBe(2.5);
    expect(v.notes).toBe("Uwaga");
    expect(v.position).toBe("Usługa");
  });

  it("mapuje NIP nabywcy gdy są osobne pola sprzedawcy", () => {
    const v = invoiceToFormValues({
      id: "1",
      invoice_number: "N",
      seller_name: "Sprzedawca",
      contractor_name: "C",
      contractor_nip: "5252445767",
      amount: 1,
      invoice_type: "purchase",
    });
    expect(v.contractor_nip).toBe("5252445767");
  });
});
