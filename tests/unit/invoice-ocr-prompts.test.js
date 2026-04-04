import { describe, it, expect } from "vitest";
import {
  OCR_LLM_ATTEMPTS,
  getInvoiceBase44AttemptCount,
  getInvoicePdfOcrAttemptCount,
  INVOICE_OCR_SCAN_ADDENDUM,
  INVOICE_OCR_SCAN_ADDENDUM_DEEP,
} from "@/lib/invoice-ocr-prompts";

describe("invoice-ocr-prompts", () => {
  it("getInvoicePdfOcrAttemptCount — domyślnie 5 prób na fakturę", () => {
    expect(getInvoicePdfOcrAttemptCount()).toBe(5);
    expect(getInvoiceBase44AttemptCount()).toBe(5);
  });

  it("OCR_LLM_ATTEMPTS jest liczbą dodatnią", () => {
    expect(OCR_LLM_ATTEMPTS).toBeGreaterThanOrEqual(1);
  });

  it("addenda zawierają reguły wielostronicowości / skanów", () => {
    expect(INVOICE_OCR_SCAN_ADDENDUM).toMatch(/sprzedawca|Wystawca/i);
    expect(INVOICE_OCR_SCAN_ADDENDUM_DEEP).toMatch(/stron|VAT|NIP/i);
  });
});
