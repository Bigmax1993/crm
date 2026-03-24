/**
 * Plan rozwoju Fakturowo — jeden plik źródłowy dla strony /Roadmap i dokumentacji.
 * Aktualizuj tutaj, potem zsynchronizuj skrót w docs/PRODUCT_ROADMAP.md jeśli potrzeba.
 */

export const ROADMAP_INTRO = {
  title: "Kierunki rozwoju",
  subtitle:
    "Poniżej wszystkie obszary omówione w planie produktowym: od szybkich wygranych po integracje i AI. Status to orientacyjna kolejność, nie obietnica terminów.",
};

/** Priorytet: must-have (rdzeń), should, could, later */
export const ROADMAP_PHASES = [
  {
    id: "quick-wins",
    title: "Priorytet (wysoki zwrot z wysiłkiem)",
    summary: "Matching płatności z bankiem, powiadomienia o terminach i budżetach, audyt zmian na fakturach i projektach.",
    items: [
      {
        title: "Matching przelewów z bankiem (CSV / CAMT)",
        detail:
          "Import wyciągu, dopasowanie do otwartych faktur (kwota, data, kontrahent), oznaczanie zapłaty i różnic kursowych.",
        priority: "must",
      },
      {
        title: "Powiadomienia (terminy, budżety, brak kursu NBP)",
        detail:
          "Reguły: zbliżająca się płatność, przekroczenie progu budżetu, brak kursu do przeliczenia. Kanały: e-mail, webhook (Teams/Slack).",
        priority: "must",
      },
      {
        title: "Audyt zmian",
        detail:
          "Kto i kiedy zmienił kwotę, status, daty na fakturze oraz kluczowe pola projektu; podgląd historii przy rekordzie.",
        priority: "must",
      },
    ],
  },
  {
    id: "product-core",
    title: "Produkt i dane",
    summary: "Spójny obraz kontrahenta i kontrola obiegu dokumentów.",
    items: [
      {
        title: "Jedna „prawda” o kontrahencie",
        detail:
          "Profil: historia FV, płatności, limity kredytowe, przypisane projekty, alerty ryzyka.",
        priority: "should",
      },
      {
        title: "Workflow zatwierdzania",
        detail:
          "Szkic → akceptacja → księgowanie / wysyłka; proste statusy i przypisanie osoby akceptującej.",
        priority: "should",
      },
    ],
  },
  {
    id: "governance-budget-i18n",
    title: "Organizacja, budżety i wielojęzyczność",
    summary:
      "Role i separacja danych w grupie kapitałowej, twarde limity budżetowe na FV oraz język UI i dokumentów.",
    items: [
      {
        title: "Role i polityki dostępu (RBAC)",
        detail:
          "Ponad stan „zalogowany”: np. tylko odczyt faktur, tylko własne projekty, zakres oddział vs centrala, polityki widoczności kontrahentów. Separacja danych między spółkami w grupie kapitałowej (tenant / encja prawna) z kontrolą po stronie API i UI.",
        priority: "should",
      },
      {
        title: "Budżety obowiązkowe i eskalacja",
        detail:
          "Zatwierdzony budżet projektu blokuje wystawienie faktury powyżej progu bez ścieżki eskalacji (akceptacja, wyjątek, komentarz). Powiązanie z alertami i audytem.",
        priority: "should",
      },
      {
        title: "Wielojęzyczność UI i dokumentów",
        detail:
          "Język interfejsu (i18n) oraz wersje językowe faktur i ofert przy tym samym rekordzie (szablony PDF/HTML, nazewnictwo pozycji, waluta i prawo bez duplikowania encji biznesowej).",
        priority: "could",
      },
    ],
  },
  {
    id: "compliance-archive-tax",
    title: "RODO, archiwum księgowe i podatki transgraniczne",
    summary:
      "Retencja danych, archiwum powiązane z obiegiem (KSeF, JPK), scenariusze UE: odwrotne obciążenie i OSS.",
    items: [
      {
        title: "RODO i retencja",
        detail:
          "Polityka przechowywania załączników i logów audytu (okresy, kategorie danych); anonimizacja lub usunięcie po czasie zgodnie z regulaminem; eksport / usunięcie na żądanie podmiotu danych tam, gdzie ma to zastosowanie.",
        priority: "should",
      },
      {
        title: "Archiwum księgowe i eksporty",
        detail:
          "Powiązanie rekordów z obiegiem dokumentów (w tym KSeF po wdrożeniu); JPK i eksporty pod księgowość zewnętrzną — nawet jako pakiety plików + metadane (okres, zakres, hash), bez pełnej integracji z każdym ERP na start.",
        priority: "could",
      },
      {
        title: "Waluty i podatki transgraniczne (UE)",
        detail:
          "Scenariusze: odwrotne obciążenie (reverse charge), One Stop Shop (OSS) przy sprzedaży B2C do innych krajów UE — oznaczenia na fakturze, walidacja NIP/VAT, raporty pomocnicze; zakres wdrożenia etapami.",
        priority: "later",
      },
    ],
  },
  {
    id: "scoring-holding-cf",
    title: "Scoring kontrahenta i cash flow holdingu",
    summary:
      "Ocena ryzyka (reguły, opcjonalnie BIG) oraz konsolidacja przepływów w grupie z przesunięciami między spółkami.",
    items: [
      {
        title: "Scoring kontrahenta i BIG",
        detail:
          "Nawet prosty silnik regułowy: limity, historia płatności, branża, flagi ostrzegawcze przy zapisie i na liście. Integracja z Biurem Informacji Gospodarczej lub podobnym źródłem danych — etap opcjonalny, uzależniony od budżetu i warunków prawnych/umownych.",
        priority: "could",
      },
      {
        title: "Konsolidacja cash flow dla holdingu",
        detail:
          "Osobna warstwa analityczna: cash flow skonsolidowany dla grupy oraz przesunięcia między spółkami (wewnętrzne rozliczenia, finansowanie, dywidendy) pokazywane osobno od przepływów operacyjnych poszczególnych jednostek — żeby widok grupy nie mylił się z „pojedynczą spółką”.",
        priority: "should",
      },
    ],
  },
  {
    id: "integrations",
    title: "Integracje zewnętrzne",
    summary: "Prawo, bankowość, narzędzia zespołowe.",
    items: [
      {
        title: "KSeF / e-Faktura (PL)",
        detail:
          "Świadomy moduł: eksport/import XML, statusy po stronie KSeF, powiązanie z rekordami w CRM (duży zakres — etapami).",
        priority: "later",
      },
      {
        title: "Kalendarz terminów",
        detail:
          "Terminy płatności i kamienie milowe projektów w widoku tygodnia/miesiąca; opcjonalnie eksport do ICS.",
        priority: "could",
      },
      {
        title: "Webhooks i kanały zespołowe",
        detail:
          "Konfigurowalne endpointy dla zdarzeń (nowa FV, alert budżetowy) pod Microsoft Teams / Slack.",
        priority: "should",
      },
    ],
  },
  {
    id: "construction-ops",
    title: "Budowa: harmonogram, podwykonawcy, magazyn",
    summary:
      "Planowanie powiązane z kosztami i fakturami (nie tylko KPI), retencje oraz koszty z magazynu na budowie.",
    items: [
      {
        title: "Harmonogram Gantt z kosztami i fakturami",
        detail:
          "Oś czasu etapów / zadań powiązana z kosztami planowanymi i rzeczywistymi oraz z fakturami (przypisanie FV do etapu lub zadania). Widok plan vs wykonanie finansowe, nie tylko pulpit KPI.",
        priority: "could",
      },
      {
        title: "Podwykonawcy i retencje",
        detail:
          "Procent retencji od faktur podwykonawców, harmonogram zwrotów, salda otwarte; alerty przed terminem i po przeterminowaniu; powiązanie z kontrahentem i projektem.",
        priority: "should",
      },
      {
        title: "Magazyn i materiały (rejestr na budowę)",
        detail:
          "Gdy część kosztów pochodzi z magazynu, a nie tylko z FV: uproszczony rejestr wydań materiałów na budowę (pozycja, ilość, wartość), spięcie z projektem i ewentualnie z kosztami planowanymi — bez pełnego WMS na start.",
        priority: "could",
      },
    ],
  },
  {
    id: "platform-products",
    title: "Produkty platformowe",
    summary:
      "Warstwa integracji i automatyzacji ponad pojedyncze moduły: API, webhooks, lekkie procesy.",
    items: [
      {
        title: "API publiczne i klucze dostępu",
        detail:
          "Udokumentowane endpointy (np. REST) z limitami i rotacją kluczy lub OAuth — integracja z ERP, skryptami i narzędziami zewnętrznymi bez konieczności korzystania z pełnego UI.",
        priority: "should",
      },
      {
        title: "Webhooks i synchronizacja zewnętrzna",
        detail:
          "Oprócz powiadomień (Teams/Slack): możliwość dwukierunkowej synchronizacji statusów dokumentów z zewnętrznymi systemami tam, gdzie to technicznie uzasadnione.",
        priority: "could",
      },
      {
        title: "Szablony procesów (BPM light)",
        detail:
          "Konfigurowalne checklisty startowe (np. nowy projekt: umowa → budżet → pierwsza FV → odbiór) z rolami i przypisaniami — bez pełnego silnika BPM.",
        priority: "could",
      },
    ],
  },
  {
    id: "ai",
    title: "AI (na bazie obecnych modułów)",
    summary: "Wsparcie decyzji bez halucynacji — zawsze z liczbami z systemu.",
    items: [
      {
        title: "Asystent przy fakturze",
        detail:
          "Wyjaśnienie rozbieżności VAT, podpowiedź kont księgowych wyłącznie jako sugestia ze źródłem w danych.",
        priority: "could",
      },
      {
        title: "Podsumowania dla zarządu",
        detail:
          "Jedna strona A4: trendy, ryzyka, KPI z danych już w Base44 — szablon + liczby, nie generacja z pamięci.",
        priority: "could",
      },
    ],
  },
  {
    id: "analytics-snapshots-segments",
    title: "Hurtownia danych i segmentacja klientów",
    summary:
      "Okresowe zrzuty KPI do tabel, żeby raporty historyczne były stabilne po korektach; segmenty pod marketing i windykację.",
    items: [
      {
        title: "Hurtownia i snapshoty KPI",
        detail:
          "Okresowe (np. dzienne / miesięczne) zrzuty agregatów KPI do dedykowanych tabel — w Base44 (encje snapshot) lub zewnętrznie (np. warehouse), z datą obcięcia i wersją. Raporty „stan na dzień X” nie zmieniają się po późniejszych korektach w transakcjach bieżących.",
        priority: "should",
      },
      {
        title: "Segmentacja klientów",
        detail:
          "Klasy ABC, branże, marża życiowa (lifetime) i powiązane metryki — widoki i filtry pod marketing (kampanie, priorytety) oraz windykację (kolejność działań, limity ryzyka).",
        priority: "could",
      },
    ],
  },
  {
    id: "engineering",
    title: "Technika i jakość",
    summary: "Środowiska, obserwowalność, testy automatyczne.",
    items: [
      {
        title: "Środowiska i konfiguracja",
        detail:
          "Jasny podział dev / staging / prod; sekrety i klucze (Base44, OpenAI) poza repozytorium.",
        priority: "should",
      },
      {
        title: "Observability",
        detail:
          "Sentry (lub podobnie) na froncie + korelacja z błędami wywołań API Base44.",
        priority: "should",
      },
      {
        title: "E2E na krytycznych ścieżkach",
        detail:
          "Playwright: logowanie, jedna ścieżka faktury, jeden raport — rozszerzane wraz z regresją.",
        priority: "should",
      },
    ],
  },
  {
    id: "ux-bi",
    title: "UX i analityka (Power BI)",
    summary: "Personalizacja pulpitów i raportów cyklicznych.",
    items: [
      {
        title: "Zapisane widoki",
        detail:
          "Ulubione filtry i układ kafelków na pulpicie CEO / operacyjnym; przywracanie jednym kliknięciem.",
        priority: "could",
      },
      {
        title: "Eksport zaplanowany",
        detail:
          "Raport (np. co poniedziałek) na e-mail — wymaga funkcji backendowych Base44 lub cron poza SPA.",
        priority: "later",
      },
    ],
  },
  {
    id: "mobile-presentation",
    title: "Mobilność i tryb prezentacji",
    summary:
      "PWA lub dedykowany widok terenowy z offline; osobny profil ekranu dla zarządu bez ujawniania wrażliwych kwot.",
    items: [
      {
        title: "Aplikacja mobilna (PWA+) lub widok „w terenie”",
        detail:
          "Zdjęcie dokumentu (faktura, dowód) do podpięcia pod import lub załącznik; status płatności i kluczowe pola na małym ekranie. Offline-first dla odczytu: cache list i szczegółów, synchronizacja po odzyskaniu sieci; akcje zapisu w kolejce tam, gdzie to możliwe.",
        priority: "could",
      },
      {
        title: "Tryb „prezentacja” dla zarządu",
        detail:
          "Przełącznik profilu widoku: wykresy i trendy bez jawnych kwot wrażliwych (maskowanie, przedziały lub indeksy zamiast PLN) — czytelne na projektorze bez ryzyka podglądu szczegółów kosztowych.",
        priority: "could",
      },
    ],
  },
];

export const PRIORITY_LABELS = {
  must: "Rdzeń",
  should: "Wysokie",
  could: "Średnie",
  later: "Później / duży zakres",
};
