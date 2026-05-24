import { test, expect } from '@playwright/test'

test('book page loads', async ({ page }) => {
  await page.goto('/book')
  await expect(page.locator('body')).toContainText(/service|book|appointment/i)
})

test('settings page loads after admin login', async ({ page }) => {
  await page.goto('/settings')

  await expect(page.locator('body')).toContainText(/login|password|willwin/i)

  await page.locator('input[type="password"]').fill('will222')
  await page.getByRole('button', { name: /login|sign in|enter|unlock/i }).click()

  await expect(page.locator('body')).toContainText(/settings|services|team|hours/i)
})
