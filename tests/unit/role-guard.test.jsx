import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RoleGuard } from "@/components/RoleGuard";

describe("RoleGuard", () => {
  it("zawsze renderuje dzieci (logowanie wyłączone)", () => {
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

  it("nie przekierowuje z Settings — pełny dostęp bez roli", () => {
    render(
      <MemoryRouter initialEntries={["/Settings"]}>
        <Routes>
          <Route
            path="/Settings"
            element={
              <RoleGuard pageName="Settings">
                <p>Strona ustawień</p>
              </RoleGuard>
            }
          />
          <Route path="/CEODashboard" element={<p>CEO</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("Strona ustawień")).toBeInTheDocument();
    expect(screen.queryByText("CEO")).not.toBeInTheDocument();
  });
});
