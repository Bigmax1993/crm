import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const ntMocks = vi.hoisted(() => ({
  logUserInApp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    appLogs: {
      logUserInApp: ntMocks.logUserInApp,
    },
  },
}));

import NavigationTracker from "@/lib/NavigationTracker";

describe("NavigationTracker — log aktywności (bez logowania)", () => {
  beforeEach(() => {
    ntMocks.logUserInApp.mockClear();
  });

  it("dla / wywołuje logUserInApp z mainPage z pages.config (CEODashboard)", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <NavigationTracker />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(ntMocks.logUserInApp).toHaveBeenCalledWith("CEODashboard");
    });
  });

  it("dla /Invoices przekazuje Invoices", async () => {
    render(
      <MemoryRouter initialEntries={["/Invoices"]}>
        <NavigationTracker />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(ntMocks.logUserInApp).toHaveBeenCalledWith("Invoices");
    });
  });

  it("case-insensitive: /invoices → Invoices", async () => {
    render(
      <MemoryRouter initialEntries={["/invoices"]}>
        <NavigationTracker />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(ntMocks.logUserInApp).toHaveBeenCalledWith("Invoices");
    });
  });
});
