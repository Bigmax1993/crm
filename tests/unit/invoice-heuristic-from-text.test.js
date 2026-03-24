import { describe, it, expect } from "vitest";
import {
  extractNip,
  extractInvoiceNumber,
  extractGrossAmount,
  heuristicInvoiceFromPdfText,
} from "@/lib/invoice-heuristic-from-text";

describe("invoice-heuristic-from-text (bez LLM)", () => {
  it("wyciąga poprawny NIP z sumą kontrolną", () => {
    expect(extractNip("NIP 5252445767 na fakturze")).toBe("5252445767");
  });

  it("heuristicInvoiceFromPdfText — syntetyczny blok jak z PDF z warstwą tekstu", () => {
    const raw = `
      Faktura VAT nr. FV/2024/03/100
      Sprzedawca: ACME Sp. z o.o.
      NIP 5252445767
      Data wystawienia: 15.03.2024
      Razem z VAT 1 234,56 PLN
    `;
    const row = heuristicInvoiceFromPdfText(raw, "test.pdf");
    expect(row).not.toBeNull();
    expect(row.invoice_number.length).toBeGreaterThan(0);
    expect(row.contractor_nip).toBe("5252445767");
    expect(row.amount).toBeGreaterThan(0);
  });

  it("extractInvoiceNumber — wzorzec FV/", () => {
    expect(extractInvoiceNumber("dokument FV 12/2024/ACME dodatkowy tekst")).toMatch(/FV/i);
  });

  it("extractGrossAmount — fraza Do zapłaty", () => {
    expect(extractGrossAmount("Do zapłaty: 999,00 PLN koniec")).toBe(999);
  });
});
