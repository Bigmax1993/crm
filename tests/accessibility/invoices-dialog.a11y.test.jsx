import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "vitest-axe";
import { toHaveNoViolations } from "vitest-axe/matchers";

expect.extend({ toHaveNoViolations });

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

describe("a11y — dialog dodawania faktury", () => {
  beforeEach(() => {
    invoiceMocks.list.mockReset();
    invoiceMocks.list.mockResolvedValue([]);
    invoiceMocks.create.mockResolvedValue({ id: "x" });
  });

  it("dialog z opisem — brak krytycznych naruszeń (bez kontrastu)", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { baseElement } = render(
      <QueryClientProvider client={client}>
        <Invoices />
      </QueryClientProvider>
    );

    await waitFor(() => expect(invoiceMocks.list).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("button", { name: /dodaj fakturę/i })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/wypełnij wymagane pola/i)).toBeInTheDocument();

    const results = await axe(baseElement, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });
});
