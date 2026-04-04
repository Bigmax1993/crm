import { describe, it, expect } from "vitest";
import { parsePolishInvoiceXml } from "@/lib/xml-polish-invoice";

describe("parsePolishInvoiceXml", () => {
  it("rzuca dla niepoprawnego XML (parsererror)", () => {
    expect(() => parsePolishInvoiceXml("<<<not-xml")).toThrow(/Niepoprawny XML/);
  });

  it("zwraca pustą tablicę gdy brak danych faktury", () => {
    expect(parsePolishInvoiceXml('<?xml version="1.0"?><root></root>')).toEqual([]);
  });

  it("wyciąga sprzedawcę i nabywcę osobno z uproszczonego FA", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <Fa>
      <P_1>FV/UNIT/01</P_1>
      <P_6>2025-03-01</P_6>
      <P_15>1230.50</P_15>
      <Nazwa_1>Dostawca Sp. z o.o.</Nazwa_1>
      <NIP_1>5252445767</NIP_1>
      <Nazwa_2>Klient Testowy</Nazwa_2>
      <NIP_2>1234567890</NIP_2>
      <KodWaluty>PLN</KodWaluty>
    </Fa>`;
    const [row] = parsePolishInvoiceXml(xml);
    expect(row.invoice_number).toBe("FV/UNIT/01");
    expect(row.seller_name).toBe("Dostawca Sp. z o.o.");
    expect(row.seller_nip).toBe("5252445767");
    expect(row.contractor_name).toBe("Klient Testowy");
    expect(row.contractor_nip).toBe("1234567890");
    expect(row.payer).toBe("Klient Testowy");
    expect(row.amount).toBeCloseTo(1230.5, 5);
    expect(row.currency).toBe("PLN");
    expect(row._sourceXml).toBe(true);
  });
});
