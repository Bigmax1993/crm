import { describe, it, expect } from "vitest";
import { createPageUrl, createAbsolutePageHref } from "@/utils";

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

describe("createAbsolutePageHref (utils)", () => {
  it("przy domyślnym base (/) zwraca tę samą ścieżkę co createPageUrl", () => {
    expect(createAbsolutePageHref("Invoices")).toBe("/Invoices");
    expect(createAbsolutePageHref("My Page")).toBe("/My-Page");
    expect(createAbsolutePageHref("")).toBe("/");
  });
});
