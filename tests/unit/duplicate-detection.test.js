import { describe, expect, it } from "vitest";
import {
  findDuplicateInvoice,
  findInvoiceNumberConflict,
  invoiceNumberMatches,
  normalizeInvoiceNumberKey,
  transferFingerprint,
} from "@/lib/duplicate-detection";

describe("duplicate-detection", () => {
  it("normalizeInvoiceNumberKey usuwa spacje i ujednolica wielkość liter", () => {
    expect(normalizeInvoiceNumberKey("FV 123 / 2024")).toBe("fv123/2024");
  });

  it("invoiceNumberMatches — ten sam numer po normalizacji", () => {
    expect(invoiceNumberMatches("FV 1/2/24", "fv1/2/24")).toBe(true);
  });

  it("findDuplicateInvoice znajduje istniejący rekord", () => {
    const existing = [{ id: "a", invoice_number: "ABC/1/2024" }];
    expect(findDuplicateInvoice(existing, { invoice_number: "abc/1/2024" })?.id).toBe("a");
  });

  it("findInvoiceNumberConflict pomija edytowany rekord", () => {
    const list = [
      { id: "1", invoice_number: "X/1" },
      { id: "2", invoice_number: "Y/1" },
    ];
    expect(findInvoiceNumberConflict(list, "X/1", "1")).toBeNull();
    expect(findInvoiceNumberConflict(list, "X/1", "2")?.id).toBe("1");
  });

  it("transferFingerprint — ten sam przelew daje ten sam klucz", () => {
    const a = {
      transfer_date: "2024-03-01",
      amount: 100.5,
      currency: "PLN",
      account_number: "12 3456",
      title: "FV 1/2024",
      contractor_name: "ACME",
    };
    const b = { ...a, account_number: "123456" };
    expect(transferFingerprint(a)).toBe(transferFingerprint(b));
  });
});
