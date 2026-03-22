import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const authBootstrap = vi.hoisted(() => ({
  appParamsSnapshot: {
    appId: "test-app",
    token: null,
    fromUrl: "http://127.0.0.1/",
    functionsVersion: null,
    appBaseUrl: "https://demo.base44.app",
  },
  publicGet: vi.fn(),
  redirectToLogin: vi.fn(),
}));

vi.mock("@/lib/app-params", () => ({
  appParams: authBootstrap.appParamsSnapshot,
}));

vi.mock("@base44/sdk/dist/utils/axios-client", () => ({
  createAxiosClient: vi.fn(() => ({
    get: authBootstrap.publicGet,
  })),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      Invoice: { list: vi.fn().mockResolvedValue([]) },
      ConstructionSite: { list: vi.fn().mockResolvedValue([]) },
    },
    auth: {
      redirectToLogin: authBootstrap.redirectToLogin,
      me: vi.fn(),
      logout: vi.fn(),
    },
    appLogs: { logUserInApp: vi.fn().mockResolvedValue(undefined) },
  },
}));

import App from "@/App.jsx";

function authRequiredError() {
  const err = new Error("Forbidden");
  err.status = 403;
  err.data = { extra_data: { reason: "auth_required" } };
  return Promise.reject(err);
}

describe("App — bootstrap auth (integracja)", () => {
  const origConsoleError = console.error.bind(console);

  beforeEach(() => {
    authBootstrap.appParamsSnapshot.appBaseUrl = "https://demo.base44.app";
    authBootstrap.publicGet.mockReset();
    authBootstrap.redirectToLogin.mockReset();
    authBootstrap.publicGet.mockImplementation(authRequiredError);
    vi.spyOn(console, "error").mockImplementation((first, ...rest) => {
      if (typeof first === "string" && first.includes("App state check failed")) return;
      origConsoleError(first, ...rest);
    });
  });

  afterEach(() => {
    vi.mocked(console.error).mockRestore();
    vi.unstubAllEnvs();
  });

  it("przy auth_required renderuje ekran z instrukcją (nie pusty root)", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /wymagane logowanie base44/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /otwórz logowanie/i })).toBeInTheDocument();
    expect(screen.getByText(/przekierowywanie do logowania/i)).toBeInTheDocument();
    expect(screen.getByText(/vite_dev_skip_auth/i)).toBeInTheDocument();

    await waitFor(() => expect(authBootstrap.redirectToLogin).toHaveBeenCalled());
  });

  it("bez appBaseUrl nie wywołuje redirectToLogin z useEffect; przycisk nadal woła logowanie", async () => {
    authBootstrap.appParamsSnapshot.appBaseUrl = "";
    render(<App />);

    await screen.findByRole("heading", { name: /wymagane logowanie base44/i });
    expect(screen.getByText(/brak adresu aplikacji/i)).toBeInTheDocument();

    await waitFor(() => expect(authBootstrap.publicGet).toHaveBeenCalled());
    expect(authBootstrap.redirectToLogin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /otwórz logowanie/i }));
    expect(authBootstrap.redirectToLogin).toHaveBeenCalledTimes(1);
  });

  it("VITE_DEV_SKIP_AUTH=true omija public-settings i renderuje stronę główną", async () => {
    vi.stubEnv("VITE_DEV_SKIP_AUTH", "true");
    authBootstrap.publicGet.mockRejectedValue(new Error("public-settings nie powinno być wołane"));

    render(<App />);

    await waitFor(() => expect(authBootstrap.publicGet).not.toHaveBeenCalled());
    expect(
      await screen.findByRole("heading", { name: /dashboard ceo/i })
    ).toBeInTheDocument();
  });
});
