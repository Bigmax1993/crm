import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      ConstructionSite: { list: vi.fn().mockResolvedValue([{ id: "p1", object_name: "Edeka", city: "Emmerich" }]) },
      ConstructionPlan: { list: vi.fn().mockResolvedValue([]), bulkCreate: vi.fn(), create: vi.fn() },
    },
    integrations: { Core: { UploadFile: vi.fn() } },
  },
}));

vi.mock("@/lib/openai-crm", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, isClaudeConfigured: () => false };
});

import UploadPlan from "@/pages/UploadPlan";

describe("UploadPlan — smoke (integracja)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renderuje nagłówek i strefę uploadu", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <UploadPlan />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByRole("heading", { name: /import planów budowy/i })).toBeInTheDocument();
    expect(screen.getByText(/przeciągnij plany budowy|wybierz pliki/i)).toBeInTheDocument();
  });
});
