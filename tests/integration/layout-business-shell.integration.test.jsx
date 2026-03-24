import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const layoutShellMocks = vi.hoisted(() => ({
  appParamsSnapshot: {
    appId: "test-app",
    token: null,
    fromUrl: "http://127.0.0.1/",
    functionsVersion: null,
    appBaseUrl: "https://demo.base44.app",
  },
  publicGet: vi.fn(),
}));

vi.mock("@/lib/app-params", () => ({
  appParams: layoutShellMocks.appParamsSnapshot,
}));

vi.mock("@base44/sdk/dist/utils/axios-client", () => ({
  createAxiosClient: vi.fn(() => ({
    get: layoutShellMocks.publicGet,
  })),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      Invoice: { list: vi.fn().mockResolvedValue([]) },
      ConstructionSite: { list: vi.fn().mockResolvedValue([]) },
    },
    auth: {
      redirectToLogin: vi.fn(),
      me: vi.fn(),
      logout: vi.fn(),
    },
    appLogs: { logUserInApp: vi.fn().mockResolvedValue(undefined) },
  },
}));

import App from "@/App.jsx";

describe("Layout — powłoka biznesowa (Power BI)", () => {
  const origConsoleError = console.error.bind(console);

  beforeEach(() => {
    layoutShellMocks.publicGet.mockReset();
    layoutShellMocks.publicGet.mockRejectedValue(new Error("public-settings nieużywane przez App"));
    vi.spyOn(console, "error").mockImplementation((first, ...rest) => {
      if (typeof first === "string" && first.includes("App state check failed")) return;
      origConsoleError(first, ...rest);
    });
  });

  afterEach(() => {
    vi.mocked(console.error).mockRestore();
  });

  it("renderuje podtytuł workspace na pasku (desktop) i linki ikonowej szyny", async () => {
    render(<App />);

    await waitFor(() => expect(layoutShellMocks.publicGet).not.toHaveBeenCalled());

    expect(await screen.findByText(/Fakturowo · workspace/i)).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Dashboard CEO" })).toHaveAttribute("href", "/CEODashboard");
    expect(screen.getByRole("link", { name: "Faktury" })).toHaveAttribute("href", "/Invoices");
    expect(screen.getByRole("link", { name: "Cash flow" })).toHaveAttribute("href", "/CashFlow");
    expect(screen.getByRole("link", { name: "Plan rozwoju" })).toHaveAttribute("href", "/Roadmap");
  });

  it("mobile: przycisk otwarcia menu nawigacji", async () => {
    render(<App />);
    await screen.findByText(/Fakturowo · workspace/i);
    expect(screen.getByRole("button", { name: /menu nawigacji/i })).toBeInTheDocument();
  });

  it("mobile menu: brak przycisku „Wyloguj się” (logowanie usunięte)", async () => {
    render(<App />);
    await screen.findByText(/Fakturowo · workspace/i);
    fireEvent.click(screen.getByRole("button", { name: /menu nawigacji/i }));
    expect(screen.queryByRole("button", { name: /wyloguj/i })).not.toBeInTheDocument();
  });

  it("desktop rail: klik rozwija, mouseLeave zwija", async () => {
    render(<App />);
    await screen.findByText(/Fakturowo · workspace/i);
    const rail = screen.getByRole("navigation", { name: "Menu główne" });
    expect(rail).toHaveAttribute("data-rail-expanded", "false");
    fireEvent.click(rail);
    expect(rail).toHaveAttribute("data-rail-expanded", "true");
    fireEvent.mouseLeave(rail);
    expect(rail).toHaveAttribute("data-rail-expanded", "false");
  });
});
