import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

describe("authRedirect — getAuthRedirectToPath", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_PUBLIC_SITE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("z VITE_PUBLIC_SITE_URL składa bazę + /Login", async () => {
    vi.stubEnv("VITE_PUBLIC_SITE_URL", "https://user.github.io/crm");
    const { getAuthRedirectToPath } = await import("@/lib/authRedirect.js");
    expect(getAuthRedirectToPath("Login")).toBe("https://user.github.io/crm/Login");
  });

  it("Register — ta sama zasada", async () => {
    vi.stubEnv("VITE_PUBLIC_SITE_URL", "https://app.example.com");
    const { getAuthRedirectToPath } = await import("@/lib/authRedirect.js");
    expect(getAuthRedirectToPath("Register")).toBe("https://app.example.com/Register");
  });
});
