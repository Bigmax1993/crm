# Fakturowo CRM

Aplikacja webowa **CRM** (faktury, projekty, kontrahenci, cash flow, raporty) z backendem **Base44** oraz modułami **OpenAI** (asystent, OCR faktur, raporty, alerty, analiza ofert).

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
cd Fakturowo
npm install
```

Utwórz plik **`.env.local`** (lub `.env`) w katalogu głównym:

```env
VITE_BASE44_APP_ID=twoj_app_id
VITE_BASE44_APP_BASE_URL=https://twoja-aplikacja.base44.app
VITE_OPENAI_API_KEY=sk-...
```

```bash
npm run dev
```

### Lokalna baza SQL.js (offline)

- Pakiet **`sql.js`** — SQLite w WebAssembly, dane w **`localStorage`** (`fakturowo_sqljs_v1`), seed z `src/fixtures/crm_fixture_data.json`.
- Logika: `src/lib/database.js`, zapytania w **`src/lib/queries.js`**, hook **`src/hooks/useDatabase.js`**, panel: **`SqlLocalPanel`**, reset: **Ustawienia → Resetuj bazę SQL.js**.

### Build statyczny

```bash
npm run build
```

Wynik w **`dist/`**. Dla SPA potrzebny fallback do `index.html` na serwerze.

## Struktura (skrót)

```
src/
  api/              # Klient Base44
  components/       # UI, w tym ai/
  fixtures/         # crm_fixture_data.json
  lib/              # openai-crm.js, ai-crm-context.js, statystyki, finanse
  pages/            # Widoki
```

Moduły AI: `src/lib/openai-crm.js`, `src/lib/ai-crm-context.js`, `src/components/ai/`.

## Plan rozwoju (roadmap)

- **W aplikacji:** menu **System → Plan rozwoju** (`/Roadmap`) — lista faz i funkcji.
- **W repozytorium:** [`docs/PRODUCT_ROADMAP.md`](docs/PRODUCT_ROADMAP.md) oraz źródło danych [`src/lib/product-roadmap-data.js`](src/lib/product-roadmap-data.js).

## Licencja

Projekt prywatny (`"private": true` w `package.json`).
