import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getMidFromTable,
  getLastKnownMid,
  fetchNbpTableA,
  fetchNbpTableALatest,
  getNbpTableAForBusinessDay,
} from "@/lib/nbp-rates";

describe("nbp-rates (jednostkowe)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: async () => null,
        })
      )
    );
  });

  it("getMidFromTable — PLN i obce kody", () => {
    const t = { rates: { PLN: 1, EUR: 4.32 } };
    expect(getMidFromTable(t, "pln")).toBe(1);
    expect(getMidFromTable(t, "EUR")).toBe(4.32);
    expect(getMidFromTable(t, "XYZ")).toBeNull();
    expect(getMidFromTable(null, "EUR")).toBeNull();
  });

  it("getLastKnownMid czyta z localStorage", () => {
    localStorage.setItem(
      "fakturowo_nbp_last_mids_v1",
      JSON.stringify({ EUR: 4.1, USD: 4.0 })
    );
    expect(getLastKnownMid("EUR")).toBe(4.1);
    expect(getLastKnownMid("PLN")).toBe(1);
    expect(getLastKnownMid("XXX")).toBeNull();
  });

  it("fetchNbpTableA parsuje odpowiedź NBP", async () => {
    const sample = [
      {
        effectiveDate: "2024-06-10",
        no: "113/A/NBP/2024",
        rates: [
          { code: "EUR", mid: 4.25 },
          { code: "USD", mid: 3.98 },
        ],
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => sample,
        })
      )
    );
    const t = await fetchNbpTableA("2024-06-10");
    expect(t.effectiveDate).toBe("2024-06-10");
    expect(t.rates.EUR).toBe(4.25);
    expect(t.rates.PLN).toBe(1);
  });

  it("fetchNbpTableALatest używa endpointu bez daty", async () => {
    const f = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => [
          {
            effectiveDate: "2024-06-11",
            no: "114/A/NBP/2024",
            rates: [{ code: "CHF", mid: 4.5 }],
          },
        ],
      })
    );
    vi.stubGlobal("fetch", f);
    const t = await fetchNbpTableALatest();
    expect(t.rates.CHF).toBe(4.5);
    expect(f.mock.calls[0][0]).toContain("/tables/A/");
  });

  it("getNbpTableAForBusinessDay — sukces sieci zapisuje cache i zwraca source nbp", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => [
            {
              effectiveDate: "2024-08-01",
              no: "1/A/NBP/2024",
              rates: [{ code: "NOK", mid: 0.37 }],
            },
          ],
        })
      )
    );
    const r = await getNbpTableAForBusinessDay("2024-08-01");
    expect(r.source).toBe("nbp");
    expect(r.rates.NOK).toBe(0.37);
    const cached = localStorage.getItem("fakturowo_nbp_v1_A_2024-08-01");
    expect(cached).toBeTruthy();
  });
});
