import { describe, it, expect } from "vitest";
import { getExportReportTitle } from "@/lib/mizar-brand-brief";

describe("getExportReportTitle — snapshoty tekstu", () => {
  it("domyślny tytuł raportu", () => {
    expect(getExportReportTitle()).toMatchSnapshot();
  });

  it("tytuł ze suffiksem", () => {
    expect(getExportReportTitle("eksport Excel")).toMatchSnapshot();
  });
});
