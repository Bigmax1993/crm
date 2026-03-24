import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ForgotPassword from "@/pages/ForgotPassword";

const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({
    authMode: "supabase",
    resetPasswordForEmail,
  }),
}));

describe("ForgotPassword — smoke", () => {
  it("renderuje formularz i wywołuje reset po submit", async () => {
    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );

    expect(screen.getByText(/reset hasła/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "a@b.pl" } });
    fireEvent.click(screen.getByRole("button", { name: /wyślij link/i }));

    expect(resetPasswordForEmail).toHaveBeenCalledWith("a@b.pl");
    expect(await screen.findByText(/jeśli konto istnieje/i)).toBeInTheDocument();
  });
});
