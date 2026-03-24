import { describe, it, expect } from "vitest";
import {
  getBrandBriefForPrompt,
  getExportReportTitle,
  EXPORT_ADDRESS,
  EXPORT_WEB,
  EXPORT_BRAND_RGB,
  EXPORT_BRAND_EXCEL_ARGB,
} from "@/lib/brand-brief";

describe("brand-brief", () => {
  it("getBrandBriefForPrompt zawiera Fakturowo", () => {
    const t = getBrandBriefForPrompt();
    expect(t).toContain("Fakturowo");
  });

  it("getExportReportTitle", () => {
    expect(getExportReportTitle()).toContain("Fakturowo");
    expect(getExportReportTitle("eksport Excel")).toContain("eksport Excel");
  });

  it("stałe eksportu i kolorów", () => {
    expect(EXPORT_ADDRESS).toBe("");
    expect(EXPORT_WEB).toBe("");
    expect(EXPORT_BRAND_RGB).toEqual({ r: 108, g: 52, b: 96 });
    expect(EXPORT_BRAND_EXCEL_ARGB).toMatch(/^FF6C3460$/i);
  });
});
