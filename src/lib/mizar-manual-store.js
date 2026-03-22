const KEY = "mizar_manual_balance";

export function loadManualBalance() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { gotowka: 0, magazyn: 0, aktywaTrwale: 0, kapitalWlasny: 0 };
    return { ...JSON.parse(raw) };
  } catch {
    return { gotowka: 0, magazyn: 0, aktywaTrwale: 0, kapitalWlasny: 0 };
  }
}

export function saveManualBalance(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}
