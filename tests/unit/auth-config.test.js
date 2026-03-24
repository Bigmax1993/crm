import { describe, it, expect, vi, afterEach } from "vitest";

describe("authConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("isSupabaseAuthEnabled — true gdy URL i klucz anon", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "eyJhbGciOi");
    const { isSupabaseAuthEnabled } = await import("@/lib/authConfig.js");
    expect(isSupabaseAuthEnabled()).toBe(true);
  });

  it("isSupabaseAuthEnabled — false gdy brak któregoś z parametrów", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const { isSupabaseAuthEnabled } = await import("@/lib/authConfig.js");
    expect(isSupabaseAuthEnabled()).toBe(false);
  });

  it("isDevSkipAuth — true tylko w DEV i przy VITE_DEV_SKIP_AUTH=true", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_DEV_SKIP_AUTH", "true");
    const { isDevSkipAuth } = await import("@/lib/authConfig.js");
    expect(isDevSkipAuth()).toBe(true);
  });
});
