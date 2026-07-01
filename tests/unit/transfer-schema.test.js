import { describe, it, expect } from "vitest";
import { listAllTransferConfirmations } from "@/lib/transfer-schema";

describe("listAllTransferConfirmations", () => {
  it("zwraca wszystkie rekordy Transfer", () => {
    const transfers = [
      {
        id: "t1",
        amount: 100,
        currency: "PLN",
        transfer_date: "2024-03-01",
        contractor_name: "ABC",
        invoice_id: "inv1",
        match_status: "dopasowano",
      },
    ];
    const rows = listAllTransferConfirmations(transfers, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("transfer");
    expect(rows[0].transferId).toBe("t1");
  });

  it("dodaje załącznik z faktury bez duplikatu URL", () => {
    const transfers = [];
    const invoices = [
      {
        id: "inv2",
        invoice_number: "FV/1/2024",
        transfer_confirmation_url: "https://cdn.example/potwierdzenie.pdf",
        amount: 500,
        currency: "PLN",
        seller_name: "Dostawca X",
      },
    ];
    const rows = listAllTransferConfirmations(transfers, invoices);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("invoice_attachment");
    expect(rows[0].invoice_id).toBe("inv2");
    expect(rows[0].file_url).toContain("potwierdzenie.pdf");
  });

  it("nie duplikuje załącznika gdy ten sam URL jest w Transfer", () => {
    const url = "https://cdn.example/same.pdf";
    const transfers = [{ id: "t1", file_url: url, amount: 1, currency: "PLN" }];
    const invoices = [{ id: "inv1", transfer_confirmation_url: url }];
    const rows = listAllTransferConfirmations(transfers, invoices);
    expect(rows).toHaveLength(1);
  });
});
