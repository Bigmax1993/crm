import { describe, it, expect } from "vitest";
import { looksLikeBankReportName, looksLikeBankReportPlain } from "@/lib/invoice-report-detection";

describe("invoice-report-detection", () => {
  it("looksLikeBankReportName — typowe wzorce", () => {
    expect(looksLikeBankReportName("MIZAR_Raport_2026.pdf")).toBe(true);
    expect(looksLikeBankReportName("FV_123.pdf")).toBe(false);
  });

  it("looksLikeBankReportPlain — wyciąg bez pól FV", () => {
    expect(looksLikeBankReportPlain("Lista transakcji za okres marzec\nsaldo końcowe")).toBe(true);
    expect(
      looksLikeBankReportPlain(
        "Faktura VAT\nNumer faktury 1/2025\nNabywca\nSprzedawca\nBrutto 100 PLN"
      )
    ).toBe(false);
  });
});
