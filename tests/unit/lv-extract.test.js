import { describe, it, expect } from "vitest";
import { heuristicLvFromText, mapLvJsonToInternal, parseLvFromJsonText } from "@/lib/lv-extract";
import { normalizeLvLines, projectMatchPayloadFromLv, sumLvLines } from "@/lib/lv-schema";

describe("lv-extract", () => {
  it("heurystyka wykrywa numer LV i sumę netto", () => {
    const text = `
      Leistungsverzeichnis Nr. LV-2025/DE-42
      Auftraggeber: Kaufland Süd GmbH
      Baustelle: Markt Karlsruhe, Hauptstraße 1
      Vergabenummer PO-DE-991
      Nettosumme 12.345,67
    `;
    const h = heuristicLvFromText(text);
    expect(h.document_number).toMatch(/LV-2025/i);
    expect(h.client_name).toMatch(/Kaufland/i);
    expect(h.order_number).toMatch(/PO-DE/i);
    expect(h.total_net).toBeCloseTo(12345.67, 1);
  });

  it("mapLvJsonToInternal mapuje pozycje DE", () => {
    const m = mapLvJsonToInternal({
      nummer_lv: "LV-1",
      titel: "Markt Umbau",
      auftraggeber: "Kunde DE",
      pozycje: [
        { oz: "1.1", leistung: "Estrich einbauen", einheit: "m²", menge: 100, einzelpreis: 25.5, gesamtpreis: 2550 },
      ],
      nettosumme: 2550,
    });
    expect(m.document_number).toBe("LV-1");
    expect(m.title).toBe("Markt Umbau");
    const lines = normalizeLvLines(m.lines);
    expect(lines[0].description).toMatch(/Estrich/);
    expect(lines[0].quantity).toBe(100);
    expect(sumLvLines(lines)).toBe(2550);
  });

  it("parseLvFromJsonText akceptuje JSON eksportu", () => {
    const json = JSON.stringify({
      document_number: "GAEB-99",
      lines: [{ position: "2", description: "Bodenbelag", unit: "m²", quantity: 50, unit_price: 10, line_total: 500 }],
    });
    const m = parseLvFromJsonText(json);
    expect(m.document_number).toBe("GAEB-99");
    expect(normalizeLvLines(m.lines)[0].line_total).toBe(500);
  });

  it("projectMatchPayloadFromLv zawiera tytuł i pozycje", () => {
    const p = projectMatchPayloadFromLv({
      title: "Markt Berlin",
      site_address: "Berlin",
      client_name: "Kunde",
      order_number: "PO-DE-1",
      lines: [{ position: "1", description: "Estrich", unit: "m²", quantity: 1, unit_price: 1, line_total: 1 }],
    });
    expect(p.position).toMatch(/Markt Berlin/);
    expect(p.position).toMatch(/Estrich/);
    expect(p.order_number).toBe("PO-DE-1");
    expect(p.currency).toBe("EUR");
  });
});
