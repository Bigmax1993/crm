import { base44 } from "@/api/base44Client";
import { getUploadFilePublicUrl } from "@/lib/upload-file-url";
import { INVOICE_JSON_PROMPT } from "@/lib/openai-crm";
import {
  getInvoicePdfOcrAttemptCount,
  INVOICE_OCR_SCAN_ADDENDUM,
  INVOICE_OCR_SCAN_ADDENDUM_DEEP,
} from "@/lib/invoice-ocr-prompts";

/**
 * Schemat odpowiedzi InvokeLLM — zgodny z polami z INVOICE_JSON_PROMPT / mapOpenAiInvoiceJsonToInternal.
 */
export const INVOICE_INVOKE_LLM_JSON_SCHEMA = {
  type: "object",
  properties: {
    numer_faktury: { type: "string" },
    nazwa_kontrahenta: { type: "string" },
    nip_kontrahenta: { type: "string" },
    data_wystawienia: { type: "string" },
    termin_platnosci: { type: "string" },
    typ_dokumentu: { type: "string" },
    numer_zamowienia: { type: "string" },
    pozycje: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nazwa: { type: "string" },
          ilosc: { type: "number" },
          cena_netto: { type: "number" },
          vat_procent: { type: "number" },
          wartosc_brutto: { type: "number" },
        },
      },
    },
    kwota_netto: { type: "number" },
    kwota_vat: { type: "number" },
    kwota_brutto: { type: "number" },
    waluta: { type: "string" },
    numer_konta: { type: "string" },
    uwagi: { type: "string" },
    _confidence: {
      type: "object",
      properties: {
        invoice_number: { type: "number" },
        contractor_name: { type: "number" },
        contractor_nip: { type: "number" },
        amount: { type: "number" },
        net_amount: { type: "number" },
        vat_amount: { type: "number" },
        currency: { type: "number" },
        issue_date: { type: "number" },
        payment_deadline: { type: "number" },
        invoice_lines: { type: "number" },
        position: { type: "number" },
        order_number: { type: "number" },
      },
    },
  },
};

function hasCoreInvoiceFields(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  const nr = String(parsed.numer_faktury ?? "").trim();
  const naz = String(parsed.nazwa_kontrahenta ?? "").trim();
  return Boolean(nr || naz);
}

function buildInvoiceBase44Prompt(attemptIndex) {
  const ocrPriority =
    "OCR: dokładnie przepisz widoczne napisy z dokumentu; obejmij WSZYSTKIE strony PDF; numery i sumy często na pierwszej lub ostatniej stronie.\n\n";

  const footer = `

Zwróć wyłącznie jeden obiekt JSON zgodny ze schemą (bez markdown, bez tekstu przed/po).`;

  let body = `${ocrPriority}${INVOICE_JSON_PROMPT}${footer}`;

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

To jest próba ${attemptIndex + 1} z serii — jeśli wcześniej pola były puste, czytaj ponownie z naciskiem na: stopkę VAT, „Razem” / „Do zapłaty”, blok Sprzedawca (nazwa + NIP), numer faktury w nagłówku i stopce.`;
  }
  return body;
}

/**
 * Ekstrakcja faktury z PDF przez Base44 (upload + InvokeLLM z plikiem).
 * Kilka prób z twardszym promptem dla skanów (domyślnie 4 na fakturę — getInvoicePdfOcrAttemptCount).
 */
export async function extractInvoiceFromPdfBase44(file) {
  const uploadRes = await base44.integrations.Core.UploadFile({ file });
  const fileUrl = getUploadFilePublicUrl(uploadRes);
  if (!fileUrl) {
    throw new Error(
      uploadRes?.message ||
        "Upload PDF nie zwrócił adresu pliku — sprawdź integrację Base44 (Core.UploadFile)."
    );
  }

  const maxAttempts = getInvoicePdfOcrAttemptCount();
  let lastError = null;
  let lastResult = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const prompt = buildInvoiceBase44Prompt(attempt);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        file_urls: [fileUrl],
        response_json_schema: INVOICE_INVOKE_LLM_JSON_SCHEMA,
      });
      lastResult = result;
      if (result && typeof result === "object" && hasCoreInvoiceFields(result)) {
        return { parsed: result, attemptsUsed: attempt + 1 };
      }
      lastError = new Error("Base44 nie zwróciło numeru faktury ani kontrahenta.");
    } catch (e) {
      lastError = e;
    }
  }

  if (lastResult && typeof lastResult === "object") {
    return { parsed: lastResult, attemptsUsed: maxAttempts };
  }
  throw lastError || new Error("Base44 InvokeLLM nie zwróciło obiektu JSON faktury.");
}
