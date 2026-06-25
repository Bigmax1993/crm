import { describe, it, expect } from "vitest";
import { matchIncomingTransferToRefundClaim, normalizeIncomingRefundTransfer } from "@/lib/refund-transfer-match";

describe("refund-transfer-match", () => {
  const claims = [
    {
      id: "c1",
      status: "zgloszono",
      supplier_name: "Kruszywa Sp. z o.o.",
      invoice_number: "FV/12/2026",
      amount_expected: 8400,
      amount_received: 0,
      material_description: "piasek",
    },
    {
      id: "c2",
      status: "oczekuje",
      supplier_name: "Bau GmbH Dresden",
      invoice_number: "RE-99",
      amount_expected: 1200,
      amount_received: 0,
    },
  ];

  it("dopasowuje wpływ po dostawcy, FV i kwocie", () => {
    const transfer = {
      sender_name: "Kruszywa Sp z oo",
      amount: 8400,
      currency: "PLN",
      title: "zwrot FV/12/2026 piasek",
      invoice_number: "FV/12/2026",
    };
    const match = matchIncomingTransferToRefundClaim(transfer, claims);
    expect(match?.claim.id).toBe("c1");
  });

  it("preferuje wskazany claim gdy score wystarczający", () => {
    const transfer = { sender_name: "Bau GmbH", amount: 1200, title: "Erstattung RE-99" };
    const match = matchIncomingTransferToRefundClaim(transfer, claims, { preferredClaimId: "c2" });
    expect(match?.claim.id).toBe("c2");
  });

  it("normalizeIncomingRefundTransfer odrzuca kwotę 0", () => {
    expect(normalizeIncomingRefundTransfer({ amount: 0 })).toBeNull();
    expect(normalizeIncomingRefundTransfer({ amount: 100, sender_name: "X" })?.amount).toBe(100);
  });
});
