/**
 * Sugestie miejscowości w Polsce przez Open-Meteo Geocoding API (GeoNames).
 * GeoNames często zwraca historyczne nazwy niemieckie (np. „Breslau”) przy zapytaniu ASCII —
 * normalizujemy do polskich i dublujemy zapytanie z podpowiedzią z ogonkami.
 *
 * https://open-meteo.com/en/docs/geocoding-api
 */

/** Bez ogonków, małe litery — klucz do mapy egzonimów. */
export function normalizeAsciiKey(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Typowe zapisy ASCII → oficjalna nazwa PL (drugie zapytanie do API).
 * Uzupełniaj wg potrzeb.
 */
const ASCII_QUERY_TO_POLISH_NAME = {
  wroclaw: "Wrocław",
  krakow: "Kraków",
  warsaw: "Warszawa",
  poznan: "Poznań",
  gdansk: "Gdańsk",
  szczecin: "Szczecin",
  bydgoszcz: "Bydgoszcz",
  lublin: "Lublin",
  katowice: "Katowice",
  bialystok: "Białystok",
  lodz: "Łódź",
  czestochowa: "Częstochowa",
  radom: "Radom",
  sosnowiec: "Sosnowiec",
  torun: "Toruń",
  kielce: "Kielce",
  rzeszow: "Rzeszów",
  gdynia: "Gdynia",
  zabrze: "Zabrze",
  olsztyn: "Olsztyn",
  bielsko: "Bielsko-Biała",
  elblag: "Elbląg",
  opole: "Opole",
  gorzow: "Gorzów Wielkopolski",
  walbrzych: "Wałbrzych",
  wloclawek: "Włocławek",
  tychy: "Tychy",
  "dabrowa gornicza": "Dąbrowa Górnicza",
  plock: "Płock",
};

/** Niemieckie / historyczne nazwy → polska nazwa miasta (do pola „Miasto”). */
const FOREIGN_EXONYM_TO_PL = new Map(
  normalizeEntries([
    ["Breslau", "Wrocław"],
    ["Danzig", "Gdańsk"],
    ["Stettin", "Szczecin"],
    ["Posen", "Poznań"],
    ["Bromberg", "Bydgoszcz"],
    ["Thorn", "Toruń"],
    ["Gleiwitz", "Gliwice"],
    ["Kattowitz", "Katowice"],
    ["Liegnitz", "Legnica"],
    ["Hirschberg im Riesengebirge", "Jelenia Góra"],
    ["Hirschberg", "Jelenia Góra"],
    ["Waldenburg", "Wałbrzych"],
    ["Grottkau", "Grodków"],
    ["Breslau-Stadt", "Wrocław"],
    ["Allenstein", "Olsztyn"],
    ["Marienburg", "Malbork"],
    ["Königsberg", "Królewiec"],
  ])
);

function normalizeEntries(pairs) {
  const out = [];
  for (const [de, pl] of pairs) {
    out.push([normalizeAsciiKey(de), pl]);
  }
  return out;
}

function hasPolishDiacritics(s) {
  return /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(String(s || ""));
}

function isCityLikeFeature(code) {
  const c = String(code || "");
  return /^(PPL|PPLC|PPLA|PPLQ|PPLX)/.test(c);
}

/** Odrzuć niemieckie jednostki administracyjne (Landkreis …), nie miasta. */
function shouldSkipGeocodeRow(r) {
  const n = String(r.name || "");
  const fc = String(r.feature_code || "");
  if (/landkreis|(^|\s)kreis(\s|$)|bezirk|amt\s|amtsbezirk/i.test(n) && fc.startsWith("ADM")) {
    return true;
  }
  return false;
}

/**
 * Wybierz polską nazwę do zapisu w CRM.
 */
export function resolvePolishCityName(r) {
  const raw = String(r.name || "").trim();
  if (!raw) return "";

  const norm = normalizeAsciiKey(raw);
  const fromMap = FOREIGN_EXONYM_TO_PL.get(norm);
  if (fromMap) return fromMap;

  const withoutLandkreis = norm.replace(/^landkreis\s+/, "").trim();
  const fromMap2 = FOREIGN_EXONYM_TO_PL.get(withoutLandkreis);
  if (fromMap2) return fromMap2;

  const admin2 = String(r.admin2 || "").trim();
  const admin3 = String(r.admin3 || "").trim();

  if (!hasPolishDiacritics(raw) && isCityLikeFeature(r.feature_code)) {
    if (admin2 && hasPolishDiacritics(admin2)) return admin2;
    if (admin3 && hasPolishDiacritics(admin3)) return admin3;
  }

  return raw;
}

/**
 * @param {object} r — pojedynczy element z `results`
 * @returns {{ id: string, label: string, cityValue: string, lat: number, lon: number } | null}
 */
export function mapOpenMeteoResult(r) {
  if (!r || typeof r !== "object") return null;
  if (shouldSkipGeocodeRow(r)) return null;

  const lat = Number(r.latitude);
  const lon = Number(r.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const cityValue = resolvePolishCityName(r);
  if (!cityValue) return null;

  const admin1 = r.admin1 && String(r.admin1).trim();
  const admin2 = r.admin2 && String(r.admin2).trim();
  const extra = [admin2, admin1].find((x) => x && x !== cityValue);
  const label = extra ? `${cityValue}, ${extra}` : cityValue;

  return {
    id: `om-${r.id}`,
    label,
    cityValue,
    lat,
    lon,
  };
}

async function fetchOpenMeteoByName(name) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "12");
  url.searchParams.set("language", "pl");
  url.searchParams.set("format", "json");
  url.searchParams.set("countryCode", "PL");

  const res = await fetch(url.toString());
  const data = res.ok ? await res.json() : null;

  if (!res.ok) {
    const reason = data?.reason || res.statusText || String(res.status);
    throw new Error(`Geokodowanie: ${reason}`);
  }

  return Array.isArray(data?.results) ? data.results : [];
}

/**
 * @param {string} query
 * @returns {Promise<Array<{ id: string, label: string, cityValue: string, lat: number, lon: number }>>}
 */
export async function searchCitySuggestionsPoland(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  const asciiKey = normalizeAsciiKey(q);
  const polishHint = ASCII_QUERY_TO_POLISH_NAME[asciiKey];
  const namesToFetch = polishHint && polishHint !== q ? [q, polishHint] : [q];

  const batches = await Promise.all(namesToFetch.map((n) => fetchOpenMeteoByName(n)));
  const mergedRaw = batches.flat();

  mergedRaw.sort((a, b) => (Number(b.population) || 0) - (Number(a.population) || 0));

  const seen = new Set();
  const out = [];

  for (const raw of mergedRaw) {
    const row = mapOpenMeteoResult(raw);
    if (!row) continue;
    const key = `${row.cityValue.toLowerCase()}|${row.lat.toFixed(3)}|${row.lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out.slice(0, 12);
}
