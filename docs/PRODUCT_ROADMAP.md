# Plan rozwoju Fakturowo CRM

Źródło strukturalne: [`src/lib/product-roadmap-data.js`](../src/lib/product-roadmap-data.js) (strona w aplikacji: **`/Roadmap`**).

---

## Priorytet (wysoki zwrot z wysiłkiem)

1. **Matching przelewów z bankiem (CSV / CAMT)** — import wyciągu, dopasowanie do otwartych faktur (kwota, data, kontrahent), oznaczanie zapłaty i różnic kursowych.
2. **Powiadomienia** — terminy płatności, przekroczenia budżetu, brak kursu NBP; kanały: e-mail, webhook (Teams/Slack).
3. **Audyt zmian** — kto i kiedy zmienił kwoty, statusy, daty na fakturze i kluczowe pola projektu.

---

## Produkt i dane

- **Jedna „prawda” o kontrahencie** — profil z historią FV, płatności, limitami, projektami, alertami.
- **Workflow zatwierdzania** — szkic → akceptacja → księgowanie / wysyłka.

---

## Organizacja, budżety i wielojęzyczność

- **Role i polityki dostępu (RBAC)** — m.in. tylko odczyt faktur, tylko własne projekty, oddział vs centrala; separacja danych między spółkami w grupie kapitałowej (tenant / kontrola API + UI).
- **Budżety obowiązkowe** — zatwierdzony budżet projektu blokuje wystawienie FV powyżej progu bez eskalacji (akceptacja / wyjątek / audyt).
- **Wielojęzyczność** — UI (i18n) oraz faktury i oferty w języku klienta przy tym samym rekordzie (szablony, bez duplikowania encji).

---

## RODO, archiwum księgowe i podatki transgraniczne

- **RODO i retencja** — polityka przechowywania załączników i logów audytu; anonimizacja lub usunięcie po czasie; eksport / usunięcie na żądanie tam, gdzie ma zastosowanie.
- **Archiwum księgowe i eksporty** — powiązanie z obiegiem (w tym KSeF po wdrożeniu); JPK i eksporty pod księgowość zewnętrzną (pliki + metadane, bez pełnej integracji z każdym ERP na start).
- **Waluty i podatki (UE)** — odwrotne obciążenie, OSS przy sprzedaży B2C do UE; oznaczenia na FV, walidacja NIP/VAT, raporty pomocnicze (etapami).

---

## Scoring kontrahenta i cash flow holdingu

- **Scoring + BIG** — regułowa ocena ryzyka przy kontrahencie; opcjonalna integracja z BIG (lub podobnym źródłem), jeśli budżet i prawo na to pozwalają.
- **Konsolidacja cash flow** — widok grupy oraz **osobna warstwa** przesunięć między spółkami (wewnętrzne rozliczenia, finansowanie itd.), obok CF operacyjnego jednostek.

---

## Integracje zewnętrzne

- **KSeF / e-Faktura (PL)** — moduł etapowy (XML, statusy, powiązanie z CRM).
- **Kalendarz terminów** — płatności i kamienie milowe projektów; opcjonalnie ICS.
- **Webhooks** — zdarzenia do Teams/Slack.

---

## Budowa: harmonogram, podwykonawcy, magazyn

- **Gantt z kosztami i fakturami** — oś czasu etapów powiązana z kosztami i FV (plan vs wykonanie), nie tylko KPI na pulpicie.
- **Podwykonawcy i retencje** — procenty z faktur, terminy zwrotu, salda, alerty.
- **Magazyn / materiały** — uproszczony rejestr wydań na budowę, gdy koszty idą z magazynu, nie tylko z FV (bez pełnego WMS na start).

---

## Produkty platformowe

- **API publiczne i klucze** — integracja z ERP i skryptami poza UI.
- **Webhooks i synchronizacja** — także dwukierunkowa tam, gdzie możliwe.
- **Szablony procesów (BPM light)** — checklisty np. nowy projekt (umowa → budżet → FV → odbiór).

---

## AI

- **Asystent przy fakturze** — VAT, konta (tylko jako sugestia + źródło w danych).
- **Podsumowania dla zarządu** — jedna strona A4 z trendami i ryzykami z liczb z systemu.

---

## Hurtownia danych i segmentacja klientów

- **Hurtownia i snapshoty KPI** — okresowe zrzuty do tabel (Base44 lub zewnętrznie), raporty historyczne „stan na dzień X” nie „pływają” po korektach w danych bieżących.
- **Segmentacja** — ABC, branże, marża życiowa; pod marketing (kampanie, priorytety) i windykację (kolejność działań, limity ryzyka).

---

## Technika i jakość

- **Środowiska** — dev / staging / prod; sekrety poza repo.
- **Observability** — np. Sentry + błędy API Base44.
- **E2E** — Playwright na krytycznych ścieżkach (logowanie, faktura, raport).

---

## UX / analityka

- **Zapisane widoki** — filtry i układ kafelków na pulpitach.
- **Eksport zaplanowany** — raporty cykliczne na e-mail (wymaga backendu / funkcji Base44).

---

## Mobilność i tryb prezentacji

- **PWA+ / widok „w terenie”** — zdjęcie dokumentu, status płatności; offline-first dla odczytu (cache, sync po powrocie online).
- **Tryb prezentacji dla zarządu** — wykresy i KPI bez ujawniania wrażliwych kwot (maskowanie / przedziały), pod pokaz na projektor.

---

*Ostatnia aktualizacja treści: zsynchronizowana z `product-roadmap-data.js`.*
