import {
  openaiUploadFile,
  openaiDeleteFile,
  extractJsonObject,
  openaiChatCompletions,
  isOpenAiConfigured,
  getAiSettings,
  canMakeAiRequest,
  getOpenAiApiKey,
  recordUsage,
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
 * Lokalny odpowiednik Core.InvokeLLM — OpenAI (wymaga klucza w ustawieniach lub VITE_OPENAI_API_KEY).
 */
export async function localInvokeLLM({ prompt, file_urls, response_json_schema }) {
  if (!isOpenAiConfigured()) {
    throw new Error(
      "Tryb lokalny CRM: ustaw klucz OpenAI (Ustawienia AI lub VITE_OPENAI_API_KEY), aby użyć AI (OCR/przelewy)."
    );
  }
  const gate = canMakeAiRequest();
  if (!gate.ok) throw new Error("Limit zapytań AI lub brak konfiguracji.");

  const model = getAiSettings().model || "gpt-4o";
  const key = getOpenAiApiKey();

  if (file_urls?.length) {
    const res = await fetch(file_urls[0]);
    if (!res.ok) throw new Error(`Odczyt pliku dla AI nie powiódł się (HTTP ${res.status}).`);
    const blob = await res.blob();
    const fname = blob.type?.includes("pdf") ? "document.pdf" : "upload.bin";
    const upload = new File([blob], fname, { type: blob.type || "application/octet-stream" });
    const fileId = await openaiUploadFile(upload);
    try {
      const body = {
        model,
        max_tokens: 4096,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "file", file: { file_id: fileId } },
            ],
          },
        ],
      };
      if (response_json_schema && typeof response_json_schema === "object") {
        body.response_format = {
          type: "json_schema",
          json_schema: {
            name: "crm_invoke_result",
            schema: response_json_schema,
            strict: false,
          },
        };
      }

      const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });

      if (!apiRes.ok) {
        const t = await apiRes.text();
        throw new Error(t.slice(0, 280) || `HTTP ${apiRes.status}`);
      }

      const j = await apiRes.json();
      const text = j.choices?.[0]?.message?.content || "";
      const total = j.usage?.total_tokens ?? 0;
      recordUsage(total, { type: "local_invoke_llm", model });

      if (j.choices?.[0]?.message?.parsed != null) {
        return j.choices[0].message.parsed;
      }
      const parsed = extractJsonObject(text);
      if (parsed) return parsed;
      throw new Error("Odpowiedź AI nie zawiera poprawnego JSON.");
    } finally {
      await openaiDeleteFile(fileId);
    }
  }

  const extra = response_json_schema
    ? "\n\nZwróć wyłącznie jeden obiekt JSON zgodny z przekazanym schematem (bez markdown)."
    : "";
  const { text } = await openaiChatCompletions({
    messages: [{ role: "user", content: `${prompt}${extra}` }],
    max_tokens: 4096,
    temperature: 0,
    model,
  });
  const parsed = extractJsonObject(text);
  if (parsed) return parsed;
  throw new Error("Odpowiedź AI nie zawiera poprawnego JSON.");
}
