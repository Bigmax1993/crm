import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const cfMocks = vi.hoisted(() => ({
  listInvoices: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      Invoice: { list: cfMocks.listInvoices },
    },
  },
}));

import CashFlow from "@/pages/CashFlow";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CashFlow />
    </QueryClientProvider>
  );
}

describe("CashFlow — smoke (integracja)", () => {
  beforeEach(() => {
    cfMocks.listInvoices.mockReset();
    cfMocks.listInvoices.mockResolvedValue([]);
  });

  it("renderuje nagłówek po załadowaniu faktur", async () => {
    renderPage();
    await waitFor(() => expect(cfMocks.listInvoices).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: /^cash flow$/i })).toBeInTheDocument();
  });
});
