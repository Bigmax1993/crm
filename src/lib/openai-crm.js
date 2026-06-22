import { getInvoicePdfOcrAttemptCount } from "@/lib/invoice-ocr-prompts";

const LS_SETTINGS = "fakturowo_ai_settings_v1";
const LS_USAGE = "fakturowo_ai_usage_v1";
const LS_HISTORY = "fakturowo_ai_history_v1";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Aktualne modele API (czerwiec 2026 — Sonnet 4.0 wycofany 2025-06-15). */
export const CLAUDE_MODEL_OPTIONS = [
  { value: "claude-sonnet-4-6", label: "claude-sonnet-4.6" },
  { value: "claude-haiku-4-5", label: "claude-haiku-4.5" },
];

const RETIRED_CLAUDE_MODELS = {
  "claude-sonnet-4-20250514": "claude-sonnet-4-6",
  "claude-sonnet-4-0": "claude-sonnet-4-6",
  "claude-3-5-haiku-20241022": "claude-haiku-4-5",
  "cla-4-20250514": "claude-sonnet-4-6",
};

export function normalizeClaudeModel(model) {
  const m = String(model ?? "").trim();
  if (!m) return CLAUDE_MODEL_OPTIONS[0].value;
  if (RETIRED_CLAUDE_MODELS[m]) return RETIRED_CLAUDE_MODELS[m];
  if (m.startsWith("gpt-")) return CLAUDE_MODEL_OPTIONS[0].value;
  if (/20250514|sonnet-4-2025/i.test(m)) return CLAUDE_MODEL_OPTIONS[0].value;
  if (CLAUDE_MODEL_OPTIONS.some((o) => o.value === m)) return m;
  if (!m.startsWith("claude-")) return CLAUDE_MODEL_OPTIONS[0].value;
  return m;
}

const DEFAULT_SETTINGS = {
  apiKeyOverride: "",
  model: "claude-sonnet-4-6",
  language: "pl",
  alertIntervalHours: 24,
  dailyQueryLimit: 50,
  dailyTokenLimit: 200000,
};

export function getAiSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    const parsed = raw ? JSON.parse(raw) : {};
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    const normalizedModel = normalizeClaudeModel(merged.model);
    if (normalizedModel !== merged.model) {
      merged.model = normalizedModel;
      try {
        localStorage.setItem(LS_SETTINGS, JSON.stringify(merged));
      } catch {
        /* quota */
      }
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAiSettings(partial) {
  const next = { ...getAiSettings(), ...partial };
  if (partial.model != null) {
    next.model = normalizeClaudeModel(partial.model);
  }
  localStorage.setItem(LS_SETTINGS, JSON.stringify(next));
  window.dispatchEvent(new Event("fakturowo-ai-settings"));
  return next;
}

/** Klucz Anthropic Claude (env lub nadpisanie w ustawieniach). */
export function getClaudeApiKey() {
  const env = (
    import.meta.env?.VITE_ANTHROPIC_API_KEY ||
    import.meta.env?.VITE_CLAUDE_API_KEY ||
    ""
  ).trim();
  const override = (getAiSettings().apiKeyOverride || "").trim();
  return override || env;
}

/** @deprecated alias — używaj getClaudeApiKey */
export const getOpenAiApiKey = getClaudeApiKey;

export function isClaudeConfigured() {
  return Boolean(getClaudeApiKey());
}

/** @deprecated alias — używaj isClaudeConfigured */
export const isOpenAiConfigured = isClaudeConfigured;

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
  if (!isClaudeConfigured()) return { ok: false, reason: "no_key" };
  if (u.requests >= s.dailyQueryLimit) return { ok: false, reason: "queries" };
  if (u.tokens >= s.dailyTokenLimit) return { ok: false, reason: "tokens" };
  return { ok: true };
}

/** Szacunek ~USD dla Claude Sonnet (orientacyjnie). */
export function estimateCostUsd(approxTotalTokens = 1500) {
  const per1k = 0.003;
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

function splitMessagesForClaude(messages) {
  let system = "";
  const claudeMessages = [];
  for (const m of messages) {
    if (m.role === "system") {
      const part = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      system = system ? `${system}\n\n${part}` : part;
    } else if (m.role === "user" || m.role === "assistant") {
      claudeMessages.push({ role: m.role, content: m.content });
    }
  }
  return { system: system || undefined, messages: claudeMessages };
}

function extractClaudeText(response) {
  const blocks = response?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");
}

function claudeUsageTotal(usage) {
  return (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("Nie udało się odczytać pliku jako base64"));
    reader.readAsDataURL(file);
  });
}

