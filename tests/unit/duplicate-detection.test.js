import { describe, expect, it } from "vitest";
import {
  applyImportDuplicateFlags,
  findDuplicateInvoice,
  findDuplicateMaterialDelivery,
  findDuplicateProjectBoQ,
  findInvoiceNumberConflict,
  findProjectBoQConflict,
  invoiceNumberMatches,
  lvRecordsMatch,
  normalizeInvoiceNumberKey,
  transferFingerprint,
  WZ_DUPLICATE_OPTIONS,
  LV_DUPLICATE_OPTIONS,
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

  it("findDuplicateMaterialDelivery — ten sam numer WZ", () => {
    const existing = [{ id: "1", document_number: "WZ 12/2025" }];
    expect(findDuplicateMaterialDelivery(existing, { document_number: "wz12/2025" })?.id).toBe("1");
  });

  it("lvRecordsMatch — numer LV lub tytuł+data", () => {
    expect(lvRecordsMatch({ document_number: "LV-1" }, { document_number: "lv-1" })).toBe(true);
    expect(
      lvRecordsMatch(
        { title: "Markt Dresden", issue_date: "2026-06-10" },
        { title: "Markt Dresden", issue_date: "2026-06-10" }
      )
    ).toBe(true);
  });

  it("applyImportDuplicateFlags — odrzuca duplikat w bazie i w paczce", () => {
    const existing = [{ id: "db", document_number: "WZ-1" }];
    const rows = [
      { document_number: "WZ-1" },
      { document_number: "WZ-2" },
      { document_number: "WZ-2" },
    ];
    const out = applyImportDuplicateFlags(rows, existing, WZ_DUPLICATE_OPTIONS);
    expect(out[0]._rejected).toBe(true);
    expect(out[0]._systemDuplicate).toBe(true);
    expect(out[2]._rejected).toBe(true);
    expect(out[2]._systemDuplicate).toBe(false);
    expect(out[1]._rejected).toBeFalsy();
  });

  it("findProjectBoQConflict pomija edytowany rekord", () => {
    const list = [
      { id: "1", document_number: "3224", title: "A" },
      { id: "2", document_number: "9999", title: "B" },
    ];
    expect(findProjectBoQConflict(list, { document_number: "3224" }, "1")).toBeNull();
    expect(findProjectBoQConflict(list, { document_number: "3224" }, "2")?.id).toBe("1");
  });

  it("LV_DUPLICATE_OPTIONS — findDuplicateProjectBoQ", () => {
    const existing = [{ id: "x", document_number: "LV-DE-1", title: "Markt" }];
    expect(findDuplicateProjectBoQ(existing, { document_number: "lv-de-1" })?.id).toBe("x");
    expect(applyImportDuplicateFlags([{ document_number: "lv-de-1" }], existing, LV_DUPLICATE_OPTIONS)[0]._rejected).toBe(
      true
    );
  });
});
