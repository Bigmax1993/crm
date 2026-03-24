import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const hoisted = vi.hoisted(() => ({
  openaiChatCompletions: vi.fn(),
  resolveGeoIntentWithGpt: vi.fn(),
  geocodeCityWithGpt: vi.fn(),
  buildProjectLocationMatches: vi.fn(),
  formatGeoProjectsReply: vi.fn(),
  isLikelyGeoQuestion: vi.fn(),
  listSites: vi.fn(),
  updateSite: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { message: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      ConstructionSite: {
        list: hoisted.listSites,
        update: hoisted.updateSite,
      },
    },
  },
}));

vi.mock("@/lib/ai-crm-context", () => ({
  buildCrmContextForAi: vi.fn().mockResolvedValue({ invoices: [], projects: [] }),
  stringifyCrmContext: () => '{"invoices":[],"projects":[]}',
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
  resolveGeoIntentWithGpt: hoisted.resolveGeoIntentWithGpt,
  geocodeCityWithGpt: hoisted.geocodeCityWithGpt,
  buildProjectLocationMatches: hoisted.buildProjectLocationMatches,
  formatGeoProjectsReply: hoisted.formatGeoProjectsReply,
}));

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

describe("FinancialAiChat — geolokalizacja", () => {
  beforeEach(() => {
    localStorage.clear();
    hoisted.openaiChatCompletions.mockReset();
    hoisted.resolveGeoIntentWithGpt.mockReset();
    hoisted.geocodeCityWithGpt.mockReset();
    hoisted.buildProjectLocationMatches.mockReset();
    hoisted.formatGeoProjectsReply.mockReset();
    hoisted.isLikelyGeoQuestion.mockReset();
    hoisted.listSites.mockReset();
    hoisted.updateSite.mockReset();

    hoisted.isLikelyGeoQuestion.mockReturnValue(true);
    hoisted.resolveGeoIntentWithGpt.mockResolvedValue({
      is_geo_query: true,
      city: "Krosno Odrzańskie",
      country_iso2: "PL",
      radius_km: 20,
    });
    hoisted.geocodeCityWithGpt.mockResolvedValue({
      city: "Krosno Odrzańskie",
      country_iso2: "PL",
      lat: 52.054,
      lon: 15.098,
    });
    hoisted.listSites.mockResolvedValue([
      { id: "p1", object_name: "Boisko", city: "Krosno Odrzańskie", latitude: 52.053, longitude: 15.1 },
    ]);
    hoisted.buildProjectLocationMatches.mockReturnValue([
      {
        project: { id: "p1", object_name: "Boisko", city: "Krosno Odrzańskie", latitude: 52.053, longitude: 15.1 },
        distanceKm: 0.3,
      },
    ]);
    hoisted.formatGeoProjectsReply.mockReturnValue(
      "Znalazłem projekty w okolicy Krosno Odrzańskie (PL), promień 20 km.\n\n- Boisko — 0.3 km"
    );
  });

  it("dla pytania o miejscowość używa ścieżki geo i nie odpala zwykłego chat completion", async () => {
    renderChat();

    fireEvent.click(screen.getByRole("button", { name: /zapytaj ai/i }));
    const input = await screen.findByPlaceholderText("Pytanie…");
    fireEvent.change(input, { target: { value: "Pokaż wszystkie projekty z miejscowości Krosno Odrzańskie" } });
    fireEvent.click(screen.getByRole("button", { name: /wyślij/i }));

    await waitFor(() => {
      expect(hoisted.resolveGeoIntentWithGpt).toHaveBeenCalledTimes(1);
      expect(hoisted.listSites).toHaveBeenCalledTimes(1);
    });
    expect(hoisted.openaiChatCompletions).not.toHaveBeenCalled();
    expect(await screen.findByText(/Znalazłem projekty w okolicy/)).toBeInTheDocument();
  });
});
