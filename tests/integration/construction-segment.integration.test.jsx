import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { patchSiteExtension } from "@/lib/mizar-crm-local-store";

vi.mock("@/components/ai/ConstructionOffersAi", () => ({
  ConstructionOffersAi: () => null,
}));

const constructionMocks = vi.hoisted(() => ({
  listSites: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      ConstructionSite: {
        list: constructionMocks.listSites,
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
    integrations: {
      Core: {
        UploadFile: vi.fn().mockResolvedValue({ url: "https://example.com/x.jpg" }),
      },
    },
  },
}));

import Construction from "@/pages/Construction";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Construction />
    </QueryClientProvider>
  );
}

describe("Construction — segment oferty (local store + edycja)", () => {
  beforeEach(() => {
    constructionMocks.listSites.mockReset();
    constructionMocks.listSites.mockResolvedValue([
      {
        id: "site_seg_1",
        city: "Poznań",
        object_name: "Obiekt segmentu",
        postal_code: "",
        settlement_period: "",
        invoice_numbers: "",
        invoice_count: 0,
        status: "aktywny",
        notes: "",
        photo_documentation: "",
        budget_planned: null,
        latitude: null,
        longitude: null,
        client_name: "",
        workflow_status: "realizacja",
        payment_schedule: "",
      },
    ]);
  });

  it("wyświetla etykietę segmentu z getSiteExtension w tabeli", async () => {
    patchSiteExtension("site_seg_1", { offer_segment: "hale_sportowe" });
    renderPage();

    await waitFor(() => expect(constructionMocks.listSites).toHaveBeenCalled());
    expect(await screen.findByText("Hale sportowe")).toBeInTheDocument();
  });

  it("po „Edytuj” formularz ma wypełniony segment (Select)", async () => {
    patchSiteExtension("site_seg_1", { offer_segment: "boiska_pilkarskie" });
    renderPage();

    await waitFor(() => expect(constructionMocks.listSites).toHaveBeenCalled());
    const row = (await screen.findByText("Obiekt segmentu")).closest("tr");
    expect(row).toBeTruthy();

    const editBtn = within(row).getAllByRole("button")[0];
    fireEvent.click(editBtn);

    expect(await screen.findByText("Edytuj obiekt budowlany")).toBeInTheDocument();
    expect(screen.getAllByText("Boiska piłkarskie").length).toBeGreaterThan(0);
  });
});
