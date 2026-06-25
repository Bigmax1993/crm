import { extractInvoiceNumber } from "@/lib/transfers-parse";
import { REFUND_OPEN_STATUSES, refundClaimOutstanding } from "@/lib/refund-claims";

const AMOUNT_TOLERANCE = 0.02;

export function normalizePartyName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(sp\.?\s*z\s*o\.?\s*o\.?|s\.?\s*a\.?|gmbh|sp\.?\s*k\.?|sp\.?\s*j\.?)\b/gi, "")
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, " ")
    .trim();
}

function namesMatch(a, b) {
  const na = normalizePartyName(a);
  const nb = normalizePartyName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = na.split(/\s+/).filter((w) => w.length > 2);
  const tb = nb.split(/\s+/).filter((w) => w.length > 2);
  if (!ta.length || !tb.length) return false;
  const overlap = ta.filter((w) => tb.some((x) => x.includes(w) || w.includes(x)));
  return overlap.length >= Math.min(2, Math.min(ta.length, tb.length));
}

function invoiceNumbersMatch(a, b) {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function amountMatchesTransfer(claim, transferAmount) {
  const outstanding = refundClaimOutstanding(claim);
  const amt = Math.abs(Number(transferAmount) || 0);
  if (amt <= 0) return false;
  if (Math.abs(outstanding - amt) <= AMOUNT_TOLERANCE) return true;
  const expected = Number(claim.amount_expected) || Number(claim.amount_paid) || 0;
  if (Math.abs(expected - amt) <= AMOUNT_TOLERANCE) return true;
  if (amt < outstanding + AMOUNT_TOLERANCE) return true;
  return false;
}

function scoreRefundMatch(claim, transfer) {
  let score = 0;
  const sender = transfer.sender_name || transfer.contractor_name || "";
  const title = transfer.title || "";
  const invFromTitle = extractInvoiceNumber(title);
  const inv = transfer.invoice_number || invFromTitle;

  if (namesMatch(claim.supplier_name, sender)) score += 40;
  if (invoiceNumbersMatch(claim.invoice_number, inv)) score += 35;
  if (amountMatchesTransfer(claim, transfer.amount)) score += 25;

  const mat = String(claim.material_description || "").trim().toLowerCase();
  if (mat && title.toLowerCase().includes(mat)) score += 10;

  return score;
}

/**
 * Dopasuj wpływ (zwrot) do otwartego roszczenia.
 * @param {object} transfer — sender_name/contractor_name, amount, currency, title, invoice_number
 * @param {object[]} claims
 * @param {{ preferredClaimId?: string }} [opts]
 */
export function matchIncomingTransferToRefundClaim(transfer, claims, opts = {}) {
  const open = (claims || []).filter((c) => REFUND_OPEN_STATUSES.has(c.status));
  if (!open.length || !transfer) return null;

  if (opts.preferredClaimId) {
    const preferred = open.find((c) => c.id === opts.preferredClaimId);
    if (preferred && scoreRefundMatch(preferred, transfer) >= 25) {
      return { claim: preferred, score: scoreRefundMatch(preferred, transfer) };
    }
  }

  let best = null;
  for (const claim of open) {
    const score = scoreRefundMatch(claim, transfer);
    if (score < 35) continue;
    if (!best || score > best.score) best = { claim, score };
  }
  return best;
}

export function normalizeIncomingRefundTransfer(raw) {
  if (!raw) return null;
  const amount = Math.abs(Number(raw.amount) || 0);
  if (amount <= 0) return null;
  const title = String(raw.title || raw.description || "").trim();
  const invoice_number =
    String(raw.invoice_number || "").trim() || extractInvoiceNumber(title);
  return {
    sender_name: String(raw.sender_name || raw.contractor_name || raw.payer_name || "").trim(),
    contractor_name: String(raw.sender_name || raw.contractor_name || "").trim(),
    amount,
    currency: raw.currency === "EUR" ? "EUR" : "PLN",
    transfer_date: String(raw.transfer_date || "").slice(0, 10),
    title,
    invoice_number,
    file_url: raw.file_url || "",
    direction: "incoming",
  };
}
