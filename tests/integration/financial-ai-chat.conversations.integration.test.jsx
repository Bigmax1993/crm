import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const hoisted = vi.hoisted(() => ({
  openaiChatCompletions: vi.fn(),
  isLikelyGeoQuestion: vi.fn(() => false),
}));

vi.mock("sonner", () => ({
  toast: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      ConstructionSite: {
        list: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/ai-crm-context", () => ({
  buildCrmContextForAi: vi.fn().mockResolvedValue({ invoices: [], projects: [] }),
  stringifyCrmContext: () => "{}",
}));

vi.mock("@/lib/ai-financial-chat-prompt", () => ({
  buildFinancialAiSystemPrompt: () => "SYSTEM",
}));

vi.mock("@/lib/openai-crm", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isOpenAiConfigured: vi.fn(() => true),
    canMakeAiRequest: vi.fn(() => ({ ok: true })),
    cacheGet: vi.fn(() => null),
    cacheSet: vi.fn(),
    estimateCostUsd: vi.fn(() => 0.01),
    openaiChatCompletions: hoisted.openaiChatCompletions,
  };
});

vi.mock("@/lib/geo-ai", () => ({
  isLikelyGeoQuestion: hoisted.isLikelyGeoQuestion,
  resolveGeoIntentWithGpt: vi.fn(),
  geocodeCityWithGpt: vi.fn(),
  buildProjectLocationMatches: vi.fn(),
  formatGeoProjectsReply: vi.fn(),
}));

import { toast } from "sonner";
import { FinancialAiChat } from "@/components/ai/FinancialAiChat";

function renderChat() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <FinancialAiChat />
    </QueryClientProvider>
  );
}

describe("FinancialAiChat — historia rozmów", () => {
  beforeEach(() => {
    localStorage.clear();
    hoisted.openaiChatCompletions.mockReset();
    hoisted.isLikelyGeoQuestion.mockReset();
    hoisted.isLikelyGeoQuestion.mockReturnValue(false);
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.message).mockClear();
  });

  it("Nowa rozmowa i panel historii pokazują zapisane konwersacje", async () => {
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: /zapytaj ai/i }));

    expect(await screen.findByText(/Asystent finansowy AI/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /nowa rozmowa/i }));
    expect(toast.success).toHaveBeenCalledWith("Nowa rozmowa");

    fireEvent.click(screen.getByRole("button", { name: /historia rozmów/i }));
    expect(screen.getByText(/wcześniejsze rozmowy/i)).toBeInTheDocument();

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("Usuń bieżącą rozmowę wywołuje toast", () => {
    renderChat();
    fireEvent.click(screen.getByRole("button", { name: /zapytaj ai/i }));
    fireEvent.click(screen.getByRole("button", { name: /usuń bieżącą rozmowę/i }));
    expect(toast.message).toHaveBeenCalledWith("Rozmowa usunięta");
  });
});
