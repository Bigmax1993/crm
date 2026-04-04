import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { InvoiceDialogFormFields } from "@/components/invoices/InvoiceDialogFormFields";
import { invoiceFormSchema, invoiceFormDefaults } from "@/lib/invoice-schema";

function Harness({ showNotes, isCreate }) {
  const form = useForm({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: invoiceFormDefaults,
  });
  return (
    <Form {...form}>
      <form>
        <InvoiceDialogFormFields control={form.control} showNotes={showNotes} isCreate={isCreate} />
      </form>
    </Form>
  );
}

describe("InvoiceDialogFormFields", () => {
  it("renderuje podstawowe etykiety (tryb dodawania)", () => {
    render(<Harness showNotes={false} isCreate />);
    expect(screen.getByText("Numer faktury")).toBeInTheDocument();
    expect(screen.getByText("Kontrahent")).toBeInTheDocument();
    expect(screen.getByText("NIP kontrahenta")).toBeInTheDocument();
    expect(screen.getAllByText(/Kwota/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Waluta")).toBeInTheDocument();
    expect(screen.getByText(/jeśli od razu opłacona/)).toBeInTheDocument();
    expect(screen.queryByText("Notatki")).not.toBeInTheDocument();
  });

  it("w trybie edycji pokazuje notatki i dłuższy opis daty zapłaty", () => {
    render(<Harness showNotes isCreate={false} />);
    expect(screen.getByText("Notatki")).toBeInTheDocument();
    expect(screen.getByText(/dla kursu płatności/)).toBeInTheDocument();
  });
});
