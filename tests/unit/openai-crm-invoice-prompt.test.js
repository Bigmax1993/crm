import { describe, it, expect } from "vitest";
import { INVOICE_JSON_PROMPT, buildOpenAiInvoiceUserText } from "@/lib/openai-crm";

describe("openai-crm — prompt faktury PDF", () => {
  it("INVOICE_JSON_PROMPT wymaga czytania wszystkich stron", () => {
    expect(INVOICE_JSON_PROMPT).toMatch(/WIELOSTRONOWE|wszystkie strony/i);
  });

  it("buildOpenAiInvoiceUserText(0) to samo co baza bez dodatków", () => {
    expect(buildOpenAiInvoiceUserText(0)).toBe(INVOICE_JSON_PROMPT);
  });

  it("buildOpenAiInvoiceUserText(1+) dokleja wskazówkę ponownej analizy", () => {
    const t = buildOpenAiInvoiceUserText(1);
    expect(t.length).toBeGreaterThan(INVOICE_JSON_PROMPT.length);
    expect(t).toContain(INVOICE_JSON_PROMPT);
    expect(t).toMatch(/Ponowna analiza/i);
  });
});
