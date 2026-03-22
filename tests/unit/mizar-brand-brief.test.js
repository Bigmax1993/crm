import { describe, it, expect } from "vitest";
import {
  getMizarBrandBriefForPrompt,
  getExportReportTitle,
  MIZAR_EXPORT_ADDRESS,
  MIZAR_EXPORT_WEB,
  MIZAR_BRAND_RGB,
  MIZAR_BRAND_EXCEL_ARGB,
} from "@/lib/mizar-brand-brief";

describe("mizar-brand-brief", () => {
  it("getMizarBrandBriefForPrompt zawiera kluczowe frazy marki", () => {
    const t = getMizarBrandBriefForPrompt();
    expect(t).toContain("Mizar Sport");
    expect(t).toContain("nawierzchni sportowych");
    expect(t).toContain(MIZAR_EXPORT_ADDRESS);
    expect(t).toContain("mizarsport.eu");
  });

  it("getExportReportTitle dodaje opcjonalny suffix", () => {
    expect(getExportReportTitle()).toContain("Mizar Sport");
    expect(getExportReportTitle("PDF")).toContain("PDF");
  });

  it("stałe eksportu i kolorów są spójne z #6c3460", () => {
    expect(MIZAR_EXPORT_WEB).toMatch(/^https:\/\//);
    expect(MIZAR_BRAND_RGB).toEqual({ r: 108, g: 52, b: 96 });
    expect(MIZAR_BRAND_EXCEL_ARGB).toMatch(/^FF6C3460$/i);
  });
});