async function claudeMessagesRequest({ model, max_tokens, temperature, system, messages }) {
  const key = getClaudeApiKey();
  if (!key) throw new Error("Brak klucza Claude (VITE_ANTHROPIC_API_KEY lub Ustawienia AI)");

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens,
      temperature,
      ...(system ? { system } : {}),
      messages,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 280) || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function claudeChatCompletions({ messages, max_tokens = 2500, temperature = 0.2, model: modelOverride }) {
  const gate = canMakeAiRequest();
  if (!gate.ok) {
    if (gate.reason === "queries") throw new Error("Osiągnięto dzienny limit zapytań AI");
    if (gate.reason === "tokens") throw new Error("Osiągnięto dzienny limit tokenów AI");
    throw new Error("AI niedostępna");
  }

  const model = modelOverride || getAiSettings().model || DEFAULT_SETTINGS.model;
  const { system, messages: claudeMessages } = splitMessagesForClaude(messages);

  const j = await claudeMessagesRequest({
    model,
    max_tokens,
    temperature,
    system,
    messages: claudeMessages,
  });

  const text = extractClaudeText(j);
  const total = claudeUsageTotal(j.usage);
  recordUsage(total, { type: "chat", model });
  return { text, usage: j.usage, model };
}

/** @deprecated alias — używaj claudeChatCompletions */
export const openaiChatCompletions = claudeChatCompletions;

/**
 * Jedno zapytanie Claude z załączonym plikiem (PDF lub obraz).
 */
export async function claudeInvokeWithFile({ prompt, file, model: modelOverride, response_json_schema }) {
  const gate = canMakeAiRequest();
  if (!gate.ok) throw new Error("Limit zapytań AI lub brak konfiguracji.");

  const model = modelOverride || getAiSettings().model || DEFAULT_SETTINGS.model;
  const base64 = await fileToBase64(file);
  const mediaType = file.type || "application/pdf";
  const extra = response_json_schema
    ? "\n\nZwróć wyłącznie jeden obiekt JSON zgodny z przekazanym schematem (bez markdown)."
    : "";

  const j = await claudeMessagesRequest({
    model,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64,
            },
          },
          { type: "text", text: `${prompt}${extra}` },
        ],
      },
    ],
  });

  const text = extractClaudeText(j);
  recordUsage(claudeUsageTotal(j.usage), { type: "local_invoke_llm", model });

  const parsed = extractJsonObject(text);
  if (parsed) return parsed;
  throw new Error("Odpowiedź AI nie zawiera poprawnego JSON.");
}

