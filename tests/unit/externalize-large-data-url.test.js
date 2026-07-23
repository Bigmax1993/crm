import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { externalizeLargeDataUrl, INLINE_MAX_BYTES } from "@/lib/local-core-integrations";
import { isStoredFileRef } from "@/lib/blob-file-store";

describe("externalizeLargeDataUrl", () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
  });

  it("zostawia mały data URL bez zmian", async () => {
    const tiny = `data:image/png;base64,${btoa("x".repeat(100))}`;
    expect(await externalizeLargeDataUrl(tiny)).toBe(tiny);
  });

  it("przenosi duży data URL do fakturowo-blob://", async () => {
    const bytes = "y".repeat(INLINE_MAX_BYTES + 5000);
    const big = `data:image/jpeg;base64,${btoa(bytes)}`;
    const out = await externalizeLargeDataUrl(big);
    expect(isStoredFileRef(out)).toBe(true);
  });

  it("nie rusza zwykłego http URL", async () => {
    expect(await externalizeLargeDataUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
  });
});
