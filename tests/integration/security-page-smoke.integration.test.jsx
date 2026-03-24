import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Security from "@/pages/Security";

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ authMode: "base44" }),
}));

describe("Security — smoke (bez Supabase)", () => {
  it("renderuje nagłówek i informację o konfiguracji Supabase", () => {
    render(<Security />);
    expect(screen.getByRole("heading", { name: /^bezpieczeństwo$/i })).toBeInTheDocument();
    expect(screen.getByText(/MFA i rozszerzone logowanie są dostępne po skonfigurowaniu Supabase/i)).toBeInTheDocument();
  });
});
