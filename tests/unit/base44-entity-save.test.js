import { describe, it, expect, vi } from "vitest";
import { formatBase44Error, bulkCreateOrSequential } from "@/lib/base44-entity-save";

describe("base44-entity-save", () => {
  it("formatBase44Error — axios response.data.message", () => {
    const err = { response: { data: { message: "Brak uprawnień" } } };
    expect(formatBase44Error(err)).toContain("uprawnień");
  });

  it("formatBase44Error — string body", () => {
    expect(formatBase44Error({ response: { data: "Server error" } })).toBe("Server error");
  });

  it("bulkCreateOrSequential — wywołuje bulkCreate, bez create gdy OK", async () => {
    const bulkCreate = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn();
    await bulkCreateOrSequential({ bulkCreate, create }, [{ id: 1 }]);
    expect(bulkCreate).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("bulkCreateOrSequential — fallback na create gdy bulk rzuci", async () => {
    const bulkCreate = vi.fn().mockRejectedValue(new Error("bulk unsupported"));
    const create = vi.fn().mockResolvedValue(undefined);
    await bulkCreateOrSequential({ bulkCreate, create }, [{ invoice_number: "FV/1" }]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ invoice_number: "FV/1" });
  });

  it("bulkCreateOrSequential — błąd create zawiera etykietę", async () => {
    const bulkCreate = vi.fn().mockRejectedValue(new Error("bulk fail"));
    const create = vi.fn().mockRejectedValue({ response: { data: { message: "Validation" } } });
    await expect(bulkCreateOrSequential({ bulkCreate, create }, [{ invoice_number: "X" }])).rejects.toThrow(/X/);
  });
});
