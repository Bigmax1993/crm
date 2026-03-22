import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const exportMocks = vi.hoisted(() => {
  const saveAs = vi.fn();
  const writeBuffer = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
  const getNbpTableAForBusinessDay = vi.fn();
  const listInvoices = vi.fn();
  const listProjects = vi.fn();

  function makeRowMock() {
    return {
      getCell: vi.fn(() => ({ value: null, fill: {}, font: {} })),
      eachCell: vi.fn((cb) => cb({ fill: {} })),
      font: {},
      alignment: {},
      values: [],
    };
  }

  function createWorksheet() {
    let addRowCalls = 0;
    return {
      columns: [],
      insertRows: vi.fn(),
      getRow: vi.fn(() => makeRowMock()),
      mergeCells: vi.fn(),
      addRow: vi.fn(() => {
        addRowCalls += 1;
        return { getCell: () => ({ fill: {} }), font: {} };
      }),
      get rowCount() {
        return 2 + addRowCalls;
      },
      autoFilter: null,
    };
  }

  return {
    saveAs,
    writeBuffer,
    getNbpTableAForBusinessDay,
    listInvoices,
    listProjects,
    createWorksheet,
  };
});

vi.mock("file-saver", () => ({ saveAs: exportMocks.saveAs }));

vi.mock("exceljs", () => ({
  default: {
    Workbook: vi.fn().mockImplementation(() => ({
      addWorksheet: vi.fn(() => exportMocks.createWorksheet()),
      xlsx: { writeBuffer: exportMocks.writeBuffer },
    })),
  },
}));

vi.mock("@/lib/nbp-rates", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getNbpTableAForBusinessDay: exportMocks.getNbpTableAForBusinessDay,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      Invoice: { list: exportMocks.listInvoices },
      ConstructionSite: { list: exportMocks.listProjects },
    },
  },
}));

import MizarExport from "@/pages/MizarExport";

function renderPage() {
  const invoiceRow = {
    invoice_number: "FV/1",
    contractor_name: "Kontrahent",
    invoice_type: "sales",
    amount: 1000,
    currency: "PLN",
    amount_pln: 1000,
    status: "paid",
    issue_date: "2024-01-10",
    payment_deadline: "2024-02-10",
    paid_at: "2024-01-12",
    project_id: null,
    fx_difference_pln: null,
  };
  const projectRow = { id: "p1", object_name: "Projekt A", budget_planned: 5000, city: "X" };

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["invoices"], [invoiceRow]);
  client.setQueryData(["construction-sites"], [projectRow]);

  return render(
    <QueryClientProvider client={client}>
      <MizarExport />
    </QueryClientProvider>
  );
}

describe("MizarExport — eksport Excel (mock ExcelJS / NBP)", () => {
  beforeEach(() => {
    exportMocks.saveAs.mockClear();
    exportMocks.writeBuffer.mockClear();
    exportMocks.getNbpTableAForBusinessDay.mockReset();
    exportMocks.getNbpTableAForBusinessDay.mockResolvedValue({
      effectiveDate: "2024-01-10",
      rates: { PLN: 1, EUR: 4.25 },
    });
    exportMocks.listInvoices.mockReset();
    exportMocks.listProjects.mockReset();
    exportMocks.listInvoices.mockResolvedValue([
      {
        invoice_number: "FV/1",
        contractor_name: "Kontrahent",
        invoice_type: "sales",
        amount: 1000,
        currency: "PLN",
        amount_pln: 1000,
        status: "paid",
        issue_date: "2024-01-10",
        payment_deadline: "2024-02-10",
        paid_at: "2024-01-12",
        project_id: null,
        fx_difference_pln: null,
      },
    ]);
    exportMocks.listProjects.mockResolvedValue([{ id: "p1", object_name: "Projekt A", budget_planned: 5000, city: "X" }]);
  });

  it("generuje bufor XLSX i wywołuje saveAs z prefiksem MIZAR_Raport", async () => {
    renderPage();

    const btn = await screen.findByRole("button", { name: /pobierz mizar_raport/i });
    fireEvent.click(btn);

    await waitFor(() => expect(exportMocks.writeBuffer).toHaveBeenCalled());
    expect(exportMocks.saveAs).toHaveBeenCalled();
    const blobArg = exportMocks.saveAs.mock.calls[0][0];
    const nameArg = exportMocks.saveAs.mock.calls[0][1];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(nameArg).toMatch(/^MIZAR_Raport_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
