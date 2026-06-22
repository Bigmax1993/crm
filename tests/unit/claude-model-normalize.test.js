import { describe, it, expect } from "vitest";
import { normalizeClaudeModel, CLAUDE_MODEL_OPTIONS } from "@/lib/openai-crm";

describe("openai-crm — normalizeClaudeModel", () => {
  it("domyślnie zwraca claude-sonnet-4-6", () => {
    expect(normalizeClaudeModel("")).toBe("claude-sonnet-4-6");
  });

  it("migruje wycofany Sonnet 4.0", () => {
    expect(normalizeClaudeModel("claude-sonnet-4-20250514")).toBe("claude-sonnet-4-6");
  });

  it("naprawia uszkodzoną nazwę cla-4-20250514", () => {
    expect(normalizeClaudeModel("cla-4-20250514")).toBe("claude-sonnet-4-6");
  });

  it("migruje GPT na Sonnet", () => {
    expect(normalizeClaudeModel("gpt-4o")).toBe("claude-sonnet-4-6");
  });

  it("zostawia aktualne modele", () => {
    for (const o of CLAUDE_MODEL_OPTIONS) {
      expect(normalizeClaudeModel(o.value)).toBe(o.value);
    }
  });
});
