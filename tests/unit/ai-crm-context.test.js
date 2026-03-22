import { describe, it, expect, beforeEach, vi } from "vitest";
import { setLeads, patchSiteExtension, setSuppliers, setPortfolio } from "@/lib/mizar-crm-local-store";
import { buildCrmContextForAi, stringifyCrmContext } from "@/lib/ai-crm-context";

describe("buildCrmContextForAi", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("łączy dane Base44 z lokalnym CRM i marką", async () => {
    setLeads([{ id: "l1", company: "LeadCo", contact_name: "Jan", status: "nowy", source: "www", assigned_to: "" }]);
    setSuppliers([{ id: "s1", name: "Gerflor", categories: "PVC" }]);
    setPortfolio([{ id: "p1", title: "Hala A", city: "Gorzów", offer_segment: "hale_sportowe", contract_value_pln: 1e6, completed_year: "2024" }]);
    patchSiteExtension("ob1", {
      offer_segment: "lekkoatletyka",
      norms_note: "PZLA",
      certifications: [],
      subsidy: { program: "LBS", stage: "składanie" },
    });

    const base44 = {
      entities: {
        Invoice: {
          list: vi.fn().mockResolvedValue([
            {
              invoice_number: "FV/1",
              contractor_name: "K1",
              amount: 100,
              currency: "PLN",
              status: "unpaid",
              invoice_type: "purchase",
              issue_date: "2026-01-15",
              project_id: null,
            },
          ]),
        },
        ConstructionSite: {
          list: vi.fn().mockResolvedValue([
            {
              id: "ob1",
              object_name: "Stadion",
              city: "Żary",
              budget_planned: 500000,
              workflow_status: "realizacja",
              status: "aktywny",
            },
          ]),
        },
      },
    };

    const ctx = await buildCrmContextForAi(base44);

    expect(ctx.marka_mizar_sport).toContain("Mizar Sport");
    expect(ctx.leady_lokalne.liczba).toBe(1);
    expect(ctx.leady_lokalne.probka[0].firma).toBe("LeadCo");
    expect(ctx.dostawcy_lokalni.liczba).toBe(1);
    expect(ctx.portfolio_realizacji.liczba).toBe(1);
    expect(ctx.faktury_live.liczba).toBe(1);
    expect(ctx.obiekty_budowy_live).toHaveLength(1);
    expect(ctx.obiekty_budowy_live[0].segment_oferty).toContain("lekkoatletycz");
    expect(ctx.obiekty_budowy_live[0].dofinansowanie.program).toBe("LBS");
    expect(ctx.mizar_fixture).toHaveProperty("projekty");
    expect(base44.entities.Invoice.list).toHaveBeenCalledTimes(1);
    expect(base44.entities.ConstructionSite.list).toHaveBeenCalledTimes(1);
  });

  it("przy błędzie API zwraca puste listy live", async () => {
    const base44 = {
      entities: {
        Invoice: { list: vi.fn().mockRejectedValue(new Error("offline")) },
        ConstructionSite: { list: vi.fn().mockRejectedValue(new Error("offline")) },
      },
    };
    const ctx = await buildCrmContextForAi(base44);
    expect(ctx.faktury_live.liczba).toBe(0);
    expect(ctx.obiekty_budowy_live).toEqual([]);
  });

  it("stringifyCrmContext zwraca JSON", () => {
    const s = stringifyCrmContext({ a: 1 });
    expect(s).toBe('{"a":1}');
  });
});
