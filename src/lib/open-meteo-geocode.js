/**
 * Sugestie miejscowości w Polsce przez Open-Meteo Geocoding API (GeoNames).
 * Brak klucza API, CORS działa z przeglądarki; language=pl + countryCode=PL.
 *
 * https://open-meteo.com/en/docs/geocoding-api
 */

/**
 * @param {object} r — pojedynczy element z `results`
 * @returns {{ id: string, label: string, cityValue: string, lat: number, lon: number } | null}
 */
export function mapOpenMeteoResult(r) {
  if (!r || typeof r !== "object") return null;
  const name = String(r.name || "").trim();
  if (!name) return null;
  const lat = Number(r.latitude);
  const lon = Number(r.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const admin2 = r.admin2 && String(r.admin2).trim();
  const admin3 = r.admin3 && String(r.admin3).trim();
  const extra = [admin2, admin3].find((x) => x && x !== name);
  const label = extra ? `${name}, ${extra}` : name;

  return {
    id: `om-${r.id}`,
    label,
    cityValue: name,
    lat,
    lon,
  };
}

/**
 * @param {string} query
 * @returns {Promise<Array<{ id: string, label: string, cityValue: string, lat: number, lon: number }>>}
 */
export async function searchCitySuggestionsPoland(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
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

  const results = Array.isArray(data?.results) ? data.results : [];
  const seen = new Set();
  const out = [];

  for (const raw of results) {
    const row = mapOpenMeteoResult(raw);
    if (!row) continue;
    const key = `${row.cityValue.toLowerCase()}|${row.lat.toFixed(4)}|${row.lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}
