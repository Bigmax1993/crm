import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const planMocks = vi.hoisted(() => ({
  listPlans: vi.fn(),
  listSites: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      ConstructionPlan: {
        list: planMocks.listPlans,
        update: vi.fn(),
        delete: vi.fn(),
      },
      ConstructionSite: { list: planMocks.listSites },
    },
  },
}));

import ConstructionPlans from "@/pages/ConstructionPlans";

describe("ConstructionPlans — smoke (integracja)", () => {
  beforeEach(() => {
    planMocks.listPlans.mockReset();
    planMocks.listSites.mockReset();
    planMocks.listSites.mockResolvedValue([{ id: "p1", object_name: "Edeka", city: "Emmerich" }]);
    planMocks.listPlans.mockResolvedValue([
      {
        id: "plan1",
        title: "Grundriss Erdgeschoss",
        sheet_number: "A-01",
        plan_type: "floor",
        city: "Emmerich",
        project_id: "p1",
        file_url: "fakturowo-blob://x",
      },
    ]);
  });

  it("renderuje listę planów i link do importu", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ConstructionPlans />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(planMocks.listPlans).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: /plany budowy/i })).toBeInTheDocument();
    expect(await screen.findByText(/Grundriss Erdgeschoss/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /import|dodaj|wgraj/i })).toBeInTheDocument();
  });
});
