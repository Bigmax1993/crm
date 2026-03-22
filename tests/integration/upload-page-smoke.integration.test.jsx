import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const uploadMocks = vi.hoisted(() => ({
  listSites: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      ConstructionSite: { list: uploadMocks.listSites },
    },
    integrations: {
      Core: {
        UploadFile: vi.fn(),
        UploadPrivateFile: vi.fn(),
      },
    },
  },
}));

import Upload from "@/pages/Upload";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["construction-sites"], []);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Upload />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Upload — smoke (integracja)", () => {
  beforeEach(() => {
    uploadMocks.listSites.mockReset();
    uploadMocks.listSites.mockResolvedValue([]);
  });

  it("renderuje nagłówek importu faktur", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: /import faktur pdf/i })).toBeInTheDocument();
  });
});
