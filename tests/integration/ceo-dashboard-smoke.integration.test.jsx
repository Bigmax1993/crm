import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
        id: "inv-1",
        invoice_type: "sales",
        status: "unpaid",
        amount_pln: 1000,
        currency: "PLN",
        amount: 1000,
      },
      {
        id: "inv-2",
        invoice_type: "cost",
        status: "unpaid",
        invoice_number: "FV/1/2026",
        amount_pln: 4585.8,
        currency: "PLN",
        amount: 4585.8,
        payment_deadline: "2026-07-01",
      },
    ]);
    dashMocks.listSites.mockResolvedValue([
      { id: "p1", object_name: "Realizacja A", city: "Miasto", budget_planned: 5000, status: "aktywny", workflow_status: "realizacja" },
      { id: "p2", object_name: "Realizacja B", city: "Miasto", budget_planned: 3000, status: "aktywny", workflow_status: "oferta" },
      { id: "p3", object_name: "Edeka", city: "Dresden", budget_planned: 0, status: "aktywny", workflow_status: "zaplanowany" },
    ]);
  });

  it("renderuje nagłówek i KPI po załadowaniu danych", async () => {
    renderPage();
    await waitFor(() => expect(dashMocks.listInvoices).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: /pulpit ceo/i })).toBeInTheDocument();
    expect(await screen.findByText(/suma należności/i)).toBeInTheDocument();
    expect(await screen.findByText(/faktury do zapłaty/i)).toBeInTheDocument();
    expect(await screen.findByText(/FV\/1\/2026/)).toBeInTheDocument();
    expect(await screen.findByText(/wydatki według projektu/i)).toBeInTheDocument();
  });

  it("KPI Aktywne projekty nie wlicza zaplanowanych ani zakończonych", async () => {
    dashMocks.listSites.mockResolvedValue([
      { id: "p1", status: "aktywny", workflow_status: "realizacja" },
      { id: "p2", status: "aktywny", workflow_status: "zaplanowany" },
      { id: "p3", status: "zakończony", workflow_status: "realizacja" },
      { id: "p4", status: "aktywny", workflow_status: "zaplacono" },
    ]);
    renderPage();
    await waitFor(() => expect(dashMocks.listSites).toHaveBeenCalled());

    const title = await screen.findByText("Aktywne projekty");
    const card = title.closest("[class*='rounded']");
    expect(card).toBeTruthy();
    expect(within(card).getByText("1")).toBeInTheDocument();
  });
});
