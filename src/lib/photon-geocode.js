/**
 * Sugestie miejscowości w Polsce (Photon / OSM przez komoot).
 * Zwraca polskie etykiety (np. „Wrocław”) i współrzędne do mapy projektów.
 *
 * BBOX ~ granice PL, żeby ograniczyć wyniki z zagranicy.
 */
const PL_BBOX = "14.07,48.96,24.15,54.87";

/**
 * @param {object} feature — element z GeoJSON Photon
 * @returns {{ label: string, cityValue: string, lat: number, lon: number } | null}
 */
export function parsePhotonFeature(feature) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const p = feature.properties || {};
  const municipality = p.city || p.town || p.village || p.district || "";
  const name = (p.name && String(p.name).trim()) || "";
  /** Wartość do pola „Miasto” — preferuj jednostkę administracyjną z ogonkami. */
  const cityValue = (municipality || name || "").trim();
  if (!cityValue) return null;

  let label = cityValue;
  if (name && municipality && name !== municipality) {
    label = `${name}, ${municipality}`;
  } else if (name && !municipality) {
    label = name;
  }

  return { label, cityValue, lat, lon };
}

/**
 * @param {string} query
 * @returns {Promise<Array<{ id: string, label: string, cityValue: string, lat: number, lon: number }>>}
 */
export async function searchPhotonPoland(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("lang", "pl");
  url.searchParams.set("limit", "12");
  url.searchParams.set("bbox", PL_BBOX);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Photon HTTP ${res.status}`);
  }

  const data = await res.json();
  const features = Array.isArray(data.features) ? data.features : [];
  const seen = new Set();
  const out = [];

  for (const f of features) {
    const row = parsePhotonFeature(f);
    if (!row) continue;
    const key = `${row.cityValue.toLowerCase()}|${row.lat.toFixed(4)}|${row.lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: key,
      label: row.label,
      cityValue: row.cityValue,
      lat: row.lat,
      lon: row.lon,
    });
  }

  return out;
}
