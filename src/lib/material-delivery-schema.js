import { z } from "zod";

const lineSchema = z.object({
  name: z.string().default(""),
  unit: z.string().default("t"),
  quantity: z.coerce.number().default(0),
});

export const materialDeliverySchema = z.object({
  document_number: z.string().min(1, "Podaj numer WZ"),
  issue_date: z.string().optional().default(""),
  supplier_name: z.string().min(1, "Podaj dostawcę"),
  supplier_nip: z.string().optional().default(""),
  project_id: z.string().optional().default(""),
  order_number: z.string().optional().default(""),
  delivery_address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  lines: z.array(lineSchema).default([]),
  status: z.enum(["pending_invoice", "linked", "invoiced"]).default("pending_invoice"),
  linked_invoice_id: z.string().optional().default(""),
  currency: z.enum(["PLN", "EUR"]).default("PLN"),
  fileName: z.string().optional().default(""),
  pdf_url: z.string().optional().default(""),
});

export const MATERIAL_DELIVERY_STATUSES = {
  pending_invoice: "Oczekuje FV",
  linked: "Powiązana z FV",
  invoiced: "Rozliczona",
};

export function emptyMaterialDelivery(overrides = {}) {
  return {
    document_number: "",
    issue_date: "",
    supplier_name: "",
    supplier_nip: "",
    project_id: "",
    order_number: "",
    delivery_address: "",
    notes: "",
    lines: [{ name: "", unit: "t", quantity: 0 }],
    status: "pending_invoice",
    linked_invoice_id: "",
    currency: "PLN",
    fileName: "",
    pdf_url: "",
    ...overrides,
  };
}

export function normalizeLines(lines) {
  if (Array.isArray(lines)) {
    return lines.map((l) => ({
      name: String(l.name ?? l.nazwa ?? "").trim(),
      unit: String(l.unit ?? l.jednostka ?? "t").trim() || "t",
      quantity: Number(l.quantity ?? l.ilosc ?? 0) || 0,
    }));
  }
  if (typeof lines === "string" && lines.trim()) {
    try {
      const parsed = JSON.parse(lines);
      if (Array.isArray(parsed)) return normalizeLines(parsed);
    } catch {
      /* ignore */
    }
  }
  return [];
}

export function linesToDisplay(lines) {
  const arr = normalizeLines(lines);
  if (!arr.length) return "—";
  return arr
    .filter((l) => l.name || l.quantity)
    .map((l) => `${l.name || "?"}: ${l.quantity} ${l.unit}`)
    .join("; ");
}

/** Obiekt do matchProjectId — jak uproszczona faktura. */
export function projectMatchPayloadFromWz(wz) {
  const lines = normalizeLines(wz.lines);
  const linesText = lines.map((l) => `${l.name} ${l.quantity} ${l.unit}`).join(" ");
  return {
    position: `${wz.delivery_address || ""} ${wz.notes || ""} ${linesText}`.trim(),
    order_number: wz.order_number || "",
    seller_name: wz.supplier_name || "",
    seller_nip: wz.supplier_nip || "",
    currency: wz.currency || "PLN",
  };
}

export function pickMaterialDeliveryApiPayload(row) {
  const lines = normalizeLines(row.lines);
  return {
    document_number: String(row.document_number ?? "").trim(),
    issue_date: row.issue_date || undefined,
    supplier_name: String(row.supplier_name ?? "").trim(),
    supplier_nip: row.supplier_nip || undefined,
    project_id: row.project_id || undefined,
    order_number: row.order_number || undefined,
    delivery_address: row.delivery_address || undefined,
    notes: row.notes || undefined,
    lines: lines.length ? lines : undefined,
    status: row.status || "pending_invoice",
    linked_invoice_id: row.linked_invoice_id || undefined,
    currency: row.currency || "PLN",
    fileName: row.fileName || undefined,
    pdf_url: row.pdf_url || undefined,
  };
}
