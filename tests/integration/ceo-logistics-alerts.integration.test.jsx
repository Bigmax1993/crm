import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { createLogisticsChecklistFromTemplate } from "@/lib/project-logistics-checklist";

const dashMocks = vi.hoisted(() => ({
  listInvoices: vi.fn(),
  listSites: vi.fn(),
  listExtensions: vi.fn(),
  listRefunds: vi.fn(),
  listTransfers: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      Invoice: { list: dashMocks.listInvoices },
      ConstructionSite: { list: dashMocks.listSites },
      Transfer: { list: dashMocks.listTransfers },
    },
  },
}));

vi.mock("@/lib/crm-entity-store", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listSiteExtensions: (...a) => dashMocks.listExtensions(...a),
    listRefundClaims: (...a) => dashMocks.listRefunds(...a),
  };
});

import CEODashboard from "@/pages/CEODashboard";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CEODashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CEODashboard — logistyka do załatwienia", () => {
  beforeEach(() => {
    dashMocks.listInvoices.mockReset();
    dashMocks.listSites.mockReset();
    dashMocks.listExtensions.mockReset();
    dashMocks.listRefunds.mockReset();
    dashMocks.listTransfers.mockReset();
    dashMocks.listInvoices.mockResolvedValue([]);
    dashMocks.listTransfers.mockResolvedValue([]);
    dashMocks.listRefunds.mockResolvedValue([]);
    dashMocks.listSites.mockResolvedValue([
      { id: "p1", object_name: "REWE Dresden", city: "Dresden", status: "aktywny", workflow_status: "realizacja" },
    ]);
    const checklist = createLogisticsChecklistFromTemplate();
    dashMocks.listExtensions.mockResolvedValue([
      { site_id: "p1", logistics_checklist: checklist },
    ]);
  });

  it("pokazuje kartę otwartej logistyki przy projekcie", async () => {
    renderPage();
    await waitFor(() => expect(dashMocks.listSites).toHaveBeenCalled());
    const headings = await screen.findAllByText(/logistyka do załatwienia/i);
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText(/REWE Dresden/i)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Zamówienie cementu")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /otwórz projekt/i })).toBeInTheDocument();
  });
});
