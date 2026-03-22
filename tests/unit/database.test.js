import { describe, it, expect } from "vitest";
import { toObjects, createSeededMemoryDatabase } from "@/lib/database";

describe("database — toObjects", () => {
  it("zwraca pustą tablicę dla pustego wyniku", () => {
    expect(toObjects(null)).toEqual([]);
    expect(toObjects([])).toEqual([]);
    expect(toObjects([{ columns: ["a"], values: [] }])).toEqual([]);
  });

  it("mapuje kolumny na obiekty", () => {
    const result = [
      {
        columns: ["x", "y"],
        values: [
          [1, "a"],
          [2, "b"],
        ],
      },
    ];
    expect(toObjects(result)).toEqual([
      { x: 1, y: "a" },
      { x: 2, y: "b" },
    ]);
  });
});

describe("database — createSeededMemoryDatabase", { timeout: 30000 }, () => {
  it("tworzy bazę ze schematem i danymi z mizar_data", async () => {
    const db = await createSeededMemoryDatabase();
    const proj = toObjects(db.exec("SELECT COUNT(*) AS c FROM projekty"));
    const fakt = toObjects(db.exec("SELECT COUNT(*) AS c FROM faktury"));
    expect(Number(proj[0].c)).toBeGreaterThan(0);
    expect(Number(fakt[0].c)).toBeGreaterThan(0);
    db.close();
  });
});
