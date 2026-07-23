import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  isStoredFileRef,
  storedFileRefId,
  putBlob,
  getBlob,
  getBlobObjectUrl,
  deleteBlob,
} from "@/lib/blob-file-store";

describe("blob-file-store", () => {
  it("isStoredFileRef rozpoznaje prefiks", () => {
    expect(isStoredFileRef("fakturowo-blob://abc")).toBe(true);
    expect(isStoredFileRef("data:image/png;base64,xx")).toBe(false);
    expect(isStoredFileRef("https://x")).toBe(false);
    expect(isStoredFileRef(null)).toBe(false);
  });

  it("storedFileRefId wycina id", () => {
    expect(storedFileRefId("fakturowo-blob://uuid-1")).toBe("uuid-1");
    expect(storedFileRefId("https://x")).toBeNull();
  });

  it("putBlob / getBlob roundtrip", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const ref = await putBlob(bytes, { name: "plan.pdf", type: "application/pdf" });
    expect(ref).toMatch(/^fakturowo-blob:\/\//);
    const out = await getBlob(ref);
    expect(out).toBeInstanceOf(Blob);
    const ab = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsArrayBuffer(out);
    });
    expect(Array.from(new Uint8Array(ab))).toEqual([1, 2, 3, 4]);
  });

  it("getBlobObjectUrl zwraca blob: URL", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const ref = await putBlob(blob);
    const url = await getBlobObjectUrl(ref);
    expect(String(url)).toMatch(/^blob:/);
    expect(await getBlobObjectUrl("https://cdn.example/a.pdf")).toBe("https://cdn.example/a.pdf");
  });

  it("deleteBlob usuwa plik", async () => {
    const ref = await putBlob(new Blob([new Uint8Array([9])]));
    await deleteBlob(ref);
    expect(await getBlob(ref)).toBeNull();
  });
});
