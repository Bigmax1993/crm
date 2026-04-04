import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureContractorsForInvoice } from "@/lib/invoice-contractor-sync";
import { DEFAULT_INVOICE_PAYER } from "@/lib/invoice-schema";

describe("ensureContractorsForInvoice", () => {
  let contractors;
  let base44;

  beforeEach(() => {
    contractors = [];
    base44 = {
      entities: {
        Contractor: {
          list: vi.fn(async () => [...contractors]),
          create: vi.fn(async (row) => {
            const rec = { id: `c_${contractors.length + 1}`, ...row };
            contractors.push(rec);
            return rec;
          }),
        },
      },
    };
  });

  it("FV sprzedaży: tworzy kontrahenta typu client z nabywcy", async () => {
    await ensureContractorsForInvoice(base44, {
      invoice_type: "sales",
      contractor_name: "Klient ABC Sp. z o.o.",
      contractor_nip: "5252445767",
      seller_name: "My Company",
    });
    expect(base44.entities.Contractor.create).toHaveBeenCalledTimes(1);
    expect(base44.entities.Contractor.create.mock.calls[0][0]).toMatchObject({
      name: "Klient ABC Sp. z o.o.",
      type: "client",
    });
  });

  it("FV zakupu: tworzy dostawcę ze sprzedawcy i klienta z nabywcy", async () => {
    await ensureContractorsForInvoice(base44, {
      invoice_type: "purchase",
      seller_name: "Dostawca XYZ",
      seller_nip: "1111111111",
      contractor_name: "Odbiorca SA",
      contractor_nip: "2222222222",
    });
    expect(base44.entities.Contractor.create).toHaveBeenCalledTimes(2);
    const types = base44.entities.Contractor.create.mock.calls.map((c) => c[0].type).sort();
    expect(types).toEqual(["client", "supplier"]);
  });

  it("nie tworzy wpisu dla placeholdera płatnika", async () => {
    await ensureContractorsForInvoice(base44, {
      invoice_type: "sales",
      contractor_name: DEFAULT_INVOICE_PAYER,
      contractor_nip: "",
      seller_name: "Sprzedawca",
    });
    expect(base44.entities.Contractor.create).not.toHaveBeenCalled();
  });

  it("nie duplikuje po NIP 10-cyfrowym", async () => {
    contractors.push({
      id: "existing",
      name: "Stara nazwa",
      nip: "525-244-57-67",
      type: "client",
    });
    await ensureContractorsForInvoice(base44, {
      invoice_type: "sales",
      contractor_name: "Inna nazwa",
      contractor_nip: "5252445767",
      seller_name: "X",
    });
    expect(base44.entities.Contractor.create).not.toHaveBeenCalled();
  });
});
