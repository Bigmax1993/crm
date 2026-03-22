import { describe, it, expect, beforeEach } from "vitest";
import {
  loadCrmLocalState,
  saveCrmLocalState,
  patchSiteExtension,
  getSiteExtension,
  removeSiteExtension,
  getLeads,
  setLeads,
  getSuppliers,
  setSuppliers,
  getPortfolio,
  setPortfolio,
  getExpiringCertifications,
} from "@/lib/mizar-crm-local-store";

describe("mizar-crm-local-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("patchSiteExtension zapisuje i getSiteExtension odczytuje", () => {
    patchSiteExtension("s1", { offer_segment: "hale_sportowe", norms_note: "FIFA" });
    const ext = getSiteExtension("s1");
    expect(ext.offer_segment).toBe("hale_sportowe");
    expect(ext.norms_note).toBe("FIFA");
  });

  it("patchSiteExtension scala subsidy i certyfikaty", () => {
    patchSiteExtension("s2", {
      subsidy: { program: "ORLIK", stage: "wniosek" },
      certifications: [{ name: "Atest A", norm_type: "PN", expiry_date: "2030-01-01", attachment_url: "" }],
    });
    patchSiteExtension("s2", { subsidy: { stage: "rozstrzygnięcie" } });
    const ext = getSiteExtension("s2");
    expect(ext.subsidy.program).toBe("ORLIK");
    expect(ext.subsidy.stage).toBe("rozstrzygnięcie");
    expect(ext.certifications).toHaveLength(1);
    expect(ext.certifications[0].name).toBe("Atest A");
  });

  it("removeSiteExtension usuwa wpis", () => {
    patchSiteExtension("x", { offer_segment: "inne" });
    removeSiteExtension("x");
    expect(getSiteExtension("x").offer_segment).toBe("");
  });

  it("setLeads / getLeads", () => {
    setLeads([{ id: "l1", company: "A", status: "nowy" }]);
    expect(getLeads()).toHaveLength(1);
    expect(getLeads()[0].company).toBe("A");
  });

  it("setSuppliers / getSuppliers", () => {
    setSuppliers([{ id: "d1", name: "Dostawca X", categories: "nawierzchnie" }]);
    expect(getSuppliers()).toHaveLength(1);
    expect(getSuppliers()[0].name).toBe("Dostawca X");
  });

  it("setPortfolio / getPortfolio", () => {
    setPortfolio([{ id: "p1", title: "Orlik ZZ", city: "Zielona Góra", offer_segment: "boiska_pilkarskie" }]);
    expect(getPortfolio()).toHaveLength(1);
    expect(getPortfolio()[0].title).toBe("Orlik ZZ");
  });

  it("getExpiringCertifications zwraca wpisy w oknie czasu", () => {
    const soon = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    patchSiteExtension("s3", {
      certifications: [{ name: "C", norm_type: "x", expiry_date: soon, attachment_url: "" }],
    });
    const exp = getExpiringCertifications(90);
    expect(exp.length).toBeGreaterThanOrEqual(1);
    expect(exp.some((e) => e.siteId === "s3" && e.name === "C")).toBe(true);
  });

  it("saveCrmLocalState zachowuje siteExtensions", () => {
    saveCrmLocalState({
      leads: [],
      suppliers: [],
      portfolio: [],
      siteExtensions: { a: { offer_segment: "renowacje" } },
    });
    expect(loadCrmLocalState().siteExtensions.a.offer_segment).toBe("renowacje");
  });

  it("loadCrmLocalState zwraca domyślny stan", () => {
    const s = loadCrmLocalState();
    expect(s.leads).toEqual([]);
    expect(s.siteExtensions).toEqual({});
  });
});
