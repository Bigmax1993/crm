import { test, expect } from "@playwright/test";

test("strona /Roadmap — nagłówek i sekcja planu", async ({ page }) => {
  await page.goto("/Roadmap", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /kierunki rozwoju/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Produkty platformowe/i).first()).toBeVisible();
});
