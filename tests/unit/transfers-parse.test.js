import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractInvoiceNumber, parseCSV } from "@/lib/transfers-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readFixture(name) {
  return readFileSync(path.join(__dirname, "../fixtures/transfers", name), "utf8");
}

describe("extractInvoiceNumber", () => {
  it("znajduje numer FV w stylu polskim", () => {
    expect(extractInvoiceNumber("Zapłata za FV 123456")).toMatch(/FV/i);
  });

  it("znajduje wzorzec ABC/12/2024", () => {
    expect(extractInvoiceNumber("Faktura ABC/12/2024")).toBe("ABC/12/2024");
  });

  it("zwraca pusty string gdy brak dopasowania", () => {
    expect(extractInvoiceNumber("sam tekst bez numeru")).toBe("");
  });
});

describe("parseCSV — standard z nagłówkami", () => {
  it("parsuje fixture standard-semicolon.csv", () => {
    const text = readFixture("standard-semicolon.csv");
    const rows = parseCSV(text);
    expect(rows).toHaveLength(2);
    expect(rows[0].contractor_name).toContain("Testowa Firma");
    expect(rows[0].amount).toBeCloseTo(123.45, 2);
    expect(rows[0].currency).toBe("PLN");
    expect(rows[0].invoice_number).toBe("FV/1/2024");
  });
});

describe("parseCSV — format wyciągu (PLN w nagłówku)", () => {
  it("parsuje fixture bank-pln-header.csv i pomija PROWIZJA", () => {
    const text = readFixture("bank-pln-header.csv");
    const rows = parseCSV(text);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const titles = rows.map((r) => r.title).join(" ");
    expect(titles).not.toMatch(/PROWIZJA/i);
    const acme = rows.find((r) => r.contractor_name.includes("Acme"));
    expect(acme).toBeDefined();
    expect(acme.amount).toBeCloseTo(150.5, 2);
    expect(acme.transfer_date).toBe("2024-03-01");
    const beta = rows.find((r) => r.contractor_name.includes("Beta"));
    expect(beta).toBeDefined();
    expect(beta.amount).toBeCloseTo(75.25, 2);
  });
});

describe("parseCSV — krawędzie", () => {
  it("pusty lub biały tekst → pusta tablica", () => {
    expect(parseCSV("")).toEqual([]);
    expect(parseCSV("   \n  \n")).toEqual([]);
  });

  it("tylko nagłówek standardowy → brak wierszy danych", () => {
    const text = "Kontrahent;Kwota;Waluta;Data\n";
    expect(parseCSV(text)).toEqual([]);
  });
});
