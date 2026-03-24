import { describe, it, expect } from "vitest";
import { ROLE, canAccessPage, roleFromUser } from "@/lib/auth-roles";

describe("auth-roles", () => {
  it("roleFromUser — admin z user_metadata", () => {
    expect(
      roleFromUser({
        user_metadata: { role: ROLE.ADMIN },
        app_metadata: {},
      })
    ).toBe(ROLE.ADMIN);
  });

  it("roleFromUser — domyślnie user", () => {
    expect(roleFromUser({ user_metadata: {}, app_metadata: {} })).toBe(ROLE.USER);
  });

  it("canAccessPage — user nie widzi stron tylko dla admina", () => {
    expect(canAccessPage("Settings", ROLE.USER)).toBe(false);
    expect(canAccessPage("CEODashboard", ROLE.USER)).toBe(true);
  });

  it("canAccessPage — brak roli (Base44) nie blokuje", () => {
    expect(canAccessPage("Settings", null)).toBe(true);
  });

  it("canAccessPage — SettingsAI wymaga admina jak Settings", () => {
    expect(canAccessPage("SettingsAI", ROLE.USER)).toBe(false);
    expect(canAccessPage("SettingsAI", ROLE.ADMIN)).toBe(true);
  });

  it("canAccessPage — Security dostępne dla zwykłego usera (nie jest admin-only)", () => {
    expect(canAccessPage("Security", ROLE.USER)).toBe(true);
  });
});
