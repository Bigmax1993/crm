import {
  extractJsonObject,
  claudeChatCompletions,
  claudeInvokeWithFile,
  isClaudeConfigured,
  getAiSettings,
  canMakeAiRequest,
  aiGateErrorMessage,
} from "@/lib/openai-crm";

/**
 * Lokalny odpowiednik Core.UploadFile — trwały data URL (przeżywa odświeżenie / SQLite).
 * Obsługuje File, Blob, ArrayBuffer oraz data URL.
 */
export async function localUploadFile({ file }) {
  if (typeof file === "string" && file.startsWith("data:")) {
    return { url: file };
  }

  let blob = null;
  if (file instanceof File || file instanceof Blob) {
    blob = file;
  } else if (file instanceof ArrayBuffer) {
    blob = new Blob([file]);
  } else if (ArrayBuffer.isView(file)) {
    blob = new Blob([file.buffer]);
  }

  if (!blob) {
    throw new Error("UploadFile (lokalny): oczekiwano File, Blob, ArrayBuffer lub data URL.");
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
    const res = await fetch(file_urls[0]);
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