/** Prompt JSON (Claude + Base44 InvokeLLM) — ten sam kształt co `mapOpenAiInvoiceJsonToInternal`. */
export const INVOICE_JSON_PROMPT = `Tryb MAKSYMALNEJ DOKŁADNOŚCI: traktuj PDF jak skan — czytaj sekcja po sekcji (nagłówek → sprzedawca → nabywca → pozycje → podsumowanie VAT → do zapłaty). Rozróżniaj O/0, l/1, przecinek dziesiętny od tysięcy (PL). Przy niepewności zostaw pole puste.

WIELOSTRONOWE PDF: obowiązkowo przejrzyj WSZYSTKIE strony. Numer faktury i „Razem” / „Do zapłaty” bywają na pierwszej lub ostatniej; tabela VAT i podsumowanie — zwykle pod listą pozycji. Przy kilku kwotach brutto wybierz tę z sekcji podsumowania / płatności, nie z pojedynczej pozycji.

Jesteś ekspertem od ekstrakcji danych z faktur (Polska, UE) do systemu ERP. Użytkownik zweryfikuje pola ręcznie — priorytetem jest zgodność z dokumentem, nie domysły.

SPRZEDAWCA i NABYWCA — ZAWSZE OSOBNO (nigdy nie mieszaj pól):
- nazwa_sprzedawcy + nip_sprzedawcy = WYŁĄCZNIE podmiot z bloku „Sprzedawca” / „Wystawca” / „Seller” na fakturze (kto wystawił dokument).
- nazwa_nabywcy + nip_nabywcy = WYŁĄCZNIE podmiot z bloku „Nabywca” / „Nabywca towaru lub usług” / „Buyer” (druga strona transakcji).
- To są dwa różne podmioty — nie kopiuj nazwy sprzedawcy do nabywcy ani odwrotnie; nie scalaj ich w jedno pole.

WYJŚCIE:
- Zwróć WYŁĄCZNIE jeden obiekt JSON (bez markdown, bez komentarzy, bez tekstu przed/po).
- Brakujące pole: pusty string "" lub 0 lub pusta tablica [] — spójnie z typem pola.
- Nie wymyślaj numeru faktury, NIP-u ani kwot, jeśli nie widać ich w dokumencie.

Odczyt nazw: pełna nazwa handlowa z właściwego bloku; wielolinijkowe nazwy scal w jeden ciąg; adres (ul./kod) pomiń, jeśli da się oddzielić od nazwy firmy. Jeśli któryś blok nieczytelny — "" dla tej strony, nie uzupełniaj z drugiej strony.

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

NIP (PL): 10 cyfr przy właściwym podmiocie — nip_sprzedawcy tylko dla sprzedawcy, nip_nabywcy tylko dla nabywcy.

POZOSTAŁE:
- numer_zamowienia: z pola zamówienie / order / nr zlecenia jeśli jest.
- numer_konta: rachunek do przelewu jeśli widoczny.
- uwagi: krótki opis pozycji głównej lub uwagi ze stopki (nie duplikuj całej treści dokumentu).

_CONFIDENCE (0–100 dla kluczy angielskich):
invoice_number, seller_name, seller_nip, contractor_name, contractor_nip, amount, net_amount, vat_amount, currency, issue_date, payment_deadline, invoice_lines (tablica pozycje), position (uwagi), order_number.

Szablon JSON (wypełnij wartościami z PDF):
{
  "numer_faktury": "",
  "nazwa_sprzedawcy": "",
  "nip_sprzedawcy": "",
  "nazwa_nabywcy": "",
  "nip_nabywcy": "",
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
    "seller_name": 80,
    "seller_nip": 75,
    "contractor_name": 80,
    "contractor_nip": 75,
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

const AI_INVOICE_RETRY_HINTS = [
  "Ponowna analiza: sprawdź ostatnią stronę (podsumowanie VAT, „Razem”, „Do zapłaty”) oraz nagłówek pod kątem numeru faktury / „FV”.",
  "Ponowna analiza: zlokalizuj blok „Sprzedawca”/„Wystawca” i powiązany NIP (10 cyfr PL); jeśli numer faktury powtarza się — użyj wersji ze stopki lub pola „Do zapłaty”.",
  "Ponowna analiza: przy szarym lub rozmytym tekście wybierz najczęściej powtarzający się zapis; rozróżniaj separator tysięcy od dziesiętnych (PL: 1 234,56).",
  "Ponowna analiza: przeskanuj wszystkie strony po kolei; szukaj też „Nr dokumentu”, „Faktura VAT”, „Data sprzedaży” jako kontekstu dla dat i numeru.",
  "Ponowna analiza: odróżnij bezwzględnie sekcję Sprzedawca od Nabywca — nazwa_sprzedawcy/nip_sprzedawcy tylko ze sprzedawcy, nazwa_nabywcy/nip_nabywcy tylko z nabywcy; zero kopiowania między polami.",
];

export function buildOpenAiInvoiceUserText(attemptIndex) {
  if (attemptIndex === 0) return INVOICE_JSON_PROMPT;
  const hint = AI_INVOICE_RETRY_HINTS[Math.min(attemptIndex - 1, AI_INVOICE_RETRY_HINTS.length - 1)];
  return `${INVOICE_JSON_PROMPT}

---

