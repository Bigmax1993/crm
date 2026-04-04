/**
 * Prompty OCR (InvokeLLM / OpenAI) dla importu faktur PDF.
 * Liczba prób na jeden plik: getInvoicePdfOcrAttemptCount() — domyślnie 5, opcjonalnie VITE_OCR_LLM_ATTEMPTS (1–10).
 */
const DEFAULT_INVOICE_PDF_OCR_ATTEMPTS = 5;

function clampOcrAttemptsEnv(n) {
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(Math.max(Math.floor(n), 1), 10);
}

export const OCR_LLM_ATTEMPTS = (() => {
  const raw = Number(typeof import.meta !== "undefined" && import.meta.env?.VITE_OCR_LLM_ATTEMPTS);
  const c = clampOcrAttemptsEnv(raw);
  return c ?? DEFAULT_INVOICE_PDF_OCR_ATTEMPTS;
})();

/** Wspólna liczba przejść LLM na fakturę (OpenAI + ścieżka Base44). */
export function getInvoicePdfOcrAttemptCount() {
  const raw = Number(typeof import.meta !== "undefined" && import.meta.env?.VITE_OCR_LLM_ATTEMPTS);
  const c = clampOcrAttemptsEnv(raw);
  return c ?? DEFAULT_INVOICE_PDF_OCR_ATTEMPTS;
}

/** Standardowy — zasady biznesowe i pola. */
export const INVOICE_OCR_PROMPT_BASE = `Jesteś ekspertem OCR faktur i dokumentów kosztowych (Polska, UE). Dane trafią do weryfikacji ręcznej — ekstrahuj wyłącznie to, co widać w pliku; nie zgaduj numerów ani kwot.

WYJŚCIE: jeden obiekt JSON zgodny ze schemą (tablica invoices). Bez markdown.

SPRZEDAWCA vs NABYWCA vs KONTRAHENT (contractor_name, contractor_nip):
- Na fakturze są co najmniej DWA odrębne podmioty: SPRZEDAWCA (wystawca) i NABYWCA — to zawsze różne strony transakcji; nie zamieniaj ich miejscami i nie scalaj w jedną nazwę.
- W polu contractor_name trafia wyłącznie podmiot „kontrahent” w sensie biznesowym poniżej — nigdy nazwa drugiej strony (nabywcy przy zakupie, sprzedawcy przy sprzedaży).
- Przy FAKTURZE ZAKUPU: kontrahent = SPRZEDAWCA / wystawca (nie nabywca, nie własna firma jeśli to nasza strona jako nabywca).
- Przy FAKTURZE SPRZEDAŻY (is_own_company_seller=true): kontrahent = NABYWCA (Twoja firma wystawia dokument).
- Obowiązkowo odczytaj z PDF pełną nazwę handlową kontrahenta z właściwego bloku (nagłówki „Sprzedawca”, „Wystawca”, „Nabywca”, „Nabywca towaru/usług”); wielolinijkowe nazwy scal w jeden ciąg; pomiń sam adres (ul./kod), jeśli da się oddzielić od nazwy. Nie kończ na samym numerze faktury — jeśli nazwa niepewna, przeszukaj oba bloki.
- NIP: 10 cyfr dla PL dla tego samego podmiotu co contractor_name; brak w dokumencie → pusty string. Przy dwóch NIP na dokumencie dopasuj NIP do wybranego kontrahenta (zakup: NIP sprzedawcy).

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
- is_own_company_seller: true gdy na dokumencie wystawcą jest Twoja firma (faktura sprzedaży).

position: krótki opis głównej treści lub uwagi (typ dokumentu: proforma/korekta/rachunek — dopisz jeśli nie jest zwykłą FV).

payer: pole nabywcy / płatnika jeśli czytelne.

Wielostronicowy PDF: czytaj wszystkie strony; sumy i numery biorą się ze strony podsumowania / ostatniej z tabelą VAT.`;

