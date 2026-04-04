/**
 * Proste wyciąganie pól z surowego tekstu faktury (bez LLM).
 * Dokładność zależy od layoutu PDF — dla skanów bez warstwy tekstu zwróć null.
 */

const NIP_RE = /\b(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})\b/g;

function normalizeNip(s) {
  return String(s || "").replace(/\D/g, "");
}

function validNip10(d) {
  if (d.length !== 10) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(d[i]) * w[i];
  const c = sum % 11;
  const ctrl = c === 10 ? 0 : c;
  return ctrl === Number(d[9]);
}

/** Najpewniejszy NIP (10 cyfr, suma kontrolna). */
export function extractNip(text) {
  const t = String(text || "");
  const seen = new Map();
  let m;
  const re = new RegExp(NIP_RE.source, "g");
  while ((m = re.exec(t)) !== null) {
    const d = normalizeNip(m[1]);
    if (d.length === 10 && validNip10(d)) seen.set(d, (seen.get(d) || 0) + 1);
  }
  if (seen.size === 0) return "";
  return [...seen.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const INV_NUM_PATTERNS = [
  /(?:faktur[aę]?\s*(?:VAT\s*)?|Faktur[aę]?\s*(?:VAT\s*)?)nr\.?\s*[:\s]*([A-Z0-9][A-Z0-9\/\-\s]{4,40})/i,
  /(?:numer|Nr\.?)\s*faktur[yę]?\s*[:\s]+([A-Z0-9][A-Z0-9\/\-\s]{4,40})/i,
  /\b(FA\s*\d+\/\d+\/\d+|[\d]{4}\/[\d]{1,4}\/\d{4}\/[A-Z0-9]+)\b/i,
  /\b(FV\s*[\d\/A-Z-]{6,})\b/i,
];

export function extractInvoiceNumber(text) {
  const t = String(text || "");
  for (const re of INV_NUM_PATTERNS) {
    const m = t.match(re);
    if (!m) continue;
    const v = String(m[1] || m[0] || "")
      .replace(/\s+/g, " ")
      .trim();
    if (v.length >= 3) return v;
  }
  return "";
}

const AMOUNT_PATTERNS = [
  /(?:do\s+zapłaty|razem\s+z\s*VAT|wartość\s*brutto|brutto)[^\d]{0,24}([\d\s]+[,.]\d{2})\s*(?:PLN|zł)?/i,
  /([\d\s]+[,.]\d{2})\s*PLN(?!\s*[\/])/gi,
];

function parsePlAmount(s) {
  const n = String(s)
    .replace(/\s/g, "")
    .replace(",", ".");
  const v = Number.parseFloat(n);
  return Number.isFinite(v) ? Math.abs(v) : 0;
}

export function extractGrossAmount(text) {
  const t = String(text || "");
  let best = 0;
  for (const re of AMOUNT_PATTERNS) {
    const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let m;
    while ((m = r.exec(t)) !== null) {
      const v = parsePlAmount(m[1]);
      if (v > best && v < 1e12) best = v;
    }
  }
  return best;
}

const DATE_RE = /\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/g;

export function extractIssueDate(text) {
  const t = String(text || "");
  const m = t.match(DATE_RE);
  if (!m || !m.length) return "";
  const first = m[0].replace(/\//g, ".").replace(/-/g, ".");
  return first;
}

/** Krótki fragment po etykiecie „sprzedawca” (bardzo przybliżony). */
export function extractSellerHint(text) {
  const t = String(text || "");
  const low = t.toLowerCase();
  const i = low.indexOf("sprzedawca");
  if (i < 0) return "";
  const slice = t.slice(i, i + 400);
  const after = slice.replace(/^[\s\S]*?sprzedawca\s*/i, "").trim();
  const stop = after.search(/\n\s*(nabywca|buyer|dane\s+nabywcy)/i);
  const chunk = stop > 0 ? after.slice(0, stop) : after.slice(0, 200);
  const line = chunk.split(/\n|  +/)[0] || chunk;
  return line.replace(/^\W+/, "").trim().slice(0, 120);
}

/**
 * Blok sprzedawcy → nazwa firmy (wiele linii), do faktury zakupu jako kontrahent.
 */
export function extractContractorNameFromInvoiceText(text) {
  const t = String(text || "");
  const startRe = /\b(sprzedawca|wystawca|dostawca|seller|vendor)\b\s*[:.]?\s*/i;
  const sm = startRe.exec(t);
  if (!sm) return extractSellerHint(t);

  const from = sm.index + sm[0].length;
  const tail = t.slice(from);
  const endRe = /\b(nabywca|nabywcy|odbiorca|buyer|customer|dane\s+nabywcy)\b/i;
  const em = endRe.exec(tail);
  const block = (em ? tail.slice(0, em.index) : tail.slice(0, 1400)).trim();

  const lines = block
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);

  const parts = [];
  for (const line of lines) {
    if (/^nip\s*[:\s]?\d/i.test(line)) break;
    if (/^regon\b/i.test(line)) break;
    if (/^krs\b/i.test(line)) break;
    if (/^(ul\.?|al\.?|os\.)\s+/i.test(line) && line.length < 70) {
      if (parts.length > 0) break;
      continue;
    }
    if (/^\d{2}-?\d{3}\s+[a-ząćęłńóśźż]/i.test(line) && line.length < 55) {
      if (parts.length > 0) break;
      continue;
    }
    if (/^tel\.?:?\s*\d/i.test(line)) break;
    if (/^e-?mail/i.test(line)) break;
    if (/^[\d\s\-/.]{8,}$/.test(line) && !/[a-ząćęłńóśźż]/i.test(line)) continue;
    if (line.length < 2) continue;
    parts.push(line);
    if (parts.join(" ").length >= 200) break;
    if (parts.length >= 4) break;
  }

  const name = parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 240);
  return name || extractSellerHint(t);
}

/** NIP sprzedawcy — pierwszy poprawny NIP w sekcji Sprzedawca (przed Nabywca), inaczej jak wcześniej. */
export function extractNipNearSeller(text) {
  const t = String(text || "");
  const sm = /\b(sprzedawca|wystawca)\b/i.exec(t);
  if (!sm) return extractNip(t);
  const from = sm.index;
  const tail = t.slice(from + 10);
  const em = /\b(nabywca|nabywcy|buyer|dane\s+nabywcy)\b/i.exec(tail);
  const end = em ? from + 10 + em.index : Math.min(from + 2000, t.length);
  const region = t.slice(from, end);
  const nip = extractNip(region);
  return nip || extractNip(t);
}

/**
 * @returns {object|null} pola zbliżone do wewnętrznego wiersza faktury lub null
 */
export function heuristicInvoiceFromPdfText(rawText, fileName) {
  const text = String(rawText || "").trim();
  if (text.length < 30) return null;

  const nip = extractNipNearSeller(text);
  const invoice_number = extractInvoiceNumber(text);
  const amount = extractGrossAmount(text);
  const issue_date = extractIssueDate(text);
  const contractor_name = extractContractorNameFromInvoiceText(text);

  if (!invoice_number && !contractor_name && !nip) return null;

  return {
    invoice_number: invoice_number || "",
    contractor_name: contractor_name || "",
    contractor_nip: nip || "",
    amount: amount || 0,
    net_amount: null,
    vat_amount: null,
    currency: "PLN",
    issue_date: issue_date || "",
    payment_deadline: "",
    position: "",
    order_number: "",
    invoice_lines: "",
    pdf_url: "",
    fileName: fileName || "",
    format: "pdf",
    category: "standard",
    payer: "",
    hotel_name: "",
    city: "",
    persons_count: null,
    stay_period: "",
    is_paragon: false,
    is_paid: false,
    is_own_company_seller: false,
  };
}
