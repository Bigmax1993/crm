/**
 * Ekstrakcja potwierdzenia wpływu zwrotu (PL / DE) z PDF — LLM + normalizacja.
 */

export const REFUND_RECEIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    direction: {
      type: "string",
      enum: ["incoming", "outgoing", "unknown"],
      description: "incoming = wpływ na nasze konto (zwrot od dostawcy)",
    },
    sender_name: {
      type: "string",
      description: "Nadawca przelewu (dostawca zwracający środki), nie odbiorca",
    },
    amount: { type: "number", description: "Kwota wpływu jako liczba dodatnia" },
    currency: { type: "string", enum: ["PLN", "EUR"] },
    transfer_date: { type: "string", description: "YYYY-MM-DD" },
    title: { type: "string", description: "Tytuł / opis operacji" },
    invoice_number: { type: "string", description: "Numer FV jeśli w opisie" },
  },
};

export function buildRefundReceiptExtractPrompt() {
  return `Przeanalizuj dokument bankowy (potwierdzenie przelewu / Überweisungsbestätigung / wpływ na rachunek).
Wyekstrahuj JEDEN wpływ środków (zwrot od dostawcy) — zwróć wyłącznie JSON ze schemą (bez markdown).

Kierunek (direction):
- "incoming" gdy MY otrzymujemy pieniądze (wpływ, uznanie rachunku, Gutschrift, Rücküberweisung, Erstattung, Geld zurück, zwrot, refund).
- "outgoing" gdy MY wysyłamy płatność.
- "unknown" jeśli niejednoznaczne.

sender_name: nazwa NADAWCY przelewu (dostawca / kontrahent zwracający środki). Nie wpisuj nazwy naszej firmy jako nadawcy.

amount: kwota wpływu jako liczba dodatnia. PL: 1.234,56 → 1234.56. DE: 1.234,56 → 1234.56.

currency: PLN lub EUR.

transfer_date: data księgowania / realizacji YYYY-MM-DD (PL: dd.mm.rrrr, DE: dd.mm.yyyy).

title: pełny tytuł / Verwendungszweck / opis operacji.

invoice_number: tylko jeśli w tytule jest numer faktury (FV, Rechnung, Invoice). Inaczej pusty string.

Nie wymyślaj danych — tylko treść dokumentu.`;
}

export function normalizeRefundReceiptLlmResult(result) {
  if (!result || result.direction === "outgoing") return null;
  const amount = Math.abs(Number(result.amount) || 0);
  if (amount <= 0) return null;
  return {
    direction: result.direction || "incoming",
    sender_name: String(result.sender_name || "").trim(),
    contractor_name: String(result.sender_name || "").trim(),
    amount,
    currency: result.currency === "EUR" ? "EUR" : "PLN",
    transfer_date: String(result.transfer_date || "").slice(0, 10),
    title: String(result.title || "").trim(),
    invoice_number: String(result.invoice_number || "").trim(),
  };
}
