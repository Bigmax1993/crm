import { test, expect } from "@playwright/test";

test("Budowa — strona /Construction ładuje SPA", async ({ page }) => {
  await page.goto("/Construction", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Budowa", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /dodaj obiekt/i }).first()).toBeVisible();
});

test("Budowa — otwarcie formularza nowego obiektu", async ({ page }) => {
  await page.goto("/Construction", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Budowa", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /dodaj obiekt/i }).first().click();
  await expect(page.getByText("Nowy obiekt budowlany")).toBeVisible();
  await expect(page.getByLabel(/obiekt \*/i)).toBeVisible();
});
