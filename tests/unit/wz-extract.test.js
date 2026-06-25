import { describe, it, expect } from "vitest";
import {
  documentNumberFromFileName,
  heuristicWzFromText,
  heuristicWzIsComplete,
  mapWzJsonToInternal,
} from "@/lib/wz-extract";
import { normalizeLines, projectMatchPayloadFromWz } from "@/lib/material-delivery-schema";

describe("wz-extract", () => {
  it("heurystyka wykrywa numer WZ i piasek", () => {
    const text = `
      WZ nr 12/2025/03
      Sprzedawca: Kopalnia Piasku ABC
      NIP: 123-456-78-90
      Zamówienie PO-KAU-77
      Piasek 0-2   12,5 t
    `;
    const h = heuristicWzFromText(text);
    expect(h.document_number).toMatch(/12\/2025/i);
    expect(h.order_number).toMatch(/PO-KAU/i);
    expect(normalizeLines(h.lines)[0].name.toLowerCase()).toContain("piasek");
  });

  it("mapWzJsonToInternal mapuje pozycje", () => {
    const m = mapWzJsonToInternal({
      numer_wz: "WZ-1",
      nazwa_dostawcy: "Dostawca",
      pozycje: [{ nazwa: "Piasek", jednostka: "t", ilosc: 10 }],
    });
    expect(m.document_number).toBe("WZ-1");
    expect(normalizeLines(m.lines)[0].quantity).toBe(10);
  });

  it("projectMatchPayloadFromWz zawiera opis materiału", () => {
    const p = projectMatchPayloadFromWz({
      supplier_name: "X",
      lines: [{ name: "Piasek", unit: "t", quantity: 5 }],
      order_number: "PO-1",
    });
    expect(p.position).toMatch(/Piasek/);
    expect(p.order_number).toBe("PO-1");
  });

  it("numer SP z nazwy pliku gdy brak w tekście", () => {
    const h = heuristicWzFromText("Piasek płukany 26,25 t", "SP 006546 26.pdf");
    expect(h.document_number).toBe("SP 006546 26");
    expect(heuristicWzIsComplete(h)).toBe(false);
  });

  it("heuristicWzIsComplete wymaga numeru i dostawcy", () => {
    expect(
      heuristicWzIsComplete({
        document_number: "WZ-1",
        supplier_name: "Kopalnia",
        lines: [{ name: "Piasek", unit: "t", quantity: 1 }],
      })
    ).toBe(true);
    expect(
      heuristicWzIsComplete({
        document_number: "",
        supplier_name: "",
        lines: [{ name: "Piasek", unit: "t", quantity: 1 }],
      })
    ).toBe(false);
  });

  it("documentNumberFromFileName rozpoznaje SP i WZ", () => {
    expect(documentNumberFromFileName("SP 006546 26.pdf")).toBe("SP 006546 26");
    expect(documentNumberFromFileName("WZ-12-2025.pdf")).toBe("WZ-12-2025");
  });
});
