import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const hoisted = vi.hoisted(() => ({
  openaiChatCompletions: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { message: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/openai-crm", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isOpenAiConfigured: vi.fn(() => true),
    openaiChatCompletions: hoisted.openaiChatCompletions,
  };
});

vi.mock("@/lib/ai-crm-context", () => ({
  buildCrmContextForAi: vi.fn().mockResolvedValue({ invoices: [], projects: [] }),
  stringifyCrmContext: () => '{"invoices":[],"projects":[]}',
}));

vi.mock("@/api/base44Client", () => ({
  base44: {},
}));

import { AiDashboardAlerts } from "@/components/ai/AiDashboardAlerts";

describe("AiDashboardAlerts — prompt z briefem marki", () => {
  beforeEach(() => {
    hoisted.openaiChatCompletions.mockReset();
    hoisted.openaiChatCompletions.mockResolvedValue({
      text: JSON.stringify({ alerty: [], rekomendacje: [], podsumowanie: "Test" }),
    });
    localStorage.removeItem("fakturowo_ai_alerts_v1");
    localStorage.setItem("fakturowo_ai_settings_v1", JSON.stringify({ apiKeyOverride: "sk-test", alertIntervalHours: 0 }));
  });

  it("wysyła do OpenAI treść user zawierającą Fakturowo i dane CRM", async () => {
    render(<AiDashboardAlerts />);

    await waitFor(() => expect(hoisted.openaiChatCompletions).toHaveBeenCalled());
    const payload = hoisted.openaiChatCompletions.mock.calls[0][0];
    const userMsg = payload.messages.find((m) => m.role === "user");
    expect(userMsg.content).toContain("Fakturowo");
    expect(userMsg.content).toMatch(/DANE:\s*\{/);
    expect(userMsg.content).toContain("invoices");
  });
});
