import { describe, it, expect } from "vitest";
import {
  OCR_LLM_ATTEMPTS,
  getInvoiceBase44AttemptCount,
  INVOICE_OCR_SCAN_ADDENDUM,
  INVOICE_OCR_SCAN_ADDENDUM_DEEP,
} from "@/lib/invoice-ocr-prompts";

describe("invoice-ocr-prompts", () => {
  it("getInvoiceBase44AttemptCount — 5 prób na fakturę", () => {
    expect(getInvoiceBase44AttemptCount()).toBe(5);
  });

  it("OCR_LLM_ATTEMPTS jest liczbą dodatnią", () => {
    expect(OCR_LLM_ATTEMPTS).toBeGreaterThanOrEqual(3);
  });

  it("addenda zawierają reguły wielostronicowości / skanów", () => {
    expect(INVOICE_OCR_SCAN_ADDENDUM).toMatch(/sprzedawca|Wystawca/i);
    expect(INVOICE_OCR_SCAN_ADDENDUM_DEEP).toMatch(/stron|VAT|NIP/i);
  });
});
