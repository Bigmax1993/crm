import { describe, it, expect, vi, beforeEach } from "vitest";

describe("database — saveDB quota", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("saveDB rzuca czytelny błąd przy QuotaExceededError", async () => {
    const { initDB, saveDB, resetDB } = await import("@/lib/database");
    resetDB();
    await initDB();

    const original = localStorage.setItem.bind(localStorage);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      if (key === "fakturowo_sqljs_v1") {
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      }
      return original(key, value);
    });

    expect(() => saveDB()).toThrow(/miejsca w pamięci|localStorage|IndexedDB/i);
  });
});
