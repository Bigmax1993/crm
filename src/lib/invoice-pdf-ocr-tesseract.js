import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let pdfWorkerConfigured = false;

function ensurePdfWorker() {
  if (pdfWorkerConfigured || typeof window === "undefined") return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  pdfWorkerConfigured = true;
}

/**
 * OCR skanu PDF (strony jako obrazy) — Tesseract.js w przeglądarce.
 * W dev z nagłówkami COOP/COEP ładowanie rdzenia z CDN może się nie udać; wtedy zwracany jest pusty string (obsłuży try/catch wyżej).
 *
 * @param {File} file
 * @param {{ maxPages?: number, scale?: number }} [options]
 */
export async function ocrPdfFileToPlainText(file, { maxPages = 12, scale = 2 } = {}) {
  if (typeof document === "undefined") return "";

  ensurePdfWorker();

  const [tessMod, workerUrlMod, coreUrlMod] = await Promise.all([
    import("tesseract.js"),
    import("tesseract.js/dist/worker.min.js?url"),
    import("tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url"),
  ]);

  const T = tessMod.default ?? tessMod;
  const createWorker = T.createWorker;
  const OEM = T.OEM;
  const workerPath = workerUrlMod.default;
  const corePath = coreUrlMod.default;

  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const n = Math.min(doc.numPages, maxPages);

  const worker = await createWorker("pol+eng", OEM.LSTM_ONLY, {
    workerPath,
    corePath,
    logger: () => {},
  });

  const parts = [];
  try {
    for (let p = 1; p <= n; p += 1) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const task = page.render({ canvasContext: ctx, viewport });
      await task.promise;
      const { data } = await worker.recognize(canvas);
      if (data.text?.trim()) parts.push(data.text.trim());
    }
  } finally {
    await worker.terminate();
  }

  return parts.join("\n\n").replace(/\s+\n/g, "\n").trim();
}
