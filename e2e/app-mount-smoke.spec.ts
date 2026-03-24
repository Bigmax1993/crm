import { test, expect } from "@playwright/test";

/**
 * Regresja: biały ekran przy imporcie sql.js (CJS bez default w surowym ESM).
 * Wymaga prawdziwego Chromium + Vite — Vitest/jsdom tego nie wyłapie.
 */
test("strona główna — React montuje UI (bez mocków)", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);

  await expect(page.getByText(/Fakturowo · workspace/i)).toBeVisible({ timeout: 10_000 });

  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  const hasContent =
    text.length > 20 ||
    (await page.getByRole("heading").count()) > 0 ||
    (await page.locator('[class*="animate-spin"]').count()) > 0;

  expect(pageErrors, pageErrors.join("; ")).toHaveLength(0);
  expect(hasContent, "pusty body — otwórz DevTools (F12) → Console").toBeTruthy();
});
