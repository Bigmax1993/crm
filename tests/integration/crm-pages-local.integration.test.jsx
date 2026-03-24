import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { loadCrmLocalState } from "@/lib/crm-local-store";
import Leads from "@/pages/Leads";
import Suppliers from "@/pages/Suppliers";
import Portfolio from "@/pages/Portfolio";

describe("CRM — strony lokalne (Leady / Dostawcy / Portfolio)", () => {
  it("Leads: zapis do localStorage i widok w tabeli", async () => {
    render(<Leads />);

    fireEvent.click(screen.getByRole("button", { name: /dodaj lead/i }));
    const dialog = await screen.findByRole("dialog");

    const leadInputs = within(dialog).getAllByRole("textbox");
    fireEvent.change(leadInputs[0], { target: { value: "Firma CRM Test" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^zapisz$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Firma CRM Test")).toBeInTheDocument();

    const state = loadCrmLocalState();
    expect(state.leads.some((l) => l.company === "Firma CRM Test")).toBe(true);
  });

  it("Suppliers: zapis do localStorage i widok w tabeli", async () => {
    render(<Suppliers />);

    fireEvent.click(screen.getByRole("button", { name: /dodaj dostawcę/i }));
    const dialog = await screen.findByRole("dialog");

    const supplierInputs = within(dialog).getAllByRole("textbox");
    fireEvent.change(supplierInputs[0], { target: { value: "Dostawca CRM Test" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^zapisz$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Dostawca CRM Test")).toBeInTheDocument();

    const state = loadCrmLocalState();
    expect(state.suppliers.some((s) => s.name === "Dostawca CRM Test")).toBe(true);
  });

  it("Portfolio: zapis segmentu i tytułu do localStorage", async () => {
    render(<Portfolio />);

    fireEvent.click(screen.getByRole("button", { name: /dodaj realizację/i }));
    const dialog = await screen.findByRole("dialog");

    const portfolioInputs = within(dialog).getAllByRole("textbox");
    fireEvent.change(portfolioInputs[0], { target: { value: "Hala testowa" } });
    fireEvent.change(portfolioInputs[1], { target: { value: "Zielona Góra" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /^zapisz$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Hala testowa")).toBeInTheDocument();
    expect(screen.getByText("Zielona Góra")).toBeInTheDocument();

    const state = loadCrmLocalState();
    const row = state.portfolio.find((p) => p.title === "Hala testowa");
    expect(row).toBeDefined();
    expect(row.city).toBe("Zielona Góra");
  });
});
