import React, { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CurrencyDisplayProvider, useCurrencyDisplay } from "@/contexts/CurrencyDisplayContext";

vi.mock("@/lib/nbp-rates", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getNbpLatestTableA: vi.fn().mockResolvedValue({
      effectiveDate: "2024-01-01",
      rates: { PLN: 1, EUR: 4.0, USD: 4.2 },
      source: "test-mock",
    }),
  };
});

import { getNbpLatestTableA } from "@/lib/nbp-rates";

function EurDisplayProbe() {
  const { formatDisplayAmount, setDisplayCurrency } = useCurrencyDisplay();
  useEffect(() => {
    setDisplayCurrency("EUR");
  }, [setDisplayCurrency]);
  return <span data-testid="amt">{formatDisplayAmount(400)}</span>;
}

describe("CurrencyDisplayContext (integracyjne)", () => {
  it("przelicza kwotę PLN na EUR wg tabeli z zapytania", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // Buforuj NBP przed montażem — unikamy stanu „400,00 EUR” zanim pojawi się kurs EUR w mids
    await client.prefetchQuery({
      queryKey: ["nbp", "latest-table"],
      queryFn: getNbpLatestTableA,
    });

    render(
      <QueryClientProvider client={client}>
        <CurrencyDisplayProvider>
          <EurDisplayProbe />
        </CurrencyDisplayProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      const el = screen.getByTestId("amt");
      expect(el.textContent).toMatch(/100[,\.]00/);
      expect(el.textContent).toContain("EUR");
    });
  });
});
