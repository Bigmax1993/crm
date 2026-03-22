# MIZAR CRM

Aplikacja webowa **CRM dla MIZAR Sp. z o.o.** — firmy budującej obiekty sportowe w Polsce. System łączy dane operacyjne (faktury, projekty, kontrahenci, cash flow, raporty) z backendem **Base44** oraz modułami **OpenAI** (asystent, OCR faktur, raporty, alerty, analiza ofert).

## Stack technologiczny

| Warstwa | Technologie |
|--------|-------------|
| UI | React 18, Vite 6 |
| Styling | Tailwind CSS, shadcn/ui (Radix) |
| Backend / BaaS | Base44 (`@base44/sdk`, plugin Vite) |
| Stan zapytań | TanStack React Query |
| Wykresy / PDF | Recharts, jsPDF, html2canvas |
| AI | OpenAI Chat Completions API (`gpt-4o` / `gpt-4o-mini`) |

## Wymagania

- **Node.js** (LTS, np. 20.x) i **npm**
- Konto i aplikacja na [Base44](https://base44.com)
- Opcjonalnie: konto OpenAI i klucz API (moduły AI)

## Instalacja i uruchomienie

```bash
git clone <URL-repozytorium>
cd Fakturowo
npm install
```

Utwórz plik **`.env.local`** (lub `.env`) w katalogu głównym projektu:

```env
# Base44 (wymagane do działania aplikacji)
VITE_BASE44_APP_ID=twoj_app_id
VITE_BASE44_APP_BASE_URL=https://twoja-aplikacja.base44.app

# OpenAI (opcjonalne — czat, PDF, raporty, alerty, oferty)
VITE_OPENAI_API_KEY=sk-...
```

Wzorzec zmiennych bez sekretów: skopiuj [`.env.example`](./.env.example) i uzupełnij wartości.

```bash
npm run dev
```

Aplikacja startuje w trybie developerskim (domyślnie Vite podaje adres w terminalu).

### Aplikacja statyczna (hosting bez Node.js)

To **nie jest SSR** — front to **SPA**. Po zbudowaniu otrzymujesz wyłącznie pliki statyczne:

```bash
npm run build
# lub: npm run build:static
```

Wynik trafia do katalogu **`dist/`** (`index.html`, `assets/*`). Możesz go wgrać na dowolny hosting plików (S3 + CloudFront, Netlify, Vercel, Azure Static Web Apps, nginx z katalogiem `root`).

- **React Router:** na serwerze potrzebny jest **fallback do `index.html`** dla nieistniejących ścieżek (inaczej odświeżenie pod `/Reports` zwróci 404). Przykłady:
  - Netlify: [`public/_redirects`](./public/_redirects) (kopiowany do `dist/` przy buildzie)
  - Vercel: [`vercel.json`](./vercel.json)
- **Zmienne środowiskowe** (`VITE_*`) są **wstrzykiwane w czasie builda** — przed `npm run build` ustaw je w CI lub lokalnie w `.env.production`.

### Lokalna baza SQL.js (offline)

- Pakiet **`sql.js`** — SQLite w WebAssembly, dane zapisywane w **`localStorage`** (`mizar_db`), seed z `src/fixtures/mizar_data.json`.
- Po **`npm install`** skrypt **`postinstall`** kopiuje **`sql-wasm.wasm`** z `node_modules/sql.js/dist/` do **`public/sql-wasm.wasm`** (hosting bez CDN).
- **`vite.config.js`**: `optimizeDeps.exclude: ['sql.js']` oraz nagłówki **COOP/COEP** (`same-origin` / `require-corp`) — wymagane m.in. do pełnego wsparcia WASM; mogą blokować zasoby cross-origin (np. kafelki map z zewnętrznych domen).
- Logika: `src/lib/database.js`, zapytania wyłącznie w **`src/lib/queries.js`**, hook **`src/hooks/useDatabase.js`**, panel na dashboardzie: **`MizarSqlLocalPanel`**, reset: **Ustawienia → Resetuj bazę SQL.js**.

### Pozostałe skrypty

| Polecenie | Opis |
|-----------|------|
| `npm run build` | Build produkcyjny (`dist/`) |
| `npm run preview` | Podgląd buildu |
| `npm run lint` | ESLint |
| `npm run typecheck` | Sprawdzenie typów (jsconfig / TS) |
| `npm run test` | Vitest (interaktywnie) |
| `npm run test:run` | Vitest — jednorazowo (m.in. `database.test.js`, `sql-queries.integration.test.js` — potrzebny `sql.js` w `node_modules`) |

## Struktura projektu (skrót)

```
src/
  api/              # Klient Base44
  components/       # Komponenty UI, w tym ai/ (moduły OpenAI)
  fixtures/         # Dane statyczne (np. mizar_data.json)
  lib/              # Logika pomocnicza (openai-mizar, kontekst CRM, statystyki)
  pages/            # Widoki ekranów (routing)
  Layout.jsx        # Szablon z nawigacją boczną
  pages.config.js   # Rejestracja stron i strona startowa
```

Nowe strony w `src/pages/` są dodawane do **`pages.config.js`** (import + wpis w `PAGES`). Domyślna strona startowa ustawiana jest w `pagesConfig.mainPage`.

## Główne funkcje biznesowe

- **Dashboard CEO / operacyjny** — KPI, wykresy, eksporty (CSV, XML, PDF)
- **Faktury, przelewy, kontrahenci, hotele, transport**
- **Projekty / budowa** — obiekty, workflow, budżety
- **Cash flow, rachunek wyników, prognozy, mapa obiektów**
- **Upload faktur** — PDF (OpenAI + fallback OCR Base44), XML (JPK / e-faktura)
- **Raporty** — zestawienia i **generator raportów AI**
- **Waluty / NBP** — wielowalutowość

## Moduły AI (OpenAI)

Klucz: zmienna **`VITE_OPENAI_API_KEY`** lub nadpisanie w **Ustawienia AI** (przechowywane w przeglądarce — tylko do pracy lokalnej; w produkcji preferuj bezpieczny backend).

| Moduł | Opis |
|--------|------|
| **Asystent finansowy** | Pływający przycisk „Zapytaj AI” — czat z kontekstem danych CRM (JSON) |
| **Analiza faktury PDF** | Ekstrakcja pól do formularza, podświetlenie pól z AI, „Popraw z AI” |
| **Generator raportów** | Raporty tekstowe (zarząd, bank, projekt, rentowność) + eksport |
| **Alerty AI** | Na dashboardzie — analiza okresowa z cache w `localStorage` |
| **Oferty** | Szacunek szansy wygrania dla projektów w statusie oferty |

Szczegóły implementacji: `src/lib/openai-mizar.js`, `src/lib/ai-crm-context.js`, komponenty w `src/components/ai/`.

## Bezpieczeństwo i RODO

- Klucz OpenAI w prefiksie **`VITE_`** jest **wbudowywany w bundle frontu** — nie umieszczaj go w repozytorium publicznym.
- W środowisku firmowym rozważ **proxy serwerowe** do OpenAI zamiast wywołań z przeglądarki.
- Dane osobowe i finansowe podlegają polityce Base44 oraz wewnętrznym procedurom MIZAR.

## Base44 — publikacja i dokumentacja

- Edycja w Builderze: [Base44.com](https://base44.com)
- Zmiany w repozytorium mogą być synchronizowane z projektem na Base44 (zgodnie z konfiguracją konta).
- Dokumentacja integracji GitHub: [docs.base44.com](https://docs.base44.com/Integrations/Using-GitHub)
- Wsparcie: [app.base44.com/support](https://app.base44.com/support)

## Licencja i własność

Projekt prywatny (**`"private": true`** w `package.json`). Prawa do kodu i znaku MIZAR należą do właściciela repozytorium.

---

*README z myślą o zespole MIZAR — aktualizuj przy większych zmianach architektury lub wdrożeniach.*
