import {
  claudeInvokeWithFile,
  isClaudeConfigured,
} from "@/lib/openai-crm";
import { normalizeLines } from "@/lib/material-delivery-schema";
import { extractIssueDate, extractNip, extractSellerHint } from "@/lib/invoice-heuristic-from-text";

export const WZ_JSON_PROMPT = `Jesteś ekspertem od ekstrakcji danych z dokumentów WZ / wydania zewnętrznego / Lieferschein (dostawa materiałów budowlanych, np. piasek, kruszywo).

WYJŚCIE: wyłącznie jeden obiekt JSON (bez markdown).

Odczytaj z PDF:
- numer_wz — numer dokumentu WZ / wydania
- data_wystawienia — YYYY-MM-DD
- nazwa_dostawcy — wystawca / magazyn / sprzedawca
- nip_dostawcy — NIP lub VAT ID (PL/DE)
- numer_zamowienia — PO / zamówienie / Auftragsnr.
- adres_dostawy — miejsce dostawy / budowa / odbiorca
- uwagi — krótko (np. nr rejestracyjny, kierowca)
- waluta — PLN lub EUR jeśli widać
- pozycje — tablica: { "nazwa": "", "jednostka": "t"|"m3"|"kpl", "ilosc": 0 }

Priorytet: materiał (piasek, kruszywo), ilość i jednostka. Nie wymyślaj numeru WZ.

Szablon:
{
  "numer_wz": "",
  "data_wystawienia": "YYYY-MM-DD",
  "nazwa_dostawcy": "",
  "nip_dostawcy": "",
  "numer_zamowienia": "",
  "adres_dostawy": "",
  "uwagi": "",
  "waluta": "PLN",
  "pozycje": [{ "nazwa": "Piasek 0-2", "jednostka": "t", "ilosc": 0 }]
}`;

const WZ_NUM_PATTERNS = [
  /(?:WZ|W\.Z\.|wydanie\s+zewnętrzne|lieferschein)\s*(?:nr\.?|no\.?)?\s*[:\s#]*([A-Z0-9][A-Z0-9\/\-\s]{2,30})/i,
  /\b(WZ[\s\/-]?\d{4,}[\/\-\w]*)\b/i,
];

export function heuristicWzFromText(text, fileName = "") {
  const t = String(text || "");
  if (t.length < 20 && !fileName) return null;

  let document_number = "";
  for (const re of WZ_NUM_PATTERNS) {
    const m = t.match(re);
    if (m?.[1]) {
      document_number = String(m[1]).replace(/\s+/g, " ").trim();
      break;
    }
  }
  if (!document_number && /wz/i.test(fileName)) {
    const fm = fileName.match(/(WZ[\w\-\/]+)/i);
    if (fm) document_number = fm[1];
  }

  const supplier_name = extractSellerHint(t) || "";
  const supplier_nip = extractNip(t) || "";
  const issue_date = extractIssueDate(t) || "";

  const orderMatch = t.match(/(?:zamówienie|zamowienie|order|auftrag|PO)\s*(?:nr\.?)?\s*[:\s]*([A-Z0-9][A-Z0-9\/\-]{3,30})/i);
  const order_number = orderMatch?.[1]?.trim() || "";

  const sandMatch = t.match(/(piasek[^\n,;]{0,40}|sand[^\n,;]{0,40})/i);
  const qtyMatch = t.match(/(\d+[,.]?\d*)\s*(t|ton|tna|m3|m³|kpl)/i);

  const lines = [];
  if (sandMatch || qtyMatch) {
    lines.push({
      name: sandMatch ? sandMatch[1].trim() : "Materiał",
      unit: qtyMatch?.[2]?.toLowerCase().replace("³", "3") || "t",
      quantity: qtyMatch ? Number(String(qtyMatch[1]).replace(",", ".")) || 0 : 0,
    });
  }

  if (!document_number && !supplier_name && lines.length === 0) return null;

  return mapWzJsonToInternal({
    numer_wz: document_number,
    data_wystawienia: issue_date,
    nazwa_dostawcy: supplier_name,
    nip_dostawcy: supplier_nip,
    numer_zamowienia: order_number,
    pozycje: lines.map((l) => ({ nazwa: l.name, jednostka: l.unit, ilosc: l.quantity })),
  });
}

export function mapWzJsonToInternal(j, { fileName } = {}) {
  if (!j) return null;
  const cur = String(j.waluta ?? "PLN").toUpperCase();
  return {
    document_number: String(j.numer_wz ?? j.document_number ?? "").trim(),
    issue_date: String(j.data_wystawienia ?? j.issue_date ?? "").trim(),
    supplier_name: String(j.nazwa_dostawcy ?? j.supplier_name ?? "").trim(),
    supplier_nip: String(j.nip_dostawcy ?? j.supplier_nip ?? "").trim(),
    order_number: String(j.numer_zamowienia ?? j.order_number ?? "").trim(),
    delivery_address: String(j.adres_dostawy ?? j.delivery_address ?? "").trim(),
    notes: String(j.uwagi ?? j.notes ?? "").trim(),
    currency: cur === "EUR" ? "EUR" : "PLN",
    lines: normalizeLines(
      (j.pozycje || j.lines || []).map((p) => ({
        name: p.nazwa ?? p.name,
        unit: p.jednostka ?? p.unit,
        quantity: p.ilosc ?? p.quantity,
      }))
    ),
    fileName: fileName || "",
    status: "pending_invoice",
  };
}

export async function extractWzFromPdfClaude(file) {
  const parsed = await claudeInvokeWithFile({ prompt: WZ_JSON_PROMPT, file });
  return { parsed, rawText: JSON.stringify(parsed) };
}

export async function extractWzFromPdf(file) {
  const { extractPlainTextFromPdfWithOcrFallback } = await import("@/lib/invoice-pdf-plain-text");
  let plain = "";
  try {
    plain = await extractPlainTextFromPdfWithOcrFallback(file);
  } catch {
    /* ignore */
  }

  const heur = heuristicWzFromText(plain, file.name);
  if (heur?.document_number?.trim() || heur?.supplier_name?.trim() || normalizeLines(heur?.lines).length) {
    return { mapped: { ...heur, fileName: file.name, _extractionSource: "heuristic" }, plain };
  }

  if (isClaudeConfigured()) {
    try {
      const { parsed } = await extractWzFromPdfClaude(file);
      const mapped = mapWzJsonToInternal(parsed, { fileName: file.name });
      if (
        mapped &&
        (mapped.document_number?.trim() || mapped.supplier_name?.trim() || normalizeLines(mapped.lines).length)
      ) {
        return { mapped: { ...mapped, _extractionSource: "claude" }, plain };
      }
    } catch (e) {
      console.warn("Claude WZ extraction:", e);
      throw e;
    }
  }

  if (heur) return { mapped: { ...heur, fileName: file.name, _extractionSource: "heuristic" }, plain };
  return { mapped: null, plain };
}
