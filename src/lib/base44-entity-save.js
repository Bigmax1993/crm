/**
 * Base44 / axios — czytelny komunikat błędu (403, walidacja, sieć).
 */
export function formatBase44Error(err) {
  const d = err?.response?.data;
  let msg = "";
  if (typeof d === "string") {
    msg = d;
  } else if (d && typeof d === "object") {
    msg =
      d.message ||
      d.error ||
      (Array.isArray(d.errors) ? d.errors.map((x) => (typeof x === "string" ? x : x?.message || "")).filter(Boolean).join("; ") : "") ||
      "";
  }
  if (!msg) msg = err?.data?.message || err?.message || "";
  return String(msg).replace(/\s+/g, " ").trim().slice(0, 280);
}

/**
 * bulkCreate może nie być dostępne lub zwracać błąd na niektórych backendach — wtedy zapis pojedynczy (jak w seed-test-data).
 * @param {{ bulkCreate: Function, create: Function }} entityApi
 * @param {object[]} rows
 * @param {(row: object) => string} [labelFn]
 */
export async function bulkCreateOrSequential(entityApi, rows, labelFn = (row) => row.invoice_number || row.name || "rekord") {
  if (!rows?.length) return;
  try {
    await entityApi.bulkCreate(rows);
    return;
  } catch (bulkErr) {
    console.warn("[base44-entity-save] bulkCreate failed, sequential create:", bulkErr);
  }
  for (const row of rows) {
    try {
      await entityApi.create(row);
    } catch (e) {
      const hint = formatBase44Error(e);
      throw new Error(`${labelFn(row)}${hint ? `: ${hint}` : ""}`);
    }
  }
}
