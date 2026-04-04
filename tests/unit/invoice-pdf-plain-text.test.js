import { describe, expect, it } from "vitest";
import { pdfTextLooksLikeScanned } from "@/lib/invoice-pdf-plain-text";

describe("pdfTextLooksLikeScanned", () => {
  it("uznaje bardzo krótki tekst za skan", () => {
    expect(pdfTextLooksLikeScanned("abc")).toBe(true);
    expect(pdfTextLooksLikeScanned("")).toBe(true);
  });

  it("uznaje długi tekst z wieloma literami za cyfrowy PDF", () => {
    const t =
      "FAKTURA VAT Nr FV/2026/04/001 Data wystawienia 04.04.2026 SPRZEDAWCA BudTech Sp. z o.o. NIP 5213456789 NABYWCA Inwestycje Polskie S.A. DO ZAPŁATY 115869,00 zł " +
      "x".repeat(200);
    expect(pdfTextLooksLikeScanned(t)).toBe(false);
  });
});
