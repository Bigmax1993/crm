/** Schema niemieckiego LV (Leistungsverzeichnis / kosztorys prac). */

export function emptyProjectBoQ(overrides = {}) {
  return {
    document_number: "",
    title: "",
    issue_date: "",
    client_name: "",
    site_address: "",
    order_number: "",
    project_id: "",
    notes: "",
    currency: "EUR",
    total_net: null,
    total_gross: null,
    vat_percent: null,
    lines: [emptyLvLine()],
    status: "active",
    fileName: "",
    pdf_url: "",
    country: "DE",
    ...overrides,
  };
}

export function emptyLvLine() {
  return {
    position: "",
    description: "",
    unit: "m²",
    quantity: 0,
    unit_price: 0,
    line_total: 0,
  };
}

export function normalizeLvLines(lines) {
  if (!Array.isArray(lines)) {
    if (typeof lines === "string" && lines.trim()) {
      try {
        const parsed = JSON.parse(lines);
        if (Array.isArray(parsed)) return normalizeLvLines(parsed);
      } catch {
        /* ignore */
      }
    }
    return [];
  }
  return lines.map((l) => ({
    position: String(l.position ?? l.pos ?? l.oz ?? l.ordnungszahl ?? "").trim(),
    description: String(l.description ?? l.beschreibung ?? l.leistung ?? l.name ?? "").trim(),
    unit: String(l.unit ?? l.einheit ?? "m²").trim() || "m²",
    quantity: Number(l.quantity ?? l.menge ?? l.ilosc ?? 0) || 0,
    unit_price: Number(l.unit_price ?? l.einzelpreis ?? l.cena_jedn ?? 0) || 0,
    line_total: Number(l.line_total ?? l.gesamtpreis ?? l.wartosc ?? 0) || 0,
  }));
}

export function sumLvLines(lines) {
  const arr = normalizeLvLines(lines);
  return arr.reduce((s, l) => s + (l.line_total || l.quantity * l.unit_price || 0), 0);
}

export function lvLinesCount(lines) {
  return normalizeLvLines(lines).filter((l) => l.description || l.quantity).length;
}

export function formatLvMoney(amount, currency = "EUR") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: currency || "EUR" }).format(n);
}

export function lvLinesSummary(lines) {
  const arr = normalizeLvLines(lines).filter((l) => l.description);
  if (!arr.length) return "—";
  if (arr.length === 1) return arr[0].description.slice(0, 60);
  return `${arr.length} pozycji — ${arr[0].description.slice(0, 40)}…`;
}

/** Do dopasowania projektu (market DE). */
export function projectMatchPayloadFromLv(lv) {
  const lines = normalizeLvLines(lv.lines);
  const linesText = lines
    .slice(0, 15)
    .map((l) => `${l.position} ${l.description}`)
    .join(" ");
  return {
    position: `${lv.title || ""} ${lv.site_address || ""} ${lv.notes || ""} ${linesText}`.trim(),
    order_number: lv.order_number || "",
    seller_name: lv.client_name || "",
    contractor_name: lv.client_name || "",
    currency: "EUR",
  };
}

export function pickProjectBoQApiPayload(row) {
  const lines = normalizeLvLines(row.lines);
  const totalNet =
    row.total_net != null && row.total_net !== ""
      ? Number(row.total_net)
      : lines.length
        ? sumLvLines(lines)
        : undefined;
  return {
    document_number: String(row.document_number ?? "").trim(),
    title: row.title || undefined,
    issue_date: row.issue_date || undefined,
    client_name: String(row.client_name ?? "").trim() || undefined,
    site_address: row.site_address || undefined,
    order_number: row.order_number || undefined,
    project_id: row.project_id || undefined,
    notes: row.notes || undefined,
    currency: "EUR",
    total_net: totalNet,
    total_gross: row.total_gross != null && row.total_gross !== "" ? Number(row.total_gross) : undefined,
    vat_percent: row.vat_percent != null && row.vat_percent !== "" ? Number(row.vat_percent) : undefined,
    lines: lines.length ? lines : undefined,
    status: row.status || "active",
    fileName: row.fileName || undefined,
    pdf_url: row.pdf_url || undefined,
    country: "DE",
  };
}
