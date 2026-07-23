import { describe, it, expect } from "vitest";
import { localUploadFile } from "@/lib/local-core-integrations";

describe("localUploadFile", () => {
  it("przyjmuje File i zwraca data URL", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    const res = await localUploadFile({ file });
    expect(res.url).toMatch(/^data:image\/png;base64,/);
  });

  it("przyjmuje ArrayBuffer (stary flow Construction)", async () => {
    const buf = new Uint8Array([9, 8, 7]).buffer;
    const res = await localUploadFile({ file: buf });
    expect(res.url).toMatch(/^data:/);
  });

  it("zwraca data URL bez zmiany", async () => {
    const data = "data:image/png;base64,abc";
    const res = await localUploadFile({ file: data });
    expect(res.url).toBe(data);
  });
});
