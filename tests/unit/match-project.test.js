import { describe, it, expect } from "vitest";
import {
  matchProjectId,
  matchProject,
  invoiceNipDigits,
  inferInvoiceCountry,
  inferProjectCountry,
  attachProjectMatch,
  projectMatchReasonLabel,
} from "@/lib/match-project";

describe("match-project", () => {
  it("invoiceNipDigits usuwa znaki poza cyframi", () => {
    expect(invoiceNipDigits("123-456-78-90")).toBe("1234567890");
  });

  it("inferInvoiceCountry: EUR → DE", () => {
    expect(inferInvoiceCountry({ currency: "EUR" })).toBe("DE");
  });

  it("inferInvoiceCountry: PLN → PL", () => {
    expect(inferInvoiceCountry({ currency: "PLN" })).toBe("PL");
  });

  it("inferProjectCountry: kod PL z myślnikiem", () => {
    expect(inferProjectCountry({ postal_code: "60-001" })).toBe("PL");
  });

  it("inferProjectCountry: pierwsze słowo kluczowe DE", () => {
    expect(inferProjectCountry({ project_match_keywords: "DE, Kaufland, 234" })).toBe("DE");
  });

  it("dopasowuje projekt po nr zamówienia na obiekcie", () => {
    const projects = [{ id: "p1", invoice_numbers: "PO-2024-77, inne" }];
    const r = matchProject(projects, { order_number: "PO-2024-77", currency: "EUR" });
    expect(r.project_id).toBe("p1");
    expect(r.reason).toBe("order");
  });

  it("dopasowuje po słowach kluczowych obiektu", () => {
    const projects = [
      { id: "bud", object_name: "Kaufland Marzahn", project_match_keywords: "DE, Marzahn, 234" },
    ];
    const r = matchProject(
      projects,
      { position: "Dostawa na budowę Marzahn", currency: "EUR" },
      { contractors: [] }
    );
    expect(r.project_id).toBe("bud");
    expect(["keyword", "order"]).toContain(r.reason);
  });

  it("dopasowuje po mieście w opisie", () => {
    const projects = [{ id: "p2", city: "Poznań", postal_code: "60-001", project_match_keywords: "PL" }];
    const r = matchProject(projects, { position: "Materiały Poznań centrum", currency: "PLN" });
    expect(r.project_id).toBe("p2");
    expect(r.reason).toBe("city");
  });

  it("NIP domyślny tylko dla kontrahenta typu client (nie supplier)", () => {
    const projects = [{ id: "p1", client_name: "X" }];
    const contractors = [
      { nip: "1234567890", default_project_id: "p1", type: "supplier" },
      { nip: "9876543210", default_project_id: "p1", type: "client" },
    ];
    const fromSupplier = matchProject(
      projects,
      { seller_nip: "123-456-78-90", contractor_nip: "", currency: "PLN" },
      { contractors }
    );
    expect(fromSupplier.project_id).toBeNull();

    const fromClient = matchProject(
      projects,
      { contractor_nip: "987-654-32-10", currency: "PLN" },
      { contractors }
    );
    expect(fromClient.project_id).toBe("p1");
    expect(fromClient.reason).toBe("nip_client");
  });

  it("filtruje projekty DE przy fakturze EUR", () => {
    const projects = [
      { id: "de", city: "Berlin", project_match_keywords: "DE, Berlin" },
      { id: "pl", city: "Poznań", project_match_keywords: "PL, Poznań" },
    ];
    const r = matchProject(projects, { position: "Berlin Filiale", currency: "EUR" });
    expect(r.project_id).toBe("de");
  });

  it("matchProjectId — kompatybilność wsteczna", () => {
    const projects = [{ id: "p2", client_name: "ACME" }];
    expect(
      matchProjectId(projects, { contractor_name: "ACME Sp z oo", currency: "PLN" }, { contractors: [] })
    ).toBe("p2");
  });

  it("attachProjectMatch nie nadpisuje ręcznego wyboru", () => {
    const projects = [{ id: "auto", client_name: "ACME" }];
    const inv = {
      contractor_name: "ACME",
      project_id: "manual",
      _projectMatchManual: true,
      _projectMatchReason: "manual",
    };
    const out = attachProjectMatch(inv, projects, { contractors: [] });
    expect(out.project_id).toBe("manual");
  });

  it("projectMatchReasonLabel", () => {
    expect(projectMatchReasonLabel("order")).toBe("nr zamówienia / PO");
    expect(projectMatchReasonLabel("manual")).toBe("ręcznie");
  });
});
