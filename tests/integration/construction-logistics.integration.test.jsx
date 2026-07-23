import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { patchSiteExtension } from "@/lib/crm-local-store";
import { createLogisticsChecklistFromTemplate } from "@/lib/project-logistics-checklist";

vi.mock("@/components/ai/ConstructionOffersAi", () => ({
  ConstructionOffersAi: () => null,
}));

vi.mock("@/lib/crm-entity-store", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listSiteExtensions: vi.fn(async () => {
      const { loadCrmLocalState } = await import("@/lib/crm-local-store");
      const st = loadCrmLocalState();
      return Object.entries(st.siteExtensions || {}).map(([site_id, ext]) => ({ site_id, ...ext }));
    }),
    patchSiteExtensionEntity: vi.fn(async (siteId, partial) => {
      const { patchSiteExtension } = await import("@/lib/crm-local-store");
      patchSiteExtension(siteId, partial);
    }),
    removeSiteExtensionEntity: vi.fn(),
  };
});

const constructionMocks = vi.hoisted(() => ({
  listSites: vi.fn(),
  updateSite: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      ConstructionSite: {
        list: constructionMocks.listSites,
        create: vi.fn(),
        update: constructionMocks.updateSite,
        delete: vi.fn(),
      },
    },
    integrations: {
      Core: { UploadFile: vi.fn() },
    },
  },
}));

vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn(),
  AUDIT_ACTIONS: { PROJECT_UPDATE: "PROJECT_UPDATE" },
}));

import Construction from "@/pages/Construction";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/Construction"]}>
        <Routes>
          <Route path="/Construction" element={<Construction />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Construction — logistyka i statusy (integracja)", () => {
  beforeEach(() => {
    localStorage.clear();
    constructionMocks.listSites.mockReset();
    constructionMocks.updateSite.mockReset();
    constructionMocks.updateSite.mockResolvedValue({});
    constructionMocks.listSites.mockResolvedValue([
      {
        id: "site_log_1",
        city: "Angelbachtal",
        object_name: "Netto",
        postal_code: "74918",
        status: "aktywny",
        workflow_status: "realizacja",
        notes: "",
        photo_documentation: "",
        invoice_count: 0,
      },
    ]);
  });

  it("pokazuje postęp logistyki w tabeli", async () => {
    const checklist = createLogisticsChecklistFromTemplate();
    checklist.sections[0].items[0].status = "done";
    checklist.sections[0].items[1].status = "done";
    checklist.sections[0].items[2].status = "done";
    checklist.sections[0].items[3].status = "done";
    checklist.sections[1].items[0].status = "done";
    patchSiteExtension("site_log_1", { logistics_checklist: checklist });

    renderPage();
    await waitFor(() => expect(constructionMocks.listSites).toHaveBeenCalled());
    expect(await screen.findByText("5/15")).toBeInTheDocument();
  });

  it("formularz nowego obiektu ma pole Obiekt i przycisk wstawienia checklisty", async () => {
    renderPage();
    await waitFor(() => expect(constructionMocks.listSites).toHaveBeenCalled());
    const addButtons = screen.getAllByRole("button", { name: /dodaj obiekt/i });
    addButtons[0].click();
    expect(await screen.findByLabelText(/obiekt \*/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /wstaw checklistę z szablonu/i })).toBeInTheDocument();
  });
});
