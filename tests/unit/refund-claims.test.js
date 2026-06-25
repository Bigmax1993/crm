import { describe, it, expect } from "vitest";
import {
  applyRefundReceiptToClaim,
  emptyRefundClaim,
  isRefundFollowUpOverdue,
  openRefundClaims,
  refundClaimOutstanding,
  sumOpenRefundClaimsPln,
} from "@/lib/refund-claims";

describe("refund-claims", () => {
  it("refundClaimOutstanding odejmuje otrzymaną kwotę", () => {
    const c = { amount_expected: 1000, amount_received: 300 };
    expect(refundClaimOutstanding(c)).toBe(700);
  });

  it("applyRefundReceiptToClaim ustawia czesciowy i pelny zwrot", () => {
    const base = emptyRefundClaim({ id: "r1", amount_expected: 500, amount_received: 0, status: "zgloszono" });
    const partial = applyRefundReceiptToClaim(base, { amount: 200, currency: "PLN", title: "zwrot" });
    expect(partial.status).toBe("czesciowy");
    expect(partial.amount_received).toBe(200);

    const full = applyRefundReceiptToClaim(partial, { amount: 300, currency: "PLN" });
    expect(full.status).toBe("otrzymano");
    expect(full.amount_received).toBe(500);
  });

  it("openRefundClaims sortuje po follow-up i sumuje otwarte", () => {
    const claims = [
      { id: "a", status: "oczekuje", amount_expected: 100, amount_received: 0, follow_up_date: "2026-12-01" },
      { id: "b", status: "zgloszono", amount_expected: 50, amount_received: 0, follow_up_date: "2026-06-01" },
      { id: "c", status: "otrzymano", amount_expected: 10, amount_received: 10 },
    ];
    const open = openRefundClaims(claims);
    expect(open.map((c) => c.id)).toEqual(["b", "a"]);
    expect(sumOpenRefundClaimsPln(claims)).toBe(150);
  });

  it("isRefundFollowUpOverdue tylko dla otwartych po terminie", () => {
    const claim = { status: "zgloszono", follow_up_date: "2020-01-01" };
    expect(isRefundFollowUpOverdue(claim, new Date("2026-06-01"))).toBe(true);
    expect(isRefundFollowUpOverdue({ ...claim, status: "otrzymano" }, new Date("2026-06-01"))).toBe(false);
  });
});
