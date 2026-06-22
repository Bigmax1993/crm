import {
  extractJsonObject,
  claudeChatCompletions,
  claudeInvokeWithFile,
  isClaudeConfigured,
  getAiSettings,
  canMakeAiRequest,
} from "@/lib/openai-crm";

/**
 * Lokalny odpowiednik Core.UploadFile — publiczny URL w tej samej sesji (blob:).
 * Obsługuje File, Blob oraz wynik FileReader (data URL) jak w Construction.jsx.
 */
export async function localUploadFile({ file }) {
  if (file instanceof File || file instanceof Blob) {
    return { url: URL.createObjectURL(file) };
  }
  if (typeof file === "string" && file.startsWith("data:")) {
    const res = await fetch(file);
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob) };
  }
  throw new Error("UploadFile (lokalny): oczekiwano File, Blob lub data URL.");
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
  if (!gate.ok) throw new Error("Limit zapytań AI lub brak konfiguracji.");

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
