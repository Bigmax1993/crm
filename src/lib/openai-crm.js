const LS_SETTINGS = "fakturowo_ai_settings_v1";
const LS_USAGE = "fakturowo_ai_usage_v1";
const LS_HISTORY = "fakturowo_ai_history_v1";

const DEFAULT_SETTINGS = {
  apiKeyOverride: "",
  model: "gpt-4o",
  language: "pl",
  alertIntervalHours: 24,
  dailyQueryLimit: 50,
  dailyTokenLimit: 200000,
};

export function getAiSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAiSettings(partial) {
  const next = { ...getAiSettings(), ...partial };
  localStorage.setItem(LS_SETTINGS, JSON.stringify(next));
  window.dispatchEvent(new Event("fakturowo-ai-settings"));
  return next;
}

export function getOpenAiApiKey() {
  const env = (import.meta.env?.VITE_OPENAI_API_KEY || "").trim();
  const override = (getAiSettings().apiKeyOverride || "").trim();
  return override || env;
}

export function isOpenAiConfigured() {
  return Boolean(getOpenAiApiKey());
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function getUsageToday() {
  try {
    const raw = localStorage.getItem(LS_USAGE);
    const o = raw ? JSON.parse(raw) : {};
    if (o.date !== todayStr()) return { date: todayStr(), requests: 0, tokens: 0 };
    return o;
  } catch {
    return { date: todayStr(), requests: 0, tokens: 0 };
  }
}

export function recordUsage(tokens = 0, meta = {}) {
  let u = getUsageToday();
  if (u.date !== todayStr()) u = { date: todayStr(), requests: 0, tokens: 0 };
  u.requests += 1;
  u.tokens += Number(tokens) || 0;
  localStorage.setItem(LS_USAGE, JSON.stringify(u));

  try {
    const hist = JSON.parse(localStorage.getItem(LS_HISTORY) || "[]");
    hist.unshift({
      ts: Date.now(),
      tokens: Number(tokens) || 0,
      ...meta,
    });
    localStorage.setItem(LS_HISTORY, JSON.stringify(hist.slice(0, 80)));
  } catch {
    /* ignore */
  }
}

export function getAiHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_HISTORY) || "[]");
  } catch {
    return [];
  }
}

export function canMakeAiRequest() {
  const s = getAiSettings();
  const u = getUsageToday();
  if (!isOpenAiConfigured()) return { ok: false, reason: "no_key" };
  if (u.requests >= s.dailyQueryLimit) return { ok: false, reason: "queries" };
  if (u.tokens >= s.dailyTokenLimit) return { ok: false, reason: "tokens" };
  return { ok: true };
}

/** Szacunek ~USD dla GPT-4o (orientacyjnie). */
export function estimateCostUsd(approxTotalTokens = 1500) {
  const per1k = 0.005;
  return (approxTotalTokens / 1000) * per1k;
}

export function extractJsonObject(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function cacheKey(prefix, payload) {
  return `${prefix}_${hashString(JSON.stringify(payload)).slice(0, 48)}`;
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h);
}

const CACHE_TTL = 24 * 60 * 60 * 1000;

export function cacheGet(prefix, payload) {
  try {
    const k = cacheKey(prefix, payload);
    const raw = localStorage.getItem(`fakturowo_ai_cache_${k}`);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

export function cacheSet(prefix, payload, data) {
  try {
    const k = cacheKey(prefix, payload);
    localStorage.setItem(`fakturowo_ai_cache_${k}`, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* quota */
  }
}

export async function openaiChatCompletions({ messages, max_tokens = 2500, temperature = 0.2, model: modelOverride }) {
  const key = getOpenAiApiKey();
  if (!key) throw new Error("Brak klucza OpenAI (VITE_OPENAI_API_KEY lub Ustawienia AI)");

  const gate = canMakeAiRequest();
  if (!gate.ok) {
    if (gate.reason === "queries") throw new Error("Osiągnięto dzienny limit zapytań AI");
    if (gate.reason === "tokens") throw new Error("Osiągnięto dzienny limit tokenów AI");
    throw new Error("AI niedostępna");
  }

  const model = modelOverride || getAiSettings().model || "gpt-4o";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages, max_tokens, temperature }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 280) || `HTTP ${res.status}`);
  }

  const j = await res.json();
  const text = j.choices?.[0]?.message?.content || "";
  const total = j.usage?.total_tokens ?? 0;
  recordUsage(total, { type: "chat", model });
  return { text, usage: j.usage, model };
}

/**
 * Upload pliku do OpenAI (PDF) — file_id do wiadomości chat.
 */
