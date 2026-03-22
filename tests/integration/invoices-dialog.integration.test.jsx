import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const invoiceMocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      Invoice: {
        list: invoiceMocks.list,
        create: invoiceMocks.create,
        update: invoiceMocks.update,
        delete: invoiceMocks.delete,
      },
    },
    integrations: {
      Core: {
        UploadFile: vi.fn().mockResolvedValue({ url: "https://example.com/file.pdf" }),
      },
    },
  },
}));

vi.mock("@/lib/invoice-fx", async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    enrichInvoiceForSave: vi.fn(async (inv) => ({
      ...inv,
      amount_pln: Number(inv.amount) || 0,
    })),
  };
});

vi.mock("jspdf", () => ({
  default: vi.fn().mockImplementation(function MockJsPDF() {
    this.text = vi.fn();
    this.save = vi.fn();
    this.internal = { pageSize: { getWidth: () => 210 } };
  }),
}));

import Invoices from "@/pages/Invoices";

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Invoices />
    </QueryClientProvider>
  );
}

describe("Invoices — dialog dodawania (integracja)", () => {
  beforeEach(() => {
    invoiceMocks.list.mockReset();
    invoiceMocks.create.mockReset();
    invoiceMocks.update.mockReset();
    invoiceMocks.delete.mockReset();
    invoiceMocks.list.mockResolvedValue([]);
    invoiceMocks.create.mockResolvedValue({ id: "new-inv-1" });
  });

  it("po wysłaniu pustego formularza pokazuje błędy walidacji Zod", async () => {
    renderPage();
    await waitFor(() => expect(invoiceMocks.list).toHaveBeenCalled());

    const headerButtons = screen.getAllByRole("button", { name: /dodaj fakturę/i });
    fireEvent.click(headerButtons[0]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dodaj nową fakturę")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Wypełnij wymagane pola; po zapisie kwota w PLN zostanie uzupełniona/i)
    ).toBeInTheDocument();

    const submit = within(dialog).getByRole("button", { name: /^dodaj fakturę$/i });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(within(dialog).getByText("Podaj numer faktury")).toBeInTheDocument();
      expect(within(dialog).getByText("Podaj kontrahenta")).toBeInTheDocument();
    });
  });

  it("po uzupełnieniu wymaganych pól wywołuje Invoice.create z poprawnym payloadem", async () => {
    renderPage();
    await waitFor(() => expect(invoiceMocks.list).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole("button", { name: /dodaj fakturę/i })[0]);
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText(/numer faktury/i), {
      target: { value: "FV/TEST/01" },
    });
    fireEvent.change(within(dialog).getByLabelText(/kontrahent/i), {
      target: { value: "Firma Testowa Sp. z o.o." },
    });
    fireEvent.change(within(dialog).getByLabelText(/^kwota$/i), {
      target: { value: "199.99" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^dodaj fakturę$/i }));

    await waitFor(() => expect(invoiceMocks.create).toHaveBeenCalled());
    const payload = invoiceMocks.create.mock.calls[0][0];
    expect(payload).toMatchObject({
      invoice_number: "FV/TEST/01",
      contractor_name: "Firma Testowa Sp. z o.o.",
      amount: 199.99,
      currency: "PLN",
    });
  });
});
