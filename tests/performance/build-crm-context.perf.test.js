import { describe, it, expect } from "vitest";
import { buildCrmContextForAi } from "@/lib/ai-crm-context";

describe("wydajność — buildCrmContextForAi (fixture)", () => {
  it("kończy się poniżej progu czasu (offline Base44)", async () => {
    const base44 = {
      entities: {
        Invoice: { list: async () => [] },
        ConstructionSite: { list: async () => [] },
      },
    };
    const t0 = performance.now();
    const ctx = await buildCrmContextForAi(base44);
    const ms = performance.now() - t0;
    expect(ctx).toHaveProperty("generated_at");
    expect(ctx).toHaveProperty("fixture_snapshot");
    expect(ms).toBeLessThan(3000);
  });
});
