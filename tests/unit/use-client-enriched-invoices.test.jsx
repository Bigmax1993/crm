import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const nbpMocks = vi.hoisted(() => ({
  getNbpTableAForBusinessDay: vi.fn(),
}));

vi.mock("@/lib/nbp-rates", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getNbpTableAForBusinessDay: nbpMocks.getNbpTableAForBusinessDay,
  };
});

import { useClientEnrichedInvoices } from "@/hooks/useClientEnrichedInvoices";

function createWrapper(client) {
  function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("useClientEnrichedInvoices", () => {
  beforeEach(() => {
    nbpMocks.getNbpTableAForBusinessDay.mockReset();
  });

  it("PLN bez amount_pln ustawia amount_pln z amount", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useClientEnrichedInvoices([{ amount: 250, currency: "PLN", invoice_number: "1" }]),
      { wrapper: createWrapper(client) }
    );
    expect(result.current[0].amount_pln).toBe(250);
  });

  it("EUR bez amount_pln szacuje z tabeli NBP", async () => {
    nbpMocks.getNbpTableAForBusinessDay.mockResolvedValue({
      effectiveDate: "2024-06-01",
      rates: { PLN: 1, EUR: 4.25 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () =>
        useClientEnrichedInvoices([
          { amount: 100, currency: "EUR", issue_date: "2024-06-01", invoice_number: "FX" },
        ]),
      { wrapper: createWrapper(client) }
    );

    await waitFor(() => {
      expect(result.current[0].amount_pln).toBeCloseTo(425, 5);
      expect(result.current[0]._clientEstimatedPln).toBe(true);
    });
  });

  it("nie woła NBP gdy amount_pln jest już liczbą", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(
      () =>
        useClientEnrichedInvoices([
          { amount: 100, currency: "EUR", amount_pln: 430, issue_date: "2024-01-01" },
        ]),
      { wrapper: createWrapper(client) }
    );
    expect(nbpMocks.getNbpTableAForBusinessDay).not.toHaveBeenCalled();
  });
});
