import {
  extractJsonObject,
  claudeChatCompletions,
  claudeInvokeWithFile,
  isClaudeConfigured,
  getAiSettings,
  canMakeAiRequest,
  aiGateErrorMessage,
} from "@/lib/openai-crm";
import { putBlob } from "@/lib/blob-file-store";
import { resolveStoredFileUrl } from "@/lib/resolve-stored-file-url";

/** Małe obrazy mogą zostać jako data URL; PDF i większe pliki → IndexedDB. */
const INLINE_MAX_BYTES = 120_000;

function approxDataUrlBytes(dataUrl) {
  const i = dataUrl.indexOf(",");
  if (i < 0) return dataUrl.length;
  return Math.ceil((dataUrl.length - i - 1) * 0.75);
}

async function blobFromUploadInput(file) {
  if (file instanceof File || file instanceof Blob) return file;
  if (file instanceof ArrayBuffer) return new Blob([file]);
  if (ArrayBuffer.isView(file)) return new Blob([file.buffer]);
  if (typeof file === "string" && file.startsWith("data:")) {
    const res = await fetch(file);
    return res.blob();
  }
  return null;
}

/**
 * Lokalny odpowiednik Core.UploadFile — małe pliki jako data URL, duże w IndexedDB.
 */
export async function localUploadFile({ file }) {
  if (typeof file === "string" && file.startsWith("data:")) {
    if (approxDataUrlBytes(file) > INLINE_MAX_BYTES) {
      const blob = await blobFromUploadInput(file);
      if (!blob) throw new Error("UploadFile (lokalny): nie udało się odczytać data URL.");
      const ref = await putBlob(blob);
      return { url: ref };
    }
    return { url: file };
  }

  const blob = await blobFromUploadInput(file);
  if (!blob) {
    throw new Error("UploadFile (lokalny): oczekiwano File, Blob, ArrayBuffer lub data URL.");
  }

  const name = file instanceof File ? file.name : "";
  const isPdf = blob.type === "application/pdf" || /\.pdf$/i.test(name);

  if (isPdf || blob.size > INLINE_MAX_BYTES) {
    const ref = await putBlob(blob, { name, type: blob.type });
    return { url: ref };
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Nie udało się odczytać pliku do wgrania."));
    reader.readAsDataURL(blob);
  });

  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new Error("UploadFile (lokalny): nie udało się zbudować data URL.");
  }
  return { url: dataUrl };
}

/**
 * Lokalny odpowiednik Core.InvokeLLM — Claude (wymaga klucza w ustawieniach lub VITE_ANTHROPIC_API_KEY).
 */
export async function localInvokeLLM({ prompt, file_urls, response_json_schema }) {
  if (!isClaudeConfigured()) {
    throw new Error(
      "Tryb lokalny CRM: ustaw klucz Claude (Ustawienia AI lub VITE_ANTHROPIC_API_KEY), aby użyć AI (OCR/przelewy)."
    );
  }
  const gate = canMakeAiRequest();
  if (!gate.ok) throw new Error(aiGateErrorMessage(gate));

  const model = getAiSettings().model || "claude-sonnet-4-6";

  if (file_urls?.length) {
    const resolvedUrl = await resolveStoredFileUrl(file_urls[0]);
    const res = await fetch(resolvedUrl);
    if (!res.ok) throw new Error(`Odczyt pliku dla AI nie powiódł się (HTTP ${res.status}).`);
    const blob = await res.blob();
    const fname = blob.type?.includes("pdf") ? "document.pdf" : "upload.bin";
    const upload = new File([blob], fname, { type: blob.type || "application/octet-stream" });
    return claudeInvokeWithFile({ prompt, file: upload, model, response_json_schema });
  }

  const extra = response_json_schema
    ? "\n\nZwróć wyłącznie jeden obiekt JSON zgodny z przekazanym schematem (bez markdown)."
    : "";
  const { text } = await claudeChatCompletions({
    messages: [{ role: "user", content: `${prompt}${extra}` }],
    max_tokens: 4096,
    temperature: 0,
    model,
  });
  const parsed = extractJsonObject(text);
  if (parsed) return parsed;
  throw new Error("Odpowiedź AI nie zawiera poprawnego JSON.");
}
