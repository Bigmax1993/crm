import { describe, it, expect, vi, beforeEach } from "vitest";
import { localUploadFile } from "@/lib/local-core-integrations";

vi.mock("@/lib/blob-file-store", () => ({
  putBlob: vi.fn(async (blob) => `fakturowo-blob://mock-${blob.size}`),
}));

describe("localUploadFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("przyjmuje File i zwraca data URL dla małego obrazu", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    const res = await localUploadFile({ file });
    expect(res.url).toMatch(/^data:image\/png;base64,/);
  });

  it("PDF trafia do IndexedDB (referencja, nie data URL)", async () => {
    const file = new File([new Uint8Array(5000)], "plan.pdf", { type: "application/pdf" });
    const res = await localUploadFile({ file });
    expect(res.url).toMatch(/^fakturowo-blob:\/\//);
  });

  it("przyjmuje ArrayBuffer", async () => {
    const buf = new Uint8Array([9, 8, 7]).buffer;
    const res = await localUploadFile({ file: buf });
    expect(res.url).toMatch(/^data:/);
  });

  it("zwraca data URL bez zmiany gdy mały", async () => {
    const data = "data:image/png;base64,abc";
    const res = await localUploadFile({ file: data });
    expect(res.url).toBe(data);
  });
});
