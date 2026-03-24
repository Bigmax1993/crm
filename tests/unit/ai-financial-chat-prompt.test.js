import { describe, it, expect } from "vitest";
import { buildFinancialAiSystemPrompt } from "@/lib/ai-financial-chat-prompt";

describe("buildFinancialAiSystemPrompt", () => {
  it("zawiera Fakturowo i osadzone dane kontekstu", () => {
    const p = buildFinancialAiSystemPrompt('{"x":1}');
    expect(p).toContain("Fakturowo");
    expect(p).toContain('"x":1');
  });

  it("zachowuje sekcję kontekstu, język polski i zakaz żargonu technicznego w odpowiedziach", () => {
    const p = buildFinancialAiSystemPrompt('{"projekty":[]}');
    expect(p).toContain("Odpowiadaj po polsku");
    expect(p).toMatch(/dane z systemu/i);
    expect(p).toContain("językiem biznesowym");
    expect(p).toContain("nie wspominaj");
    expect(p).toContain("formacie technicznym");
    expect(p).toContain('"projekty":[]');
  });
});
