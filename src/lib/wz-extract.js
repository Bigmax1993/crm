import {
  claudeInvokeWithFile,
  isClaudeConfigured,
} from "@/lib/openai-crm";
import { base44 } from "@/api/base44Client";
import { getUploadFilePublicUrl } from "@/lib/upload-file-url";
import {
  getInvoicePdfOcrAttemptCount,
  INVOICE_OCR_SCAN_ADDENDUM,
  INVOICE_OCR_SCAN_ADDENDUM_DEEP,
} from "@/lib/invoice-ocr-prompts";
import { normalizeLines } from "@/lib/material-delivery-schema";
import {
  extractContractorNameFromInvoiceText,
  extractIssueDate,
  extractNip,
  extractSellerHint,
} from "@/lib/invoice-heuristic-from-text";

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
  /(?:WZ|W\.Z\.|SP|wydanie\s+zewnętrzne|lieferschein)\s*(?:nr\.?|no\.?)?\s*[:\s#]*([A-Z0-9][A-Z0-9\/\-\s]{2,30})/i,
  /\b((?:WZ|SP)[\s\/-]?\d{4,}[\/\-\w]*)\b/i,
  /\b(SP\s+\d{4,}(?:\s+\d{2})?)\b/i,
];

/** Heurystyka wystarczająca tylko gdy są pola wymagane przy zapisie WZ. */
export function heuristicWzIsComplete(heur) {
  if (!heur) return false;
  return Boolean(heur.document_number?.trim() && heur.supplier_name?.trim());
}

export function documentNumberFromFileName(fileName = "") {
  const base = String(fileName || "")
    .replace(/\.pdf$/i, "")
    .trim();
  if (!base) return "";
  const m = base.match(/\b((?:WZ|SP|W\.Z\.)[\s\-\/]?\d[\w\s\-\/]*)/i);
  if (m?.[1]) return m[1].replace(/\s+/g, " ").trim();
  if (/^\d[\d\s\-\/]{2,}$/i.test(base)) return base.replace(/\s+/g, " ").trim();
  return "";
}

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
  if (!document_number) {
    document_number = documentNumberFromFileName(fileName);
  }

  const supplier_name =
    extractContractorNameFromInvoiceText(t) || extractSellerHint(t) || "";
  const supplier_nip = extractNip(t) || "";
  const issue_date = extractIssueDate(t) || "";

  const orderMatch = t.match(
    /(?:zamówienie|zamowienie|order|auftrag|bestellung)\s*(?:nr\.?|no\.?)?\s*[:\s#]*([A-Z0-9][A-Z0-9\/\-]{3,30})/i
  );
  const poMatch = t.match(/\bPO[\s\-:]?([A-Z0-9][A-Z0-9\/\-]{2,28})\b/i);
  const order_number = orderMatch?.[1]?.trim() || (poMatch ? `PO-${poMatch[1]}` : "");

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

export const WZ_INVOKE_LLM_JSON_SCHEMA = {
  type: "object",
  properties: {
    numer_wz: { type: "string" },
    data_wystawienia: { type: "string" },
    nazwa_dostawcy: { type: "string" },
    nip_dostawcy: { type: "string" },
    numer_zamowienia: { type: "string" },
    adres_dostawy: { type: "string" },
    uwagi: { type: "string" },
    waluta: { type: "string" },
    pozycje: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nazwa: { type: "string" },
          jednostka: { type: "string" },
          ilosc: { type: "number" },
        },
      },
    },
  },
};

function hasCoreWzFields(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  const nr = String(parsed.numer_wz ?? "").trim();
  const sup = String(parsed.nazwa_dostawcy ?? "").trim();
  const poz = Array.isArray(parsed.pozycje) ? parsed.pozycje.length : 0;
  return Boolean(nr || sup || poz);
}

function buildWzBase44Prompt(attemptIndex) {
  const ocrPriority =
    "OCR: dokładnie przepisz widoczne napisy z dokumentu WZ / wydania zewnętrznego; obejmij WSZYSTKIE strony PDF.\n\n";
  const footer = `

Zwróć wyłącznie jeden obiekt JSON zgodny ze schemą (bez markdown, bez tekstu przed/po).`;
  let body = `${ocrPriority}${WZ_JSON_PROMPT}${footer}`;
  if (attemptIndex >= 1) {
    body += `

---

${INVOICE_OCR_SCAN_ADDENDUM}`;
  }
  if (attemptIndex >= 2) {
    body += `

---

${INVOICE_OCR_SCAN_ADDENDUM_DEEP}`;
  }
  if (attemptIndex >= 1) {
    body += `

To jest próba ${attemptIndex + 1} z serii — jeśli wcześniej pola były puste, czytaj ponownie z naciskiem na: numer WZ/SP w nagłówku, blok dostawcy/wystawcy (nazwa + NIP), datę wydania, pozycje materiałowe z ilością i jednostką.`;
  }
  return body;
}

/** Ekstrakcja WZ z PDF przez Base44 (upload + InvokeLLM z plikiem). */
export async function extractWzFromPdfBase44(file) {
  const uploadRes = await base44.integrations.Core.UploadFile({ file });
  const fileUrl = getUploadFilePublicUrl(uploadRes);
  if (!fileUrl) {
    throw new Error(
      uploadRes?.message ||
        "Upload pliku nie zwrócił adresu — sprawdź integrację Base44 (Core.UploadFile)."
    );
  }

  const maxAttempts = getInvoicePdfOcrAttemptCount();
  let lastError = null;
  let lastResult = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const prompt = buildWzBase44Prompt(attempt);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        file_urls: [fileUrl],
        response_json_schema: WZ_INVOKE_LLM_JSON_SCHEMA,
      });
      lastResult = result;
      if (result && typeof result === "object" && hasCoreWzFields(result)) {
        return { parsed: result, attemptsUsed: attempt + 1 };
      }
      lastError = new Error("Base44 nie zwróciło numeru WZ ani podstawowych danych dostawcy.");
    } catch (e) {
      lastError = e;
    }
  }

  if (lastResult && typeof lastResult === "object") {
    return { parsed: lastResult, attemptsUsed: maxAttempts };
  }
  throw lastError || new Error("Base44 InvokeLLM nie zwróciło obiektu JSON WZ.");
}

export function wzMappedHasUsableData(mapped) {
  if (!mapped) return false;
  return Boolean(
    mapped.document_number?.trim() ||
      mapped.supplier_name?.trim() ||
      normalizeLines(mapped.lines).length
  );
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
  if (heuristicWzIsComplete(heur)) {
    return { mapped: { ...heur, fileName: file.name, _extractionSource: "heuristic" }, plain };
  }

  if (isClaudeConfigured()) {
    try {
      const { parsed } = await extractWzFromPdfClaude(file);
      const mapped = mapWzJsonToInternal(parsed, { fileName: file.name });
      if (mapped && wzMappedHasUsableData(mapped)) {
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