/** Druga fala promptów — nacisk na skany, słabą czytelność i pułapki OCR. */
export const INVOICE_OCR_PROMPT_DEEP = `TRYB MAKSYMALNEJ DOKŁADNOŚCI OCR (skany, zdjęcia, niska rozdzielczość, szare tło):

Postępuj jak profesjonalny operator OCR: lokalizuj najpierw OSOBNO blok SPRZEDAWCA i blok NABYWCA (dwa różne podmioty), potem tabela, podsumowanie VAT, „do zapłaty”, rachunek bankowy — czytaj pole po polu.
- Nie zamieniaj O na 0 ani l na 1 w numerze faktury — jeśli niepewne, porównaj z powtórzeniami numeru w dokumencie.
- Tabele: każdy wiersz pozycji osobno; nie łącz komórek w jeden tekst jeśli da się odczytać kolumny.
- Szary lub przekoszony tekst: wybierz wariant najczęściej powtarzający się w dokumencie dla tego pola.
- Pieczątki i stemple: nie traktuj ich jako głównej nazwy kontrahenta — preferuj drukowany blok „Sprzedawca” / „Wystawca” / „Nabywca” (wg reguł kontrahenta powyżej).
- Wielowalutowość: jeśli są dwie waluty, kwoty główne w polu amount muszą być w walucie „Do zapłaty”.

Potem stosuj te same reguły wyjścia JSON co poniżej.

---

${INVOICE_OCR_PROMPT_BASE}`;

export function pickInvoiceOcrPrompt(attemptIndexZeroBased) {
  return attemptIndexZeroBased % 2 === 0 ? INVOICE_OCR_PROMPT_BASE : INVOICE_OCR_PROMPT_DEEP;
}

/** Fragment do kolejnych prób InvokeLLM (bez duplikacji całego INVOICE_JSON_PROMPT). */
export const INVOICE_OCR_SCAN_ADDENDUM = `Dodatkowe reguły dla skanów i słabej czytelności:
Lokalizuj najpierw BLOKI: nagłówek, potem OSOBNO sprzedawca i nabywca (dwa różne podmioty), tabela, podsumowanie VAT, „do zapłaty”, rachunek bankowy — potem czytaj pole po polu.
Nie zamieniaj O na 0 ani l na 1 w numerze faktury — przy wątpliwości porównaj powtórzenia numeru w dokumencie.
Tabele: każdy wiersz pozycji osobno; nie łącz komórek w jeden tekst, jeśli da się odczytać kolumny.
Pieczątki: nie traktuj ich jako głównej nazwy kontrahenta — preferuj drukowany blok „Sprzedawca” / „Wystawca” / „Nabywca” (kontrahent wg typu FV: zakup = sprzedawca, sprzedaż = nabywca).
Wielowalutowość: kwota_brutto musi być w walucie z „Do zapłaty” / podsumowania.
Format PL kwot: przecinek = dziesiętne, kropka lub spacja = tysiące (np. 1 234,56 zł).`;

/** Trzecia fala — maksymalny nacisk na wielostronicowość i spójność kwot. */
export const INVOICE_OCR_SCAN_ADDENDUM_DEEP = `TRYB GŁĘBOKI (kolejna próba OCR):
- Przejrzyj KAŻDĄ stronę od początku do końca; korekty i duplikaty numerów — wybierz wersję ze strony podsumowania / ostatniej z tabelą VAT.
- numer_faktury: szukaj też „Nr”, „Nr dokumentu”, „Faktura nr”, „FV”, „Dowód ks.”; jeśli kilka wariantów — ten przy logo lub w stopce płatności.
- nazwa_kontrahenta: pełna nazwa z właściwego bloku — przy zakupie ze „Sprzedawca”/„Wystawca”, przy sprzedaży z „Nabywca” (nie skrót z pieczątki, nie nazwa drugiej strony), bez adresu w tym polu jeśli da się oddzielić.
- NIP: dokładnie 10 cyfr (PL) tego samego podmiotu co nazwa_kontrahenta; przy dwóch NIP na dokumencie dla faktury zakupu bierz NIP sprzedawcy, dla sprzedaży NIP nabywcy.
- kwota_brutto: musi odpowiadać „Razem brutto” / „Do zapłaty” / ostatniemu wierszowi podsumowania; jeśli VAT w wierszach — suma netto+VAT powinna się zgadzać (tolerancja zaokrągleń groszowych).
- Przy niskim kontraście lub szumie: wybierz wariant tekstu powtarzający się co najmniej dwa razy w dokumencie dla tego samego pola.`;

/** @deprecated użyj getInvoicePdfOcrAttemptCount — zachowane dla importów. */
export function getInvoiceBase44AttemptCount() {
  return getInvoicePdfOcrAttemptCount();
}
