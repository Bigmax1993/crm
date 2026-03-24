import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const appSmokeMocks = vi.hoisted(() => ({
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
  appParams: appSmokeMocks.appParamsSnapshot,
}));

vi.mock("@base44/sdk/dist/utils/axios-client", () => ({
  createAxiosClient: vi.fn(() => ({
    get: appSmokeMocks.publicGet,
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
import { base44 } from "@/api/base44Client";

describe("App — bootstrap (bez logowania)", () => {
  const origConsoleError = console.error.bind(console);

  beforeEach(() => {
    appSmokeMocks.publicGet.mockReset();
    appSmokeMocks.publicGet.mockRejectedValue(new Error("public-settings nie jest używane"));
    vi.spyOn(console, "error").mockImplementation((first, ...rest) => {
      if (typeof first === "string" && first.includes("App state check failed")) return;
      origConsoleError(first, ...rest);
    });
  });

  afterEach(() => {
    vi.mocked(console.error).mockRestore();
    vi.unstubAllEnvs();
  });

  it("od razu renderuje Dashboard CEO (brak ekranów auth / public-settings)", async () => {
    render(<App />);

    await waitFor(() => expect(appSmokeMocks.publicGet).not.toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getAllByRole("heading", { name: /dashboard ceo/i }).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("NavigationTracker zgłasza aktywność dla strony głównej (CEODashboard)", async () => {
    vi.mocked(base44.appLogs.logUserInApp).mockClear();
    render(<App />);
    await waitFor(() => {
      expect(base44.appLogs.logUserInApp).toHaveBeenCalledWith("CEODashboard");
    });
  });

  it("nie renderuje formularza logowania ani komunikatu „Wymagane logowanie”", async () => {
    render(<App />);
    await waitFor(() => {
      expect(base44.appLogs.logUserInApp).toHaveBeenCalled();
    });
    expect(screen.queryByRole("heading", { name: /wybierz sposób logowania/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/wymagane logowanie base44/i)).not.toBeInTheDocument();
  });
});
