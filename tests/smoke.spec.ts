import { test, expect } from '@playwright/test'

test('book page loads', async ({ page }) => {
  await page.goto('/book')
  await expect(page.locator('body')).toContainText(/service|book|appointment/i)
})

test('settings page loads after admin login', async ({ page }) => {
  await page.goto('/settings')

  const body = page.locator('body')
  await expect(body).toContainText(/login|password|willwin/i)

  const passwordInput = page.locator('input[type="password"]')
  await passwordInput.fill('will222')

  await page.getByRole('button', { name: /login|sign in|enter|unlock/i }).click()

  await expect(page.locator('body')).toContainText(/settings|services|team|hours/i)
})
