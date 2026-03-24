import { describe, it, expect, vi, beforeEach } from "vitest";
import { needsMfaStepUp } from "@/lib/authMfa";

const mfaMocks = vi.hoisted(() => ({
  getAuthenticatorAssuranceLevel: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabase: () => ({
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: mfaMocks.getAuthenticatorAssuranceLevel,
      },
    },
  }),
}));

describe("authMfa — needsMfaStepUp", () => {
  beforeEach(() => {
    mfaMocks.getAuthenticatorAssuranceLevel.mockReset();
  });

  it("true gdy current aal1 i next aal2", async () => {
    mfaMocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    expect(await needsMfaStepUp()).toBe(true);
  });

  it("false gdy nie wymaga drugiego kroku", async () => {
    mfaMocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });
    expect(await needsMfaStepUp()).toBe(false);
  });

  it("false przy błędzie API", async () => {
    mfaMocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: new Error("fail"),
    });
    expect(await needsMfaStepUp()).toBe(false);
  });
});
