import { describe, it, expect, vi, beforeEach } from "vitest";

const uploadMock = vi.fn();
const invokeMock = vi.fn();

vi.mock("@/api/base44Client", () => ({
  base44: {
    integrations: {
      Core: {
        UploadFile: (...args) => uploadMock(...args),
        InvokeLLM: (...args) => invokeMock(...args),
      },
    },
  },
}));

import { extractInvoiceFromPdfBase44 } from "@/lib/invoice-pdf-base44";

describe("invoice-pdf-base44", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    invokeMock.mockReset();
    uploadMock.mockResolvedValue({ url: "https://cdn.example/a.pdf" });
  });

  it("pierwsza próba InvokeLLM zwraca numer — bez kolejnych wywołań", async () => {
    invokeMock.mockResolvedValueOnce({
      numer_faktury: "FV/1",
      nazwa_kontrahenta: "ACME",
      kwota_brutto: 100,
      waluta: "PLN",
    });
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    const { parsed, attemptsUsed } = await extractInvoiceFromPdfBase44(file);
    expect(parsed.numer_faktury).toBe("FV/1");
    expect(attemptsUsed).toBe(1);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("pusta pierwsza odpowiedź — druga próba zwraca dane", async () => {
    invokeMock
      .mockResolvedValueOnce({ numer_faktury: "", nazwa_kontrahenta: "" })
      .mockResolvedValueOnce({ numer_faktury: "2/B", nazwa_kontrahenta: "Beta", kwota_brutto: 0, waluta: "PLN" });
    const file = new File(["x"], "b.pdf", { type: "application/pdf" });
    const { parsed, attemptsUsed } = await extractInvoiceFromPdfBase44(file);
    expect(parsed.nazwa_kontrahenta).toBe("Beta");
    expect(attemptsUsed).toBe(2);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
