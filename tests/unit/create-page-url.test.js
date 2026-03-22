import { describe, it, expect } from "vitest";
import { createPageUrl } from "@/utils";

describe("createPageUrl (utils)", () => {
  it("dodaje ukośnik i zamienia spacje na myślniki", () => {
    expect(createPageUrl("Invoices")).toBe("/Invoices");
    expect(createPageUrl("My Page")).toBe("/My-Page");
    expect(createPageUrl("a b c")).toBe("/a-b-c");
  });

  it("pusty string daje sam ukośnik", () => {
    expect(createPageUrl("")).toBe("/");
  });
});
