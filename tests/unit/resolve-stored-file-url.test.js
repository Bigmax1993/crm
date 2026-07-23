import { describe, it, expect, vi, beforeEach } from "vitest";

const blobMocks = vi.hoisted(() => ({
  getBlobObjectUrl: vi.fn(),
  isStoredFileRef: vi.fn(),
}));

vi.mock("@/lib/blob-file-store", () => ({
  getBlobObjectUrl: blobMocks.getBlobObjectUrl,
  isStoredFileRef: blobMocks.isStoredFileRef,
}));

import { resolveStoredFileUrl, openStoredFile, downloadStoredFile } from "@/lib/resolve-stored-file-url";

describe("resolve-stored-file-url", () => {
  beforeEach(() => {
    blobMocks.getBlobObjectUrl.mockReset();
    blobMocks.isStoredFileRef.mockReset();
    vi.stubGlobal("open", vi.fn());
  });

  it("resolveStoredFileUrl — pusty → pusty", async () => {
    expect(await resolveStoredFileUrl("")).toBe("");
    expect(await resolveStoredFileUrl(null)).toBe("");
  });

  it("resolveStoredFileUrl — zwykły URL bez IndexedDB", async () => {
    blobMocks.isStoredFileRef.mockReturnValue(false);
    expect(await resolveStoredFileUrl("https://cdn/x.pdf")).toBe("https://cdn/x.pdf");
    expect(blobMocks.getBlobObjectUrl).not.toHaveBeenCalled();
  });

  it("resolveStoredFileUrl — ref → object URL", async () => {
    blobMocks.isStoredFileRef.mockReturnValue(true);
    blobMocks.getBlobObjectUrl.mockResolvedValue("blob:http://localhost/1");
    expect(await resolveStoredFileUrl("fakturowo-blob://a")).toBe("blob:http://localhost/1");
  });

  it("openStoredFile otwiera okno", async () => {
    blobMocks.isStoredFileRef.mockReturnValue(false);
    await openStoredFile("https://x");
    expect(window.open).toHaveBeenCalledWith("https://x", "_blank", "noopener,noreferrer");
  });

  it("openStoredFile rzuca gdy brak pliku", async () => {
    blobMocks.isStoredFileRef.mockReturnValue(true);
    blobMocks.getBlobObjectUrl.mockResolvedValue("");
    await expect(openStoredFile("fakturowo-blob://missing")).rejects.toThrow(/niedostępny/i);
  });

  it("downloadStoredFile tworzy link download", async () => {
    blobMocks.isStoredFileRef.mockReturnValue(false);
    const click = vi.fn();
    const original = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      const el = original(tag);
      if (tag === "a") {
        el.click = click;
      }
      return el;
    });
    await downloadStoredFile("data:text/plain,hi", "a.txt");
    expect(click).toHaveBeenCalled();
  });
});
