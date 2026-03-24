/**
 * Prompty OCR (Base44 InvokeLLM) dla importu faktur PDF.
 * VITE_OCR_LLM_ATTEMPTS: 3–10, domyślnie 6 (więcej prób = silniejszy konsensus, wyższy koszt API).
 */
function clampAttempts(n) {
  if (!Number.isFinite(n) || n < 3) return 6;
  return Math.min(Math.floor(n), 10);
}

export const OCR_LLM_ATTEMPTS = clampAttempts(
  Number(typeof import.meta !== "undefined" && import.meta.env?.VITE_OCR_LLM_ATTEMPTS)
);

/** Standardowy — zasady biznesowe i pola. */
export const INVOICE_OCR_PROMPT_BASE = `Jesteś ekspertem OCR faktur i dokumentów kosztowych (Polska, UE). Dane trafią do weryfikacji ręcznej — ekstrahuj wyłącznie to, co widać w pliku; nie zgaduj numerów ani kwot.

WYJŚCIE: jeden obiekt JSON zgodny ze schemą (tablica invoices). Bez markdown.

KONTRAHENT (contractor_name, contractor_nip):
- Przy FAKTURZE ZAKUPU: kontrahent = sprzedawca / wystawca (nie nabywca, nie własna firma jeśli to nasza strona jako nabywca).
- Przy FAKTURZE SPRZEDAŻY (is_kanbud_seller=true): kontrahent = nabywca.
- NIP: 10 cyfr dla PL; brak w dokumencie → pusty string.

KWOTY: amount = brutto z podsumowania / „Do zapłaty” / „Razem”. net_amount, vat_amount ze stopki VAT; jeśli nie da się odczytać — 0. Waluta ISO (PLN, EUR, …).
- Rozróżnij format PL: przecinek jako separator dziesiętny, kropka lub spacja jako tysiące (np. 1 234,56).
- Jeśli jest kilka kwot brutto — wybierz tę z „Razem” / „Do zapłaty” / ostatnie podsumowanie przed stopką.

DATY: issue_date, payment_deadline jako YYYY-MM-DD (konwertuj z formatów PL). Jeśli rok dwucyfrowy — uzupełnij pełny RRRR wg kontekstu dokumentu.

category: hotel (noclegi, hotel), construction (budowa, materiały, podwykonawca budowlany), standard (pozostałe).

order_number: numer zamówienia / zlecenia / PO jeśli widoczny.

line_items: pozycje z tabeli { name, quantity, net, vat, gross }; max ok. 40 pozycji; dłuższe listy — pierwsze 40, resztę streść w position.

HOTELE: hotel_name, city, persons_count, stay_period gdy dokument dotyczy pobytu.

FLAGI:
- is_paragon: paragon fiskalny / uproszczony.
- is_paid: oznaczenie opłacone / zapłacono / saldo 0 wyraźnie na dokumencie.
- is_kanbud_seller: true gdy KANBUD jest WYSTAWCĄ (sprzedaż).

position: krótki opis głównej treści lub uwagi (typ dokumentu: proforma/korekta/rachunek — dopisz jeśli nie jest zwykłą FV).

payer: pole nabywcy / płatnika jeśli czytelne.

Wielostronicowy PDF: czytaj wszystkie strony; sumy i numery biorą się ze strony podsumowania / ostatniej z tabelą VAT.`;

/** Druga fala promptów — nacisk na skany, słabą czytelność i pułapki OCR. */
export const INVOICE_OCR_PROMPT_DEEP = `TRYB MAKSYMALNEJ DOKŁADNOŚCI OCR (skany, zdjęcia, niska rozdzielczość, szare tło):

Postępuj jak profesjonalny operator OCR: lokalizuj najpierw BLOKI (nagłówek, sprzedawca, nabywca, tabela, podsumowanie VAT, „do zapłaty”, rachunek bankowy), potem czytaj pole po polu.
- Nie zamieniaj O na 0 ani l na 1 w numerze faktury — jeśli niepewne, porównaj z powtórzeniami numeru w dokumencie.
- Tabele: każdy wiersz pozycji osobno; nie łącz komórek w jeden tekst jeśli da się odczytać kolumny.
- Szary lub przekoszony tekst: wybierz wariant najczęściej powtarzający się w dokumencie dla tego pola.
- Pieczątki i stemple: nie traktuj ich jako głównej nazwy kontrahenta — preferuj blok „Sprzedawca” / „Wystawca”.
- Wielowalutowość: jeśli są dwie waluty, kwoty główne w polu amount muszą być w walucie „Do zapłaty”.

Potem stosuj te same reguły wyjścia JSON co poniżej.

---

${INVOICE_OCR_PROMPT_BASE}`;

export function pickInvoiceOcrPrompt(attemptIndexZeroBased) {
  return attemptIndexZeroBased % 2 === 0 ? INVOICE_OCR_PROMPT_BASE : INVOICE_OCR_PROMPT_DEEP;
}
