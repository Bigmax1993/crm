import { format, parseISO, isValid } from "date-fns";
import { replaceLegacyDefaultPayer } from "@/lib/invoice-schema";
import { resolveMidForCurrencyOnDate, getNbpTableAForBusinessDay, getMidFromTable } from "@/lib/nbp-rates";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pola PLN według kursu z dnia wystawienia (historyczny NBP).
 */
export async function computeIssuePlnSnapshot(invoice) {
  const cur = (invoice.currency || "PLN").toUpperCase();
  const amt = num(invoice.amount);
  if (amt == null) return {};
  const issue =
    invoice.issue_date && isValid(parseISO(String(invoice.issue_date).slice(0, 10)))
      ? String(invoice.issue_date).slice(0, 10)
      : format(new Date(), "yyyy-MM-dd");

  if (cur === "PLN") {
    return {
      amount_pln: amt,
      nbp_mid_issue: 1,
      nbp_table_date_issue: issue,
    };
  }

  const { mid, effectiveDate, table } = await resolveMidForCurrencyOnDate(cur, issue);
  if (mid == null) return {};
  return {
    amount_pln: amt * mid,
    nbp_mid_issue: mid,
    nbp_table_date_issue: effectiveDate,
  };
}

/**
 * Przy płatności: kurs z dnia zapłaty (paid_at lub dziś) i różnica kursowa vs wystawienie.
 */
export async function computePaidPlnSnapshot(invoice) {
  const cur = (invoice.currency || "PLN").toUpperCase();
  const amt = num(invoice.amount);
  if (amt == null || invoice.status !== "paid") return {};

  const paidDay =
    invoice.paid_at && isValid(parseISO(String(invoice.paid_at).slice(0, 10)))
      ? String(invoice.paid_at).slice(0, 10)
      : format(new Date(), "yyyy-MM-dd");

  if (cur === "PLN") {
    const issuePln = num(invoice.amount_pln) ?? amt;
    return {
      amount_pln_at_payment: amt,
      nbp_mid_paid: 1,
      nbp_table_date_paid: paidDay,
      fx_difference_pln: 0,
    };
  }

  const tablePaid = await getNbpTableAForBusinessDay(paidDay);
  let midPaid = getMidFromTable(tablePaid, cur);
  const issuePln = num(invoice.amount_pln);
  const midIssue = num(invoice.nbp_mid_issue);

  if (midPaid == null) return {};
  const amountPlnAtPayment = amt * midPaid;
  let fxDiff = 0;
  if (issuePln != null && midIssue != null) {
    fxDiff = amountPlnAtPayment - issuePln;
  }

  return {
    amount_pln_at_payment: amountPlnAtPayment,
    nbp_mid_paid: midPaid,
    nbp_table_date_paid: tablePaid.effectiveDate,
    fx_difference_pln: fxDiff,
  };
}

export async function enrichInvoiceForSave(invoice, { recomputePaid = false } = {}) {
  const issueSnap = await computeIssuePlnSnapshot(invoice);
  let out = { ...invoice, ...issueSnap };
  if (invoice.status === "paid" && recomputePaid) {
    const paidSnap = await computePaidPlnSnapshot({ ...out, status: "paid" });
    out = { ...out, ...paidSnap };
  }
  return out;
}

const API_KEYS = new Set([
  "invoice_number",
  "contractor_name",
  "contractor_nip",
  "amount",
  "amount_eur",
  "currency",
  "issue_date",
  "payment_deadline",
  "position",
  "notes",
  "status",
  "invoice_type",
  "payer",
  "project_id",
  "pdf_url",
  "transfer_confirmation_url",
  "order_number",
  "invoice_lines",
  "net_amount",
  "vat_amount",
  "category",
  "hotel_name",
  "city",
  "persons_count",
  "stay_period",
  "amount_pln",
  "nbp_mid_issue",
  "nbp_table_date_issue",
  "paid_at",
  "amount_pln_at_payment",
  "nbp_mid_paid",
  "nbp_table_date_paid",
  "fx_difference_pln",
]);

/** Pola bezpieczne do wysłania do Base44 (bez meta z importu). */
export function pickInvoiceApiPayload(obj) {
  const out = {};
  for (const k of API_KEYS) {
    if (obj[k] === undefined) continue;
    let v = obj[k];
    if (k === "payer" && v != null) v = replaceLegacyDefaultPayer(v);
    out[k] = v;
  }
  return out;
}