export async function openaiUploadFile(file) {
  const key = getOpenAiApiKey();
  if (!key) throw new Error("Brak klucza OpenAI");

  const fd = new FormData();
  fd.append("file", file);
  fd.append("purpose", "assistants");

  const res = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 200));
  }
  const j = await res.json();
  return j.id;
}

export async function openaiDeleteFile(fileId) {
  const key = getOpenAiApiKey();
  if (!key || !fileId) return;
  try {
    await fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch {
    /* ignore */
  }
}

const INVOICE_JSON_PROMPT = `Tryb MAKSYMALNEJ DOKŁADNOŚCI: traktuj PDF jak skan — czytaj sekcja po sekcji (nagłówek → sprzedawca → nabywca → pozycje → podsumowanie VAT → do zapłaty). Rozróżniaj O/0, l/1, przecinek dziesiętny od tysięcy (PL). Przy niepewności zostaw pole puste.

Jesteś ekspertem od ekstrakcji danych z faktur (Polska, UE) do systemu ERP. Użytkownik zweryfikuje pola ręcznie — priorytetem jest zgodność z dokumentem, nie domysły.

WYJŚCIE:
- Zwróć WYŁĄCZNIE jeden obiekt JSON (bez markdown, bez komentarzy, bez tekstu przed/po).
- Brakujące pole: pusty string "" lub 0 lub pusta tablica [] — spójnie z typem pola.
- Nie wymyślaj numeru faktury, NIP-u ani kwot, jeśli nie widać ich w dokumencie.

KTO JEST KONTRAHENTEM (nazwa_kontrahenta, nip_kontrahenta):
- Dla FAKTURY ZAKUPU (my jesteśmy nabywcą): kontrahent = SPRZEDAWCA / wystawca faktury (nie nabywca, nie nasza firma).
- Dla FAKTURY SPRZEDAŻY (my wystawiamy): kontrahent = NABYWCA.
- Jeśli na dokumencie widać wyraźnie własną firmę (nabywca ze stałej bazy) jako jedną ze stron — druga strona transakcji to kontrahent dla zakupu.

KWOTY I WALUTA:
- kwota_brutto = kwota z sekcji podsumowania / „Razem” / „Do zapłaty” (preferuj stopkę nad pojedynczą pozycją).
- kwota_netto, kwota_vat: z podsumowania VAT; jeśli tylko brutto widoczne — netto/VAT możesz policzyć tylko gdy jednoznacznie wynika z dokumentu, inaczej 0 i niska pewność.
- waluta: kod ISO (PLN, EUR, itd.).

DATY (YYYY-MM-DD):
- data_wystawienia z pola „Data wystawienia”; termin_platnosci z „Termin płatności” / „Płatne do”.
- Daty tekstowe PL (np. 15.03.2025) przekonwertuj; jeśli niepełne — "" i niska _confidence.

POZYCJE (pozycje):
- Maks. ok. 40 pozycji; jeśli więcej — pierwsze 40 + w uwagi dopisz „więcej pozycji w dokumencie”.
- Pola: nazwa, ilosc, cena_netto, vat_procent, wartosc_brutto.

TYP DOKUMENTU (pole typ_dokumentu):
- Jedna z: FV, korekta, proforma, rachunek, paragon, zaliczkowa, inny — wg treści dokumentu.
- Dla korekty: nadal wypełnij pola wartościami z korygowanego zestawienia (po korekcie), a w uwagi krótko „dokument korygujący” jeśli widoczne.

NIP:
- Dla PL: 10 cyfr (możesz podać z prefiksem PL lub bez — spójnie cyfry).
- Nie kopiuj NIP nabywcy jako NIP kontrahenta przy fakturze zakupu.

POZOSTAŁE:
- numer_zamowienia: z pola zamówienie / order / nr zlecenia jeśli jest.
- numer_konta: rachunek do przelewu jeśli widoczny.
- uwagi: krótki opis pozycji głównej lub uwagi ze stopki (nie duplikuj całej treści dokumentu).

_CONFIDENCE (0–100 dla kluczy angielskich):
invoice_number, contractor_name, contractor_nip, amount, net_amount, vat_amount, currency, issue_date, payment_deadline, invoice_lines (tablica pozycje), position (uwagi), order_number.

Szablon JSON (wypełnij wartościami z PDF):
{
  "numer_faktury": "",
  "nazwa_kontrahenta": "",
  "nip_kontrahenta": "",
  "data_wystawienia": "YYYY-MM-DD",
  "termin_platnosci": "YYYY-MM-DD",
  "typ_dokumentu": "FV",
  "numer_zamowienia": "",
  "pozycje": [{ "nazwa": "", "ilosc": 0, "cena_netto": 0, "vat_procent": 23, "wartosc_brutto": 0 }],
  "kwota_netto": 0,
  "kwota_vat": 0,
  "kwota_brutto": 0,
  "waluta": "PLN",
  "numer_konta": "",
  "uwagi": "",
  "_confidence": {
    "invoice_number": 85,
    "contractor_name": 80,
    "contractor_nip": 70,
    "amount": 75,
    "net_amount": 70,
    "vat_amount": 70,
    "currency": 90,
    "issue_date": 72,
    "payment_deadline": 70,
    "invoice_lines": 75,
    "position": 60,
    "order_number": 50
  }
}`;

/**
 * Ekstrakcja faktury z PDF przez OpenAI (plik → chat z załącznikiem).
 */
export async function extractInvoiceFromPdfOpenAI(file) {
  const model = getAiSettings().model || "gpt-4o";
  const gate = canMakeAiRequest();
  if (!gate.ok) throw new Error("Limit AI lub brak klucza");

  let fileId = null;
  try {
    fileId = await openaiUploadFile(file);
  } catch (e) {
    throw new Error(`Upload PDF do OpenAI nie powiódł się: ${e.message}`);
  }

  const key = getOpenAiApiKey();
  try {
    let lastText = "";
    let lastUsage = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: INVOICE_JSON_PROMPT },
                { type: "file", file: { file_id: fileId } },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t.slice(0, 280));
      }

      const j = await res.json();
      const text = j.choices?.[0]?.message?.content || "";
      lastText = text;
      lastUsage = j.usage;
      const total = j.usage?.total_tokens ?? 0;
      recordUsage(total, { type: "invoice_pdf", model, attempt });

      const parsed = extractJsonObject(text);
      const hasCore =
        parsed &&
        (String(parsed.numer_faktury ?? "").trim() || String(parsed.nazwa_kontrahenta ?? "").trim());
      if (hasCore) {
        return { parsed, rawText: text, usage: j.usage };
      }
    }

    return {
      parsed: extractJsonObject(lastText),
      rawText: lastText,
      usage: lastUsage,
    };
  } finally {
    await openaiDeleteFile(fileId);
  }
}

