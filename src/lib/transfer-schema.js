import { z } from "zod";

export const TRANSFER_MATCH_STATUSES = {
  "": "—",
  dopasowano: "Dopasowano",
  czesciowe: "Częściowe",
  niedopasowano: "Niedopasowano",
  "przy fakturze": "Załącznik przy FV",
};

export const transferSchema = z.object({
  contractor_name: z.string().optional().default(""),
  amount: z.coerce.number().optional().default(0),
  currency: z.enum(["PLN", "EUR"]).default("PLN"),
  transfer_date: z.string().optional().default(""),
  title: z.string().optional().default(""),
  account_number: z.string().optional().default(""),
  invoice_number: z.string().optional().default(""),
  invoice_id: z.string().optional().default(""),
  match_status: z.string().optional().default(""),
  payer: z.string().optional().default(""),
  file_url: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

export function emptyTransfer(overrides = {}) {
  return {
    contractor_name: "",
    amount: 0,
    currency: "PLN",
    transfer_date: "",
    title: "",
    account_number: "",
    invoice_number: "",
    invoice_id: "",
    match_status: "",
    payer: "",
    file_url: "",
    notes: "",
    ...overrides,
  };
}

export function pickTransferApiPayload(row) {
  const amount = Number(row.amount);
  return {
    contractor_name: String(row.contractor_name ?? "").trim() || undefined,
    amount: Number.isFinite(amount) ? Math.abs(amount) : undefined,
    currency: row.currency || "PLN",
    transfer_date: row.transfer_date ? String(row.transfer_date).slice(0, 10) : undefined,
    title: row.title || undefined,
    account_number: row.account_number || undefined,
    invoice_number: row.invoice_number || undefined,
    invoice_id: row.invoice_id || undefined,
    match_status: row.match_status || undefined,
    payer: row.payer || undefined,
    file_url: row.file_url || undefined,
    notes: row.notes || undefined,
    matched_at: row.invoice_id && row.match_status === "dopasowano" ? row.matched_at || new Date().toISOString() : row.matched_at,
  };
}

/**
 * Wszystkie potwierdzenia przelewów: rekordy Transfer + załączniki transfer_confirmation_url na fakturach.
 */
export function listAllTransferConfirmations(transfers = [], invoices = []) {
  const rows = [];

  for (const t of transfers) {
    rows.push({
      rowKey: `transfer:${t.id}`,
      source: "transfer",
      transferId: t.id,
      invoiceAttachmentInvoiceId: null,
      ...emptyTransfer(t),
      matched_at: t.matched_at || "",
      refund_claim_id: t.refund_claim_id || "",
    });
  }

  const transferFileUrls = new Set(
    transfers.map((t) => String(t.file_url || "").trim()).filter(Boolean)
  );

  for (const inv of invoices) {
    const url = String(inv.transfer_confirmation_url || "").trim();
    if (!url) continue;
    if (transferFileUrls.has(url)) continue;
    const linkedTransfer = transfers.find((t) => t.invoice_id === inv.id);
    if (linkedTransfer && !url) continue;
    rows.push({
      rowKey: `invoice-attachment:${inv.id}`,
      source: "invoice_attachment",
      transferId: null,
      invoiceAttachmentInvoiceId: inv.id,
      contractor_name: inv.seller_name || inv.contractor_name || "",
      amount: Number(inv.amount) || 0,
      currency: String(inv.currency || "PLN").toUpperCase() === "EUR" ? "EUR" : "PLN",
      transfer_date: String(inv.paid_at || inv.issue_date || "").slice(0, 10),
      title: `Załącznik przy FV ${inv.invoice_number || ""}`.trim(),
      account_number: "",
      invoice_number: inv.invoice_number || "",
      invoice_id: inv.id,
      match_status: "przy fakturze",
      payer: "",
      file_url: url,
      notes: "",
      matched_at: "",
      refund_claim_id: "",
    });
  }

  return rows.sort((a, b) => {
    const da = String(a.transfer_date || "");
    const db = String(b.transfer_date || "");
    return db.localeCompare(da);
  });
}

export function formatTransferAmount(row) {
  const n = Number(row?.amount);
  if (!Number.isFinite(n)) return "—";
  const cur = String(row?.currency || "PLN").toUpperCase();
  return `${n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}
