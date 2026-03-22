import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const settingsBase44Mocks = vi.hoisted(() => ({
  Invoice: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  ConstructionSite: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  Contractor: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: settingsBase44Mocks,
    integrations: { Core: { UploadFile: vi.fn(), UploadPrivateFile: vi.fn() } },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

import Settings from "@/pages/Settings";

describe("Settings — smoke (integracja)", () => {
  it("renderuje stronę i zapisuje stronę domową do localStorage", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Settings />
      </QueryClientProvider>
    );
    expect(await screen.findByRole("heading", { name: /ustawienia/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /zapisz ustawienia/i }));
    expect(localStorage.getItem("app_home_page")).toBe("CEODashboard");
  });
});
