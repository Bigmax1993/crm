import { claudeInvokeWithFile, isClaudeConfigured, extractJsonObject } from "@/lib/openai-crm";
import { normalizeLvLines, sumLvLines } from "@/lib/lv-schema";

export const LV_JSON_PROMPT = `Du bist Experte für deutsche Bauunterlagen: Leistungsverzeichnis (LV), GAEB, Kostenvoranschlag, Angebot mit Positionsliste (Bodenbeläge / Marktumbau / Einzelhandel).

AUFGABE: Extrahiere aus dem PDF ein LV für ein Bauprojekt (Kostenschätzung der Arbeiten).

AUSGABE: nur ein JSON-Objekt (kein Markdown).

Felder:
- nummer_lv — LV-/Angebots-/Vergabenr.
- titel — Objekt / Baustelle / Markt
- datum — YYYY-MM-DD
- auftraggeber — Auftraggeber / Kunde / Filiale
- baustelle — Adresse oder Standort (Stadt, Straße)
- vergabenummer — Vergabe-/Bestellnr. falls vorhanden
- nettosumme — Summe netto (Zahl)
- bruttosumme — Summe brutto (Zahl, optional)
- mwst_prozent — z.B. 19
- waehrung — EUR
- uwagi — kurze Notiz (z.B. „GAEB“, „Nachtrag“)
- pozycje — Array (max. 60 wichtigste Positionen):
  { "oz": "1.2.3", "leistung": "Estrich einbauen …", "einheit": "m²", "menge": 0, "einzelpreis": 0, "gesamtpreis": 0 }

Regeln:
- Deutsche Dezimalzahlen: 1.234,56 → im JSON als Zahl 1234.56
- Einheiten: m², m, Stk, psch, h, t, kg
- Lies alle Seiten; Summen aus „Nettosumme“ / „Gesamtsumme“ / „Summe“
- Erfinde keine Positionen; leere Felder als "" oder 0

Schema:
{
  "nummer_lv": "",
  "titel": "",
  "datum": "YYYY-MM-DD",
  "auftraggeber": "",
  "baustelle": "",
  "vergabenummer": "",
  "nettosumme": 0,
  "bruttosumme": 0,
  "mwst_prozent": 19,
  "waehrung": "EUR",
  "uwagi": "",
  "pozycje": [{ "oz": "1", "leistung": "", "einheit": "m²", "menge": 0, "einzelpreis": 0, "gesamtpreis": 0 }]
}`;

