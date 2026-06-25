/**
 * Oczekiwane zwroty środków (np. rezygnacja z materiału po opłaconej FV).
 * Dane w localStorage — patrz crm-local-store.refundClaims.
 */

export const REFUND_CLAIM_STATUSES = [
  { value: "oczekuje", label: "Oczekuje" },
  { value: "zgloszono", label: "Zgłoszono" },
  { value: "czesciowy", label: "Częściowy zwrot" },
  { value: "otrzymano", label: "Otrzymano" },
  { value: "odrzucono", label: "Odrzucono" },
];

export const REFUND_CLAIM_STATUS_LABELS = Object.fromEntries(
  REFUND_CLAIM_STATUSES.map((s) => [s.value, s.label])
);

export const REFUND_OPEN_STATUSES = new Set(["oczekuje", "zgloszono", "czesciowy"]);

export function refundClaimStatusLabel(status) {
  return REFUND_CLAIM_STATUS_LABELS[status] || status || "—";
}

export function emptyRefundClaim(overrides = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    supplier_name: "",
    project_id: "",
    invoice_id: "",
    invoice_number: "",
    material_description: "",
    amount_paid: "",
    amount_expected: "",
    amount_received: 0,
    currency: "PLN",
    status: "oczekuje",
    reported_at: today,
    follow_up_date: "",
    notes: "",
    receipts: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function refundClaimOutstanding(claim) {
  const expected = Number(claim.amount_expected) || Number(claim.amount_paid) || 0;
  const received = Number(claim.amount_received) || 0;
  return Math.max(0, Math.round((expected - received) * 100) / 100);
}

export function openRefundClaims(claims) {
  return (claims || [])
    .filter((c) => REFUND_OPEN_STATUSES.has(c.status))
    .sort((a, b) => {
      const fa = a.follow_up_date || "9999-99-99";
      const fb = b.follow_up_date || "9999-99-99";
      if (fa !== fb) return String(fa).localeCompare(String(fb));
      return refundClaimOutstanding(b) - refundClaimOutstanding(a);
    });
}

export function sumOpenRefundClaimsPln(claims) {
  return openRefundClaims(claims).reduce((s, c) => s + refundClaimOutstanding(c), 0);
}

export function isRefundFollowUpOverdue(claim, today = new Date()) {
  if (!claim?.follow_up_date || !REFUND_OPEN_STATUSES.has(claim.status)) return false;
  const d = new Date(String(claim.follow_up_date).slice(0, 10));
  if (Number.isNaN(d.getTime())) return false;
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < t;
}

/** Po wpływie zwrotu — aktualizacja kwot i statusu. */
export function applyRefundReceiptToClaim(claim, receipt) {
  const amount = Math.abs(Number(receipt.amount) || 0);
  const prevReceived = Number(claim.amount_received) || 0;
  const nextReceived = Math.round((prevReceived + amount) * 100) / 100;
  const expected = Number(claim.amount_expected) || Number(claim.amount_paid) || 0;
  const receipts = [
    ...(Array.isArray(claim.receipts) ? claim.receipts : []),
    {
      transfer_date: receipt.transfer_date || "",
      amount,
      currency: receipt.currency || claim.currency || "PLN",
      title: receipt.title || "",
      sender_name: receipt.sender_name || receipt.contractor_name || "",
      invoice_number: receipt.invoice_number || "",
      file_url: receipt.file_url || "",
      matched_at: new Date().toISOString(),
    },
  ];

  let status = claim.status;
  if (claim.status === "odrzucono") {
    status = "odrzucono";
  } else if (expected > 0 && nextReceived >= expected - 0.01) {
    status = "otrzymano";
  } else if (nextReceived > 0) {
    status = "czesciowy";
  }

  return {
    ...claim,
    amount_received: nextReceived,
    receipts,
    status,
    updated_at: new Date().toISOString(),
  };
}
