import { describe, it, expect, vi, beforeEach } from "vitest";

const appParamsMock = { appBaseUrl: null };

vi.mock("@/lib/app-params", () => ({
  appParams: appParamsMock,
}));

describe("base44ClientLogout", () => {
  beforeEach(() => {
    appParamsMock.appBaseUrl = null;
    vi.stubEnv("BASE_URL", "/");
  });

  it("canUseBase44RemoteLogout — false bez appBaseUrl", async () => {
    const { canUseBase44RemoteLogout } = await import("@/lib/base44ClientLogout.js");
    expect(canUseBase44RemoteLogout()).toBe(false);
  });

  it("canUseBase44RemoteLogout — false dla github.io", async () => {
    appParamsMock.appBaseUrl = "https://bigmax1993.github.io/crm";
    const { canUseBase44RemoteLogout } = await import("@/lib/base44ClientLogout.js");
    expect(canUseBase44RemoteLogout()).toBe(false);
  });

  it("canUseBase44RemoteLogout — true dla hosta Base44", async () => {
    appParamsMock.appBaseUrl = "https://moja-aplikacja.base44.app";
    const { canUseBase44RemoteLogout } = await import("@/lib/base44ClientLogout.js");
    expect(canUseBase44RemoteLogout()).toBe(true);
  });

  it("clearBase44BrowserSession usuwa tokeny", async () => {
    localStorage.setItem("base44_access_token", "x");
    localStorage.setItem("token", "y");
    localStorage.setItem("other", "keep");
    const { clearBase44BrowserSession } = await import("@/lib/base44ClientLogout.js");
    clearBase44BrowserSession();
    expect(localStorage.getItem("base44_access_token")).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("other")).toBe("keep");
  });
});