${hint}`;
}

function invoiceHasCoreFields(parsed) {
  return (
    parsed &&
    (String(parsed.numer_faktury ?? "").trim() ||
      String(parsed.nazwa_sprzedawcy ?? "").trim() ||
      String(parsed.nazwa_nabywcy ?? "").trim() ||
      String(parsed.nazwa_kontrahenta ?? "").trim())
  );
}

/**
 * Ekstrakcja faktury z PDF przez Claude (dokument base64 w wiadomości).
 */
export async function extractInvoiceFromPdfClaude(file) {
  const model = getAiSettings().model || DEFAULT_SETTINGS.model;
  const gate = canMakeAiRequest();
  if (!gate.ok) throw new Error("Limit AI lub brak klucza");

  let base64;
  try {
    base64 = await fileToBase64(file);
  } catch (e) {
    throw new Error(`Odczyt PDF dla Claude nie powiódł się: ${e.message}`);
  }

  let lastText = "";
  let lastUsage = null;
  const maxAttempts = getInvoicePdfOcrAttemptCount();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const userPrompt = buildOpenAiInvoiceUserText(attempt);
    const j = await claudeMessagesRequest({
      model,
      max_tokens: 4096,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });

    const text = extractClaudeText(j);
    lastText = text;
    lastUsage = j.usage;
    recordUsage(claudeUsageTotal(j.usage), { type: "invoice_pdf", model, attempt });

    const parsed = extractJsonObject(text);
    if (invoiceHasCoreFields(parsed)) {
      return { parsed, rawText: text, usage: j.usage };
    }
  }

  return {
    parsed: extractJsonObject(lastText),
    rawText: lastText,
    usage: lastUsage,
  };
}

/** @deprecated alias — używaj extractInvoiceFromPdfClaude */
export const extractInvoiceFromPdfOpenAI = extractInvoiceFromPdfClaude;

const MAX_CLAUDE_XML_CHARS = 200_000;

/**
 * Ekstrakcja faktury z treści XML przez Claude (tekst w wiadomości).
 */
export async function extractInvoiceFromXmlTextClaude(xmlString, fileName = "faktura.xml") {
  const model = getAiSettings().model || DEFAULT_SETTINGS.model;
  const gate = canMakeAiRequest();
  if (!gate.ok) throw new Error("Limit AI lub brak klucza");

  const raw = String(xmlString ?? "");
  const truncated = raw.length > MAX_CLAUDE_XML_CHARS;
  const xmlPayload = truncated ? raw.slice(0, MAX_CLAUDE_XML_CHARS) : raw;
  const tailNote = truncated
    ? `\n\n(Uwaga: XML został obcięty do ${MAX_CLAUDE_XML_CHARS} znaków — ekstrahuj z dostępnego fragmentu.)`
    : "";

  let lastText = "";
  let lastUsage = null;
  const maxAttempts = getInvoicePdfOcrAttemptCount();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const basePrompt = buildOpenAiInvoiceUserText(attempt);
    const userPrompt = `${basePrompt}${tailNote}

---

Źródło: strukturalny plik XML faktury (JPK-FA, FA(2), e-faktura itp.; nazwa pliku: ${fileName}). Odczytaj sprzedawcę, nabywcę, kwoty, daty i pozycje z tagów i wartości węzłów — tak jakbyś czytał PDF, ale dane są w XML.

<<<EOF_INVOICE_XML
${xmlPayload}
EOF_INVOICE_XML`;

    const j = await claudeMessagesRequest({
      model,
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = extractClaudeText(j);
    lastText = text;
    lastUsage = j.usage;
    recordUsage(claudeUsageTotal(j.usage), { type: "invoice_xml", model, attempt });

    const parsed = extractJsonObject(text);
    if (invoiceHasCoreFields(parsed)) {
      return { parsed, rawText: text, usage: j.usage };
    }
  }

  return {
    parsed: extractJsonObject(lastText),
    rawText: lastText,
    usage: lastUsage,
  };
}

/** @deprecated alias — używaj extractInvoiceFromXmlTextClaude */
export const extractInvoiceFromXmlTextOpenAI = extractInvoiceFromXmlTextClaude;

function normalizeInvoiceConfidence(raw) {
  if (!raw || typeof raw !== "object") return {};
  const keyMap = {
    numer_faktury: "invoice_number",
    nazwa_sprzedawcy: "seller_name",
    nip_sprzedawcy: "seller_nip",
    nazwa_nabywcy: "contractor_name",
    nip_nabywcy: "contractor_nip",
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

function trimInvStr(v) {
  return String(v ?? "").trim();
}

export function mapOpenAiInvoiceJsonToInternal(j, { pdf_url, fileName } = {}) {
  if (!j) return null;
  let seller_name = trimInvStr(j.nazwa_sprzedawcy);
  let seller_nip = trimInvStr(j.nip_sprzedawcy);
  let contractor_name = trimInvStr(j.nazwa_nabywcy);
  let contractor_nip = trimInvStr(j.nip_nabywcy);
  const legacyName = trimInvStr(j.nazwa_kontrahenta);
  const legacyNip = trimInvStr(j.nip_kontrahenta);
  if (!seller_name && !contractor_name && legacyName) {
    seller_name = legacyName;
    seller_nip = legacyNip || seller_nip;
  }
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
    seller_name,
    seller_nip,
    contractor_name,
    contractor_nip,
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
      seller_name: true,
      seller_nip: true,
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