function normalizeInvoiceConfidence(raw) {
  if (!raw || typeof raw !== "object") return {};
  const keyMap = {
    numer_faktury: "invoice_number",
    nazwa_kontrahenta: "contractor_name",
    nip_kontrahenta: "contractor_nip",
    kwota_brutto: "amount",
    kwota_netto: "net_amount",
    kwota_vat: "vat_amount",
    waluta: "currency",
    data_wystawienia: "issue_date",
    termin_platnosci: "payment_deadline",
    pozycje: "invoice_lines",
    uwagi: "position",
    numer_zamowienia: "order_number",
  };
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = keyMap[k] || k;
    out[nk] = v;
  }
  return out;
}

export function mapOpenAiInvoiceJsonToInternal(j, { pdf_url, fileName } = {}) {
  if (!j) return null;
  const pozycje = Array.isArray(j.pozycje) ? j.pozycje : [];
  const lines = pozycje.length ? JSON.stringify(pozycje) : "";
  const uwagi = String(j.uwagi ?? "").trim();
  const typ = String(j.typ_dokumentu ?? "").trim();
  const typNorm = typ.toLowerCase();
  const typNote =
    typ && typNorm !== "fv" && !typNorm.startsWith("faktura")
      ? `typ dokumentu: ${typ}`
      : typNorm === "korekta" || /korekt/i.test(uwagi)
        ? "dokument korygujący"
        : "";
  const positionMerged = [uwagi, typNote].filter(Boolean).join(" | ");
  const inv = {
    invoice_number: j.numer_faktury || "",
    contractor_name: j.nazwa_kontrahenta || "",
    contractor_nip: j.nip_kontrahenta || "",
    amount: Number(j.kwota_brutto) || 0,
    net_amount: Number(j.kwota_netto) || null,
    vat_amount: Number(j.kwota_vat) || null,
    currency: (j.waluta || "PLN").toUpperCase(),
    issue_date: j.data_wystawienia || "",
    payment_deadline: j.termin_platnosci || "",
    position: positionMerged || uwagi,
    order_number: j.numer_zamowienia || "",
    invoice_lines: lines,
    pdf_url: pdf_url || "",
    fileName: fileName || "",
    format: "pdf",
    category: "standard",
    _aiConfidence: normalizeInvoiceConfidence(j._confidence),
    _aiHighlight: {
      invoice_number: true,
      contractor_name: true,
      contractor_nip: true,
      amount: true,
      net_amount: true,
      vat_amount: true,
      currency: true,
      issue_date: true,
      payment_deadline: true,
      position: true,
      invoice_lines: Boolean(lines),
    },
  };
  return inv;
}
