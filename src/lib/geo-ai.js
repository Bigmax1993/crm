import { openaiChatCompletions, extractJsonObject } from "@/lib/openai-crm";

const GEO_CITY_CACHE_KEY = "fakturowo_geo_city_cache_v1";

function normalizeTown(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCountry(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
}

function readGeoCache() {
  try {
    return JSON.parse(localStorage.getItem(GEO_CITY_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeGeoCache(cache) {
  try {
    localStorage.setItem(GEO_CITY_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota errors */
  }
}

function cacheKey(city, country) {
  return `${normalizeTown(city)}|${normalizeCountry(country || "EU")}`;
}

export function isLikelyGeoQuestion(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  return (
    /miejscow|miast|lokaliz|map|koordynat|w promieniu|blisko|najbliz|projekty z/.test(t) &&
    /(projekt|obiekt|budow)/.test(t)
  );
}

function toPoint(lat, lon) {
  const a = Number(lat);
  const b = Number(lon);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: a, lon: b };
}

export function haversineKm(a, b) {
  const p1 = toPoint(a?.lat, a?.lon);
  const p2 = toPoint(b?.lat, b?.lon);
  if (!p1 || !p2) return Number.POSITIVE_INFINITY;
  const R = 6371;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lon - p1.lon) * Math.PI) / 180;
  const la1 = (p1.lat * Math.PI) / 180;
  const la2 = (p2.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aa = sinDLat * sinDLat + Math.cos(la1) * Math.cos(la2) * sinDLon * sinDLon;
  return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

export async function resolveGeoIntentWithGpt(userPrompt) {
  const geoPrompt = `Wyodrębnij intencję geolokalizacyjną z pytania użytkownika.
Zwróć WYŁĄCZNIE JSON bez markdown:
{
  "is_geo_query": true|false,
  "city": "nazwa miejscowości lub pusty string",
  "country_iso2": "kod kraju ISO2, np. PL, DE; gdy brak użyj PL",
  "radius_km": liczba (domyślnie 20),
  "reason": "krótko"
}
Pytanie: """${String(userPrompt || "").slice(0, 700)}"""`;

  const { text } = await openaiChatCompletions({
    messages: [{ role: "user", content: geoPrompt }],
    max_tokens: 220,
    temperature: 0,
  });

  const parsed = extractJsonObject(text) || {};
  const city = String(parsed.city || "").trim();
  const country_iso2 = normalizeCountry(parsed.country_iso2 || "PL") || "PL";
  const radius_km = Math.max(1, Math.min(300, Number(parsed.radius_km) || 20));
  return {
    is_geo_query: Boolean(parsed.is_geo_query && city),
    city,
    country_iso2,
    radius_km,
  };
}

export async function geocodeCityWithGpt(city, countryIso2 = "PL") {
  const normCity = String(city || "").trim();
  const normCountry = normalizeCountry(countryIso2 || "PL") || "PL";
  if (!normCity) return null;

  const cache = readGeoCache();
  const key = cacheKey(normCity, normCountry);
  const cached = cache[key];
  if (cached && Number.isFinite(cached.lat) && Number.isFinite(cached.lon)) {
    return { ...cached, source: "cache" };
  }

  const prompt = `Podaj geolokalizację miejscowości w Europie. Zwróć WYŁĄCZNIE JSON:
{
  "city": "${normCity}",
  "country_iso2": "${normCountry}",
  "lat": liczba,
  "lon": liczba,
  "confidence": liczba_0_1
}
Jeśli nie masz pewności, i miejscowość jest wieloznaczna, wybierz najbardziej prawdopodobną w kraju ${normCountry}.`;

  const { text } = await openaiChatCompletions({
    messages: [{ role: "user", content: prompt }],
    max_tokens: 180,
    temperature: 0,
  });
  const parsed = extractJsonObject(text) || {};
  const point = toPoint(parsed.lat, parsed.lon);
  if (!point) return null;

  const row = {
    city: normCity,
    country_iso2: normalizeCountry(parsed.country_iso2 || normCountry) || normCountry,
    lat: point.lat,
    lon: point.lon,
    confidence: Number(parsed.confidence) || 0.6,
    ts: Date.now(),
  };
  cache[key] = row;
  writeGeoCache(cache);
  return { ...row, source: "gpt" };
}

export function buildProjectLocationMatches(projects, centerPoint, radiusKm = 20) {
  const r = Math.max(1, Number(radiusKm) || 20);
  const rows = [];
  for (const p of projects || []) {
    const point = toPoint(p.latitude, p.longitude);
    if (!point) continue;
    const distanceKm = haversineKm(centerPoint, point);
    if (distanceKm <= r) {
      rows.push({ project: p, distanceKm });
    }
  }
  rows.sort((a, b) => a.distanceKm - b.distanceKm);
  return rows;
}

export function formatGeoProjectsReply({ city, countryIso2, radiusKm, rows }) {
  const hdr = `Znalazłem projekty w okolicy ${city} (${countryIso2}), promień ${Math.round(radiusKm)} km.`;
  if (!rows?.length) {
    return `${hdr}\n\nBrak projektów w tym promieniu.`;
  }
  const top = rows.slice(0, 30);
  const list = top
    .map(({ project, distanceKm }) => {
      const name = project.object_name || "Bez nazwy";
      const pc = project.postal_code ? `, ${project.postal_code}` : "";
      const c = project.city ? ` (${project.city}${pc})` : "";
      return `- ${name}${c} — ${distanceKm.toFixed(1)} km`;
    })
    .join("\n");
  const more = rows.length > top.length ? `\n\n+${rows.length - top.length} kolejnych.` : "";
  return `${hdr}\n\n${list}${more}`;
}
