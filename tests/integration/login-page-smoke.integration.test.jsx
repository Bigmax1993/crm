import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Login from "@/pages/Login";

const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
const signInWithMagicLink = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({
    authMode: "supabase",
    signInWithPassword,
    signInWithOAuth,
    signInWithMagicLink,
  }),
}));

function renderLoginAt(path = "/Login") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/Login" element={<Login />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Login — wybór metody i kroki", () => {
  beforeEach(() => {
    signInWithPassword.mockClear();
    signInWithOAuth.mockClear();
    signInWithMagicLink.mockClear();
  });

  it("start: ekran wyboru (Google, e-mail/hasło, magic link)", async () => {
    renderLoginAt("/Login");
    expect(await screen.findByText("Wybierz sposób logowania")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "E-mail i hasło" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link magiczny na e-mail" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^hasło$/i)).not.toBeInTheDocument();
  });

  it("po kliknięciu „E-mail i hasło” widać formularz i link „Zapomniałeś hasła?”", async () => {
    renderLoginAt("/Login");
    await screen.findByText("Wybierz sposób logowania");
    fireEvent.click(screen.getByRole("button", { name: "E-mail i hasło" }));
    expect(await screen.findByText("E-mail i hasło")).toBeInTheDocument();
    expect(screen.getByLabelText(/^e-mail$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^hasło$/i)).toBeInTheDocument();
    expect(screen.getByText("Zapomniałeś hasła?")).toBeInTheDocument();
  });

  it("„Wróć do wyboru” wraca do listy opcji", async () => {
    renderLoginAt("/Login");
    await screen.findByText("Wybierz sposób logowania");
    fireEvent.click(screen.getByRole("button", { name: "E-mail i hasło" }));
    await screen.findByText("E-mail i hasło");
    fireEvent.click(screen.getByRole("button", { name: "Wróć do wyboru" }));
    expect(await screen.findByText("Wybierz sposób logowania")).toBeInTheDocument();
  });

  it("?step=password — od razu formularz hasła", async () => {
    renderLoginAt("/Login?step=password");
    await waitFor(() => {
      expect(screen.getByText("E-mail i hasło")).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/^hasło$/i)).toBeInTheDocument();
  });

  it("?step=magic — od razu formularz linku", async () => {
    renderLoginAt("/Login?step=magic");
    await waitFor(() => {
      expect(screen.getByText("Link na e-mail")).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/^e-mail$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /wyślij link na e-mail/i })).toBeInTheDocument();
  });

  it("Google wywołuje signInWithOAuth('google')", async () => {
    renderLoginAt("/Login");
    await screen.findByText("Wybierz sposób logowania");
    fireEvent.click(screen.getByRole("button", { name: "Google" }));
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledWith("google"));
  });

  it("submit hasła wywołuje signInWithPassword", async () => {
    renderLoginAt("/Login?step=password");
    await screen.findByLabelText(/^e-mail$/i);
    fireEvent.change(screen.getByLabelText(/^e-mail$/i), { target: { value: "a@b.pl" } });
    fireEvent.change(screen.getByLabelText(/^hasło$/i), { target: { value: "secret12" } });
    fireEvent.click(screen.getByRole("button", { name: "Zaloguj się" }));
    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith("a@b.pl", "secret12", { rememberMe: true })
    );
  });

  it("submit magic link wywołuje signInWithMagicLink", async () => {
    renderLoginAt("/Login?step=magic");
    await screen.findByLabelText(/^e-mail$/i);
    fireEvent.change(screen.getByLabelText(/^e-mail$/i), { target: { value: "x@y.pl" } });
    fireEvent.click(screen.getByRole("button", { name: /wyślij link na e-mail/i }));
    await waitFor(() => expect(signInWithMagicLink).toHaveBeenCalledWith("x@y.pl"));
  });
});
