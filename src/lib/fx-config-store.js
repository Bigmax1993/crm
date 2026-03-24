const KEY = "fakturowo_fx_config_v1";

const DEFAULT = {
  baseCurrency: "PLN",
  /** @type {string[]} */
  activeCurrencies: ["PLN", "EUR", "USD", "GBP", "CHF", "CZK", "NOK", "SEK", "DKK", "HUF", "RON", "UAH"],
  /** @type {Record<string, number>} PLN za 1 jednostkę waluty — używane gdy NBP niedostępne */
  manualMid: {},
};

export function loadFxConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveFxConfig(config) {
  localStorage.setItem(KEY, JSON.stringify(config));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fakturowo-fx-config"));
  }
}

export function getManualMid(code) {
  const c = loadFxConfig();
  const v = c.manualMid?.[code];
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}
