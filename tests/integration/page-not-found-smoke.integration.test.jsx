import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PageNotFound from "@/lib/PageNotFound";

vi.mock("@/api/base44Client", () => ({
  base44: {
    auth: {
      me: vi.fn().mockRejectedValue(new Error("brak sesji")),
    },
  },
}));

function render404(initialPath) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PageNotFound — nieistniejące trasy", () => {
  it("/Security (usunięta strona) — komunikat 404", async () => {
    render404("/Security");
    expect(await screen.findByRole("heading", { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText(/"Security"/)).toBeInTheDocument();
  });

  it("nieznana ścieżka — nazwa segmentu w treści", async () => {
    render404("/NieIstnieje");
    expect(await screen.findByText(/"NieIstnieje"/)).toBeInTheDocument();
  });
});
