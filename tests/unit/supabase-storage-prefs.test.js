import { describe, it, expect, beforeEach } from "vitest";
import {
  getRememberMePreference,
  setRememberMePreference,
  resetSupabaseClient,
} from "@/lib/supabaseClient.js";

describe("supabaseClient — preferencja „zapamiętaj mnie”", () => {
  beforeEach(() => {
    localStorage.removeItem("fakturowo_supabase_storage");
    resetSupabaseClient();
  });

  it("domyślnie true (local)", () => {
    expect(getRememberMePreference()).toBe(true);
  });

  it("setRememberMePreference(false) — session", () => {
    setRememberMePreference(false);
    expect(getRememberMePreference()).toBe(false);
    expect(localStorage.getItem("fakturowo_supabase_storage")).toBe("session");
  });

  it("setRememberMePreference(true) — local", () => {
    setRememberMePreference(false);
    setRememberMePreference(true);
    expect(getRememberMePreference()).toBe(true);
    expect(localStorage.getItem("fakturowo_supabase_storage")).toBe("local");
  });
});
