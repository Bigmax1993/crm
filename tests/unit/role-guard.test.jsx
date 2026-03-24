import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RoleGuard } from "@/components/RoleGuard";

vi.mock("@/lib/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/lib/AuthContext";

describe("RoleGuard", () => {
  it("renderuje dzieci gdy użytkownik ma dostęp (admin → Settings)", () => {
    vi.mocked(useAuth).mockReturnValue({ role: "admin" });
    render(
      <MemoryRouter initialEntries={["/Settings"]}>
        <Routes>
          <Route
            path="/Settings"
            element={
              <RoleGuard pageName="Settings">
                <p>Zawartość ustawień</p>
              </RoleGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("Zawartość ustawień")).toBeInTheDocument();
  });

  it("przekierowuje gdy user bez roli admin próbuje Settings", async () => {
    vi.mocked(useAuth).mockReturnValue({ role: "user" });
    render(
      <MemoryRouter initialEntries={["/Settings"]}>
        <Routes>
          <Route
            path="/Settings"
            element={
              <RoleGuard pageName="Settings">
                <p>Nie powinno</p>
              </RoleGuard>
            }
          />
          <Route path="/CEODashboard" element={<p>CEO</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText("CEO")).toBeInTheDocument();
  });
});