const LV_NUM_PATTERNS = [
  /(?:leistungsverzeichnis|LV|GAEB|kostenvoranschlag|angebot)\s*(?:nr\.?|no\.?)?\s*[:\s#]*([A-Z0-9][A-Z0-9\/\-\.\s]{2,40})/i,
  /\b(LV[\s\-\/]?\d[\w\-\/\.]*)\b/i,
];

function parseDeNumber(s) {
  if (s == null || s === "") return 0;
  const t = String(s).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function extractDeDate(text) {
  const m = String(text).match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/);
  if (!m) return "";
  let y = m[3];
  if (y.length === 2) y = `20${y}`;
  const mm = m[2].padStart(2, "0");
  const dd = m[1].padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function extractGermanTotals(text) {
  const t = String(text);
  let total_net = 0;
  let total_gross = 0;
  const netM = t.match(/(?:nettosumme|summe\s+netto|gesamt\s+netto)[^\d]{0,30}([\d.\s]+,\d{2})/i);
  const grossM = t.match(/(?:bruttosumme|summe\s+brutto|gesamt\s+brutto|gesamtsumme)[^\d]{0,30}([\d.\s]+,\d{2})/i);
  if (netM) total_net = parseDeNumber(netM[1]);
  if (grossM) total_gross = parseDeNumber(grossM[1]);
  return { total_net, total_gross };
}

export function heuristicLvFromText(text, fileName = "") {
  const t = String(text || "");
  if (t.length < 30 && !fileName) return null;

  let document_number = "";
  for (const re of LV_NUM_PATTERNS) {
    const m = t.match(re);
    if (m?.[1]) {
      document_number = String(m[1]).replace(/\s+/g, " ").trim();
      break;
    }
  }
  if (!document_number && /lv/i.test(fileName)) {
    const fm = fileName.match(/(LV[\w\-_.]+)/i);
    if (fm) document_number = fm[1];
  }

  const clientM = t.match(/(?:auftraggeber|kunde|besteller|bauherr)[:\s]+([^\n]{3,80})/i);
  const siteM = t.match(/(?:baustelle|objekt|standort|filiale|markt)[:\s]+([^\n]{3,120})/i);
  const titleM = t.match(/(?:projekt|objekt|titel|betreff)[:\s]+([^\n]{3,100})/i);
  const orderM = t.match(/(?:vergabenummer|bestellnummer|auftragsnummer|po)[:\s#]+([A-Z0-9][\w\-\/\.]{2,40})/i);

  const { total_net, total_gross } = extractGermanTotals(t);

  const lines = [];
  const rowRe = /(\d{1,2}(?:\.\d{1,2}){0,3})\s+([A-Za-zÄÖÜäöüß][^\n]{10,120}?)\s+([\d.,]+)\s+(m²|m2|m|stk|psch|h)\s+([\d.,]+)\s+([\d.,]+)/gi;
  let rm;
  let count = 0;
  while ((rm = rowRe.exec(t)) !== null && count < 40) {
    lines.push({
      position: rm[1],
      description: rm[2].trim(),
      quantity: parseDeNumber(rm[3]),
      unit: rm[4].replace("m2", "m²"),
      unit_price: parseDeNumber(rm[5]),
      line_total: parseDeNumber(rm[6]),
    });
    count += 1;
  }

  if (!document_number && !clientM && lines.length === 0 && total_net === 0) return null;

  return mapLvJsonToInternal({
    nummer_lv: document_number,
    datum: extractDeDate(t),
    auftraggeber: clientM?.[1]?.trim() || "",
    baustelle: siteM?.[1]?.trim() || "",
    titel: titleM?.[1]?.trim() || siteM?.[1]?.trim() || "",
    vergabenummer: orderM?.[1]?.trim() || "",
    nettosumme: total_net,
    bruttosumme: total_gross,
    pozycje: lines.map((l) => ({
      oz: l.position,
      leistung: l.description,
      einheit: l.unit,
      menge: l.quantity,
      einzelpreis: l.unit_price,
      gesamtpreis: l.line_total,
    })),
  });
}

export function mapLvJsonToInternal(j, { fileName } = {}) {
  if (!j) return null;
  const lines = normalizeLvLines(
    (j.pozycje || j.positions || j.lines || []).map((p) => ({
      position: p.oz ?? p.position ?? p.pos,
      description: p.leistung ?? p.description ?? p.beschreibung,
      unit: p.einheit ?? p.unit,
      quantity: p.menge ?? p.quantity,
      unit_price: p.einzelpreis ?? p.unit_price,
      line_total: p.gesamtpreis ?? p.line_total,
    }))
  );
  const total_net =
    j.nettosumme != null && j.nettosumme !== ""
      ? Number(j.nettosumme)
      : j.total_net != null
        ? Number(j.total_net)
        : lines.length
          ? sumLvLines(lines)
          : null;
  return {
    document_number: String(j.nummer_lv ?? j.document_number ?? "").trim(),
    title: String(j.titel ?? j.title ?? "").trim(),
    issue_date: String(j.datum ?? j.issue_date ?? "").trim(),
    client_name: String(j.auftraggeber ?? j.client_name ?? "").trim(),
    site_address: String(j.baustelle ?? j.site_address ?? "").trim(),
    order_number: String(j.vergabenummer ?? j.order_number ?? "").trim(),
    notes: String(j.uwagi ?? j.notes ?? "").trim(),
    currency: "EUR",
    total_net: total_net,
    total_gross: j.bruttosumme != null ? Number(j.bruttosumme) : j.total_gross != null ? Number(j.total_gross) : null,
    vat_percent: j.mwst_prozent != null ? Number(j.mwst_prozent) : 19,
    lines,
    fileName: fileName || "",
    status: "active",
    country: "DE",
  };
}

export async function extractLvFromPdfClaude(file) {
  const parsed = await claudeInvokeWithFile({ prompt: LV_JSON_PROMPT, file, max_tokens: 8192 });
  return { parsed, rawText: JSON.stringify(parsed) };
}

export async function extractLvFromPdf(file) {
  const { extractPlainTextFromPdfWithOcrFallback } = await import("@/lib/invoice-pdf-plain-text");
  let plain = "";
  try {
    plain = await extractPlainTextFromPdfWithOcrFallback(file);
  } catch {
    /* ignore */
  }

  const heur = heuristicLvFromText(plain, file.name);
  const heurOk =
    heur &&
    (heur.document_number?.trim() ||
      heur.client_name?.trim() ||
      normalizeLvLines(heur.lines).length >= 2 ||
      (heur.total_net && heur.total_net > 0));

  if (heurOk) {
    return { mapped: { ...heur, fileName: file.name, _extractionSource: "heuristic" }, plain };
  }

  if (isClaudeConfigured()) {
    try {
      const { parsed } = await extractLvFromPdfClaude(file);
      const mapped = mapLvJsonToInternal(parsed, { fileName: file.name });
      if (
        mapped &&
        (mapped.document_number?.trim() ||
          mapped.client_name?.trim() ||
          normalizeLvLines(mapped.lines).length ||
          mapped.total_net > 0)
      ) {
        return { mapped: { ...mapped, _extractionSource: "claude" }, plain };
      }
    } catch (e) {
      console.warn("Claude LV extraction:", e);
      throw e;
    }
  }

  if (heur) return { mapped: { ...heur, fileName: file.name, _extractionSource: "heuristic" }, plain };
  return { mapped: null, plain };
}

/** Parsuje wklejony JSON (np. eksport GAEB jako JSON). */
export function parseLvFromJsonText(text) {
  const j = extractJsonObject(text);
  if (!j) return null;
  return mapLvJsonToInternal(j);
}
