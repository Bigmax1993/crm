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
