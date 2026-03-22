import { test, expect } from "@playwright/test";

test.describe("Zasoby statyczne", () => {
  test("manifest.json jest dostępny i zawiera name", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json).toMatchObject({ name: expect.any(String), start_url: "/" });
  });

  test("favicon.svg odpowiada 200", async ({ request }) => {
    const res = await request.get("/favicon.svg");
    expect(res.ok()).toBeTruthy();
  });
});
