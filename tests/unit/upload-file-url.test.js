import { describe, it, expect } from "vitest";
import { getUploadFilePublicUrl } from "@/lib/upload-file-url";

describe("getUploadFilePublicUrl", () => {
  it("preferuje url (Base44 / Invoices)", () => {
    expect(getUploadFilePublicUrl({ url: "https://cdn.example/a.pdf" })).toBe(
      "https://cdn.example/a.pdf"
    );
  });

  it("obsługuje file_url", () => {
    expect(getUploadFilePublicUrl({ file_url: "https://cdn.example/b.pdf" })).toBe(
      "https://cdn.example/b.pdf"
    );
  });

  it("obsługuje fileUrl (camelCase)", () => {
    expect(getUploadFilePublicUrl({ fileUrl: "https://cdn.example/c.pdf" })).toBe(
      "https://cdn.example/c.pdf"
    );
  });

  it("zwraca null dla pustej odpowiedzi", () => {
    expect(getUploadFilePublicUrl(null)).toBeNull();
    expect(getUploadFilePublicUrl({})).toBeNull();
  });
});
