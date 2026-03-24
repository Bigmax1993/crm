import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/lib/AuthContext";

function AuthProbe() {
  const a = useAuth();
  return (
    <div>
      <span data-testid="auth-mode">{a.authMode}</span>
      <span data-testid="authenticated">{a.isAuthenticated ? "yes" : "no"}</span>
      <span data-testid="loading-auth">{a.isLoadingAuth ? "yes" : "no"}</span>
      <span data-testid="user">{a.user == null ? "null" : "set"}</span>
    </div>
  );
}

describe("AuthContext — stub bez logowania", () => {
  it("dostarcza authMode none i isAuthenticated true", () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );
    expect(screen.getByTestId("auth-mode")).toHaveTextContent("none");
    expect(screen.getByTestId("authenticated")).toHaveTextContent("yes");
    expect(screen.getByTestId("loading-auth")).toHaveTextContent("no");
    expect(screen.getByTestId("user")).toHaveTextContent("null");
  });

  it("signInWithPassword zwraca błąd (logowanie wyłączone)", async () => {
    let result;
    function SignInProbe() {
      const { signInWithPassword } = useAuth();
      return (
        <button
          type="button"
          onClick={async () => {
            result = await signInWithPassword("a@b.pl", "x");
          }}
        >
          sign-in
        </button>
      );
    }
    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>
    );
    await act(async () => {
      screen.getByRole("button", { name: "sign-in" }).click();
    });
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toMatch(/wyłączone/i);
  });

  it("logout i navigateToLogin nie rzucają", async () => {
    const apiRef = { current: null };
    function Grab() {
      apiRef.current = useAuth();
      return null;
    }
    render(
      <AuthProvider>
        <Grab />
      </AuthProvider>
    );
    await expect(apiRef.current.logout()).resolves.toBeUndefined();
    expect(() => apiRef.current.navigateToLogin()).not.toThrow();
  });

  it("useAuth poza AuthProvider — błąd", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<AuthProbe />)).toThrow(/useAuth must be used within an AuthProvider/i);
    spy.mockRestore();
  });
});
