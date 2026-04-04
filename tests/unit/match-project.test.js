import { describe, it, expect } from "vitest";
import { matchProjectId, invoiceNipDigits } from "@/lib/match-project";

describe("match-project", () => {
  it("invoiceNipDigits usuwa znaki poza cyframi", () => {
    expect(invoiceNipDigits("123-456-78-90")).toBe("1234567890");
  });

  it("dopasowuje projekt po NIP kontrahenta", () => {
    const projects = [{ id: "p1", client_name: "X" }];
    const contractors = [{ nip: "1234567890", default_project_id: "p1" }];
    const id = matchProjectId(
      projects,
      { seller_nip: "", contractor_nip: "123-456-78-90", contractor_name: "Y" },
      { contractors }
    );
    expect(id).toBe("p1");
  });

  it("dopasowuje po słowach kluczowych obiektu", () => {
    const projects = [
      { id: "bud", client_name: "", object_name: "Inny", project_match_keywords: "stal, beton" },
    ];
    const id = matchProjectId(
      projects,
      { contractor_name: "", seller_name: "", position: "Dostawa stali", invoice_lines: "" },
      { contractors: [] }
    );
    expect(id).toBe("bud");
  });

  it("fallback: nazwa klienta obiektu", () => {
    const projects = [{ id: "p2", client_name: "ACME", object_name: "Budowa A" }];
    const id = matchProjectId(
      projects,
      { contractor_name: "ACME Sp z oo", seller_name: "", position: "" },
      { contractors: [] }
    );
    expect(id).toBe("p2");
  });
});
