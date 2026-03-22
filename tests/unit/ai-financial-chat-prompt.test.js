import { describe, it, expect } from "vitest";
import { buildFinancialAiSystemPrompt } from "@/lib/ai-financial-chat-prompt";

describe("buildFinancialAiSystemPrompt", () => {
  it("wstawia brief marki i dane JSON do promptu systemowego", () => {
    const p = buildFinancialAiSystemPrompt('{"x":1}');
    expect(p).toContain("Mizar Sport");
    expect(p).toContain("mizarsport.eu");
    expect(p).toContain('{"x":1}');
    expect(p).toContain("asystentem finansowym CRM");
  });
});
