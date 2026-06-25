/**
 * Dopasowanie przelewów do otwartych FV zakupowych (rozliczenia bankowe).
 */
import { getInvoiceSourceAmount } from "@/lib/finance-pln";

const AMOUNT_TOLERANCE = 0.02;

export function normalizeInvoiceNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[\/\\.\-]/g, "");
}

export function invoiceNumbersMatch(a, b) {
  const na = normalizeInvoiceNumber(a);
  const nb = normalizeInvoiceNumber(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;
  return false;
}

export function amountsMatch(invoiceAmount, transferAmount) {
  const a = Number(invoiceAmount);
  const b = Number(transferAmount);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

export function transferMatchesInvoice(transfer, invoice) {
  if (!transfer || !invoice) return { match: false, score: 0, reason: null };

  let score = 0;
  const reasons = [];

  if (transfer.invoice_number && invoice.invoice_number) {
    if (invoiceNumbersMatch(transfer.invoice_number, invoice.invoice_number)) {
      score += 50;
      reasons.push("numer FV");
    }
  }

  const invSrc = getInvoiceSourceAmount(invoice);
  const trCur = String(transfer.currency || "PLN").toUpperCase();
  const trAmt = Number(transfer.amount);

  if (invSrc && invSrc.currency === trCur && amountsMatch(invSrc.amount, trAmt)) {
    score += 40;
    reasons.push("kwota i waluta");
  } else if (invSrc && amountsMatch(invSrc.amount, trAmt)) {
    score += 15;
    reasons.push("kwota");
  }

  const seller = String(invoice.seller_name || invoice.contractor_name || "").toLowerCase();
  const party = String(transfer.contractor_name || transfer.title || "").toLowerCase();
  if (seller && party && (seller.includes(party.slice(0, 8)) || party.includes(seller.slice(0, 8)))) {
    score += 10;
    reasons.push("kontrahent");
  }

  return {
    match: score >= 35,
    score,
    reason: reasons.length ? reasons.join(", ") : null,
  };
}

/** Sugestie dopasowania przelewów do otwartych FV zakupowych. */
export function suggestPayableReconciliation(openPayables, transfers) {
  const unmatchedTransfers = (transfers || []).filter((t) => !t.invoice_id);
  const suggestions = [];

  for (const transfer of unmatchedTransfers) {
    let best = null;
    for (const invoice of openPayables || []) {
      const result = transferMatchesInvoice(transfer, invoice);
      if (!result.match) continue;
      if (!best || result.score > best.score) {
        best = { transfer, invoice, score: result.score, reason: result.reason };
      }
    }
    if (best) suggestions.push(best);
  }

  return suggestions.sort((a, b) => b.score - a.score);
}

export function listUnmatchedOutgoingTransfers(transfers) {
  return (transfers || []).filter((t) => !t.invoice_id && !t.refund_claim_id);
}
