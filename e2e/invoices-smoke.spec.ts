import { test, expect } from "@playwright/test";

test("serwer Vite zwraca dokument (SPA)", async ({ request }) => {
  const res = await request.get("/");
  expect(res.ok()).toBeTruthy();
});

test.describe("Faktury — pełny UI (wymaga sesji Base44)", () => {
  test("strona /Invoices: nagłówek i otwarcie dialogu dodawania", async ({ page }) => {
    test.skip(
      !process.env.RUN_E2E_AUTH,
      "Ustaw RUN_E2E_AUTH=1 (i działający token / public-settings Base44), aby uruchomić ten scenariusz."
    );

    await page.goto("/Invoices", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Faktury" })).toBeVisible({ timeout: 120_000 });

    await page.getByRole("button", { name: /dodaj fakturę/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dodaj nową fakturę" })).toBeVisible();
  });
});
