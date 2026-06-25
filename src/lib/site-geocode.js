import { searchCitySuggestionsPoland } from "@/lib/open-meteo-geocode";
import { geocodeCityWithGpt } from "@/lib/geo-ai";
import { isClaudeConfigured } from "@/lib/openai-crm";

const DE_CITY_HINTS = [
  "dresden",
  "saalfeld",
  "berlin",
  "münchen",
  "munchen",
  "hamburg",
  "köln",
  "koln",
  "frankfurt",
  "leipzig",
  "stuttgart",
  "düsseldorf",
  "dusseldorf",
];

/** Kraj obiektu — do geokodowania (PL / DE). */
export function inferSiteCountryIso2(site) {
  const kw = String(site?.project_match_keywords ?? "")
    .split(/[,;\n]/)
    .map((x) => x.trim().toUpperCase())
    .find(Boolean);
  if (kw === "DE" || kw === "PL") return kw;

  const postal = String(site?.postal_code ?? "").trim();
  if (/^\d{2}-\d{3}$/i.test(postal)) return "PL";
  if (/^\d{5}$/.test(postal.replace(/\s/g, ""))) return "DE";

  const hay = `${site?.city || ""} ${site?.notes || ""} ${site?.object_name || ""}`.toLowerCase();
  if (/\b(deutschland|germany|de)\b/.test(hay)) return "DE";

  const city = String(site?.city ?? "").toLowerCase().trim();
  if (DE_CITY_HINTS.some((c) => city === c || city.includes(c))) return "DE";

  return "PL";
}

export function siteHasCoords(site) {
  if (site?.latitude == null || site?.longitude == null || site.latitude === "" || site.longitude === "") {
    return false;
  }
  const lat = Number(site.latitude);
  const lon = Number(site.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/**
 * Uzupełnia latitude/longitude na podstawie miasta (Open-Meteo dla PL, Claude dla DE i reszty).
 * @returns {Promise<{ latitude: number, longitude: number, city?: string, source: string } | null>}
 */
export async function resolveSiteGeocode(site) {
  if (siteHasCoords(site)) {
    return {
      latitude: Number(site.latitude),
      longitude: Number(site.longitude),
      city: site.city,
      source: "existing",
    };
  }

  const city = String(site?.city ?? "").trim();
  if (!city) return null;

  const country = inferSiteCountryIso2(site);

  if (country === "PL") {
    try {
      const rows = await searchCitySuggestionsPoland(city);
      const cityKey = city.toLowerCase();
      const exact =
        rows.find((r) => String(r.cityValue ?? "").toLowerCase() === cityKey) ||
        rows.find((r) => String(r.label ?? "").toLowerCase().startsWith(cityKey)) ||
        rows[0];
      if (exact?.lat != null && exact?.lon != null) {
        return {
          latitude: Number(exact.lat),
          longitude: Number(exact.lon),
          city: exact.cityValue || city,
          source: "open-meteo",
        };
      }
    } catch {
      /* fallback do Claude */
    }
  }

  if (!isClaudeConfigured()) return null;

  const geo = await geocodeCityWithGpt(city, country);
  if (!geo?.lat || !geo?.lon) return null;

  return {
    latitude: geo.lat,
    longitude: geo.lon,
    city: geo.official_name_pl || geo.city || city,
    source: geo.source === "cache" ? "claude-cache" : "claude",
  };
}
