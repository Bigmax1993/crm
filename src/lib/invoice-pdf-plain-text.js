import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let workerConfigured = false;

function ensureWorker() {
  if (workerConfigured || typeof window === "undefined") return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerConfigured = true;
}

/**
 * Łączy tekst z warstwy tekstowej PDF (działa dla „cyfrowych” PDF-ów, nie dla skanów jako samych obrazków).
 */
export async function extractPlainTextFromPdf(file) {
  ensureWorker();
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const parts = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const line = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    parts.push(line);
  }
  return parts.join("\n").replace(/\s+/g, " ").trim();
}

/** Heurystyka: czy wygląda na skan / pustą warstwę tekstu (wtedy warto uruchomić Tesseract). */
export function pdfTextLooksLikeScanned(plain) {
  const t = String(plain || "").trim();
  if (t.length < 120) return true;
  const alnum = (t.match(/[A-Za-zĄąĆćĘęŁłŃńÓóŚśŹźŻż0-9]/g) || []).length;
  if (alnum < 55) return true;
  return false;
}

/**
 * Najpierw warstwa tekstowa (pdf.js); przy skanie — OCR Tesseract na renderze stron (pol+eng).
 * W środowisku bez `window` / `document` (testy Node) zwraca tylko warstwę tekstową.
 */
export async function extractPlainTextFromPdfWithOcrFallback(file) {
  let plain = "";
  try {
    plain = await extractPlainTextFromPdf(file);
  } catch (e) {
    console.warn("PDF tekst (pdf.js):", e);
  }

  if (!pdfTextLooksLikeScanned(plain)) return plain;
  if (typeof window === "undefined" || typeof document === "undefined") return plain;

  try {
    const { ocrPdfFileToPlainText } = await import("@/lib/invoice-pdf-ocr-tesseract");
    const ocr = await ocrPdfFileToPlainText(file);
    if (!ocr) return plain;
    if (!plain.trim()) return ocr;
    return `${plain}\n\n${ocr}`;
  } catch (e) {
    console.warn("PDF OCR (Tesseract):", e);
    return plain;
  }
}
