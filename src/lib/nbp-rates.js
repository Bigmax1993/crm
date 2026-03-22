import { format, parseISO, subDays } from "date-fns";
import { getManualMid, loadFxConfig } from "@/lib/fx-config-store";

const CACHE_PREFIX = "mizar_nbp_v1_";
const LAST_KNOWN_KEY = "mizar_nbp_last_mids_v1";

const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

function saveLastKnownMids(rates) {
  try {
    const prev = JSON.parse(localStorage.getItem(LAST_KNOWN_KEY) || "{}");
    const merged = { ...prev, ...rates };
    localStorage.setItem(LAST_KNOWN_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
}

export function getLastKnownMid(code) {
  if (code === "PLN") return 1;
  try {
    const o = JSON.parse(localStorage.getItem(LAST_KNOWN_KEY) || "{}");
    const v = o[code];
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  } catch {
    return null;
  }
}

export async function fetchNbpTableA(isoDate) {
  const url = `https://api.nbp.pl/api/exchangerates/tables/A/${isoDate}/?format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const t = data?.[0];
  if (!t?.rates) return null;
  const rates = { PLN: 1 };
  for (const r of t.rates) {
    rates[r.code] = r.mid;
  }
  return {
    effectiveDate: t.effectiveDate,
    tableNo: t.no,
    rates,
  };
}

export async function fetchNbpTableALatest() {
  const url = "https://api.nbp.pl/api/exchangerates/tables/A/?format=json";
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const t = data?.[0];
  if (!t?.rates) return null;
  const rates = { PLN: 1 };
  for (const r of t.rates) {
    rates[r.code] = r.mid;
  }
  return {
    effectiveDate: t.effectiveDate,
    tableNo: t.no,
    rates,
  };
}

function shouldRefreshLatest(cached) {
  if (!cached?.fetchedAt) return true;
  return Date.now() - cached.fetchedAt > TWENTY_FOUR_H;
}

/**
 * Tabela A dla dnia (lub wcześniejszego dnia roboczego NBP).
 */
export async function getNbpTableAForBusinessDay(requestedDate, maxBack = 14) {
  const manual = loadFxConfig().manualMid || {};
  let d = parseISO(requestedDate.slice(0, 10));
  for (let i = 0; i < maxBack; i++) {
    const ds = format(d, "yyyy-MM-dd");
    const ck = `A_${ds}`;
    const cached = cacheGet(ck);
    try {
      const live = await fetchNbpTableA(ds);
      if (live) {
        saveLastKnownMids(live.rates);
        cacheSet(ck, { payload: live, fetchedAt: Date.now() });
        return { ...live, source: "nbp", requestedDate: requestedDate.slice(0, 10) };
      }
    } catch {
      /* sieć / CORS */
    }
    if (cached?.payload) {
      saveLastKnownMids(cached.payload.rates);
      return { ...cached.payload, source: "cache", requestedDate: requestedDate.slice(0, 10) };
    }
    d = subDays(d, 1);
  }
  const fallbackRates = { PLN: 1 };
  Object.keys(manual).forEach((c) => {
    if (manual[c] != null) fallbackRates[c] = Number(manual[c]);
  });
  const last = JSON.parse(localStorage.getItem(LAST_KNOWN_KEY) || "{}");
  Object.keys(last).forEach((c) => {
    if (fallbackRates[c] == null) fallbackRates[c] = last[c];
  });
  return {
    effectiveDate: requestedDate.slice(0, 10),
    tableNo: "FALLBACK",
    rates: fallbackRates,
    source: "fallback",
    requestedDate: requestedDate.slice(0, 10),
  };
}

export async function getNbpLatestTableA() {
  const ck = "A_latest";
  const meta = cacheGet(ck);
  if (meta?.payload && !shouldRefreshLatest(meta)) {
    saveLastKnownMids(meta.payload.rates);
    return { ...meta.payload, source: "cache-latest" };
  }
  try {
    const live = await fetchNbpTableALatest();
    if (live) {
      saveLastKnownMids(live.rates);
      cacheSet(ck, { payload: live, fetchedAt: Date.now() });
      if (live.effectiveDate) {
        cacheSet(`A_${live.effectiveDate}`, { payload: live, fetchedAt: Date.now() });
      }
      return { ...live, source: "nbp-latest" };
    }
  } catch {
    /* ignore */
  }
  if (meta?.payload) {
    saveLastKnownMids(meta.payload.rates);
    return { ...meta.payload, source: "stale-latest" };
  }
  const last = JSON.parse(localStorage.getItem(LAST_KNOWN_KEY) || "{}");
  return {
    effectiveDate: format(new Date(), "yyyy-MM-dd"),
    tableNo: "LAST-KNOWN",
    rates: { PLN: 1, ...last },
    source: "last-known",
  };
}

export function getMidFromTable(table, code) {
  if (!table?.rates || !code) return null;
  const c = code.toUpperCase();
  if (c === "PLN") return 1;
  const v = table.rates[c];
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

export async function resolveMidForCurrencyOnDate(currencyCode, isoDate) {
  const code = (currencyCode || "PLN").toUpperCase();
  const day = isoDate?.slice(0, 10) || format(new Date(), "yyyy-MM-dd");
  if (code === "PLN") return { mid: 1, effectiveDate: day, table: null };
  const table = await getNbpTableAForBusinessDay(day);
  let mid = getMidFromTable(table, code);
  if (mid == null) mid = getManualMid(code);
  if (mid == null) mid = getLastKnownMid(code);
  return {
    mid: mid ?? null,
    effectiveDate: table?.effectiveDate || day,
    table,
  };
}

/** Porównanie z poprzednim dniem kalendarzowym (tabela może być ta sama). */
export async function getPreviousCalendarDayTable(isoDate) {
  const d = subDays(parseISO(isoDate.slice(0, 10)), 1);
  const prev = format(d, "yyyy-MM-dd");
  return getNbpTableAForBusinessDay(prev);
}

const EUR_CODE_CACHE_KEY = "mizar_nbp_eur_code_a_v1";

/**
 * Kurs EUR (tabela A, średni) z endpointu NBP — cache 24h w localStorage.
 * @see https://api.nbp.pl/api/exchangerates/rates/A/EUR/
 */
export async function getNbpEurMidCached() {
  const cached = cacheGet(EUR_CODE_CACHE_KEY);
  if (cached?.mid != null && cached.fetchedAt && !shouldRefreshLatest(cached)) {
    return {
      mid: Number(cached.mid),
      effectiveDate: cached.effectiveDate || null,
      source: "cache",
    };
  }
  try {
    const res = await fetch("https://api.nbp.pl/api/exchangerates/rates/A/EUR/?format=json");
    if (!res.ok) throw new Error("nbp eur");
    const j = await res.json();
    const r0 = j?.rates?.[0];
    const mid = r0?.mid != null ? Number(r0.mid) : null;
    const effectiveDate = r0?.effectiveDate || j?.effectiveDate || null;
    if (mid != null && Number.isFinite(mid)) {
      cacheSet(EUR_CODE_CACHE_KEY, { mid, effectiveDate, fetchedAt: Date.now() });
      saveLastKnownMids({ EUR: mid });
      return { mid, effectiveDate, source: "nbp-code-a" };
    }
  } catch {
    /* sieć / CORS */
  }
  if (cached?.mid != null) {
    return {
      mid: Number(cached.mid),
      effectiveDate: cached.effectiveDate || null,
      source: "stale-cache",
    };
  }
  const t = await getNbpLatestTableA();
  const mid = t?.rates?.EUR != null ? Number(t.rates.EUR) : getLastKnownMid("EUR");
  return {
    mid: mid ?? 4.35,
    effectiveDate: t?.effectiveDate || format(new Date(), "yyyy-MM-dd"),
    source: "table-fallback",
  };
}
