import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const dashMocks = vi.hoisted(() => ({
  listInvoices: vi.fn(),
  listSites: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      Invoice: { list: dashMocks.listInvoices },
      ConstructionSite: { list: dashMocks.listSites },
    },
  },
}));

import CEODashboard from "@/pages/CEODashboard";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CEODashboard />
    </QueryClientProvider>
  );
}

describe("CEODashboard — smoke (integracja)", () => {
  beforeEach(() => {
    dashMocks.listInvoices.mockReset();
    dashMocks.listSites.mockReset();
    dashMocks.listInvoices.mockResolvedValue([
      {
        invoice_type: "sales",
        status: "unpaid",
        amount_pln: 1000,
        currency: "PLN",
        amount: 1000,
      },
    ]);
    dashMocks.listSites.mockResolvedValue([{ id: "p1", object_name: "Obiekt", city: "Miasto", budget_planned: 5000 }]);
  });

  it("renderuje nagłówek i KPI po załadowaniu danych", async () => {
    renderPage();
    await waitFor(() => expect(dashMocks.listInvoices).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: /dashboard ceo/i })).toBeInTheDocument();
    expect(await screen.findByText(/suma należności/i)).toBeInTheDocument();
  });
});
