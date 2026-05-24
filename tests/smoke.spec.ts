import { test, expect } from '@playwright/test'

test('book page loads', async ({ page }) => {
  await page.goto('/book')
  await expect(page.locator('body')).toContainText(/service|book|appointment/i)
})

test('settings page loads', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.locator('body')).toContainText(/settings|services|team|hours/i)
})
