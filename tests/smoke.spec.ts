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

test('settings hours tab state persists across tab switches', async ({ page }) => {
  await page.goto('/settings')
  await page.locator('input[type="password"]').fill('will222')
  await page.getByRole('button', { name: /login|sign in|enter|unlock/i }).click()
  await expect(page.locator('body')).toContainText(/settings|services|team|hours/i)

  await page.getByRole('tab', { name: /hours/i }).click()
  await expect(page.locator('body')).toContainText(/Tech Availability|Business Hours/i)

  const firstCheckbox = page.locator('section').filter({ hasText: 'Tech Availability' }).locator('input[type="checkbox"]').first()
  const initialState = await firstCheckbox.isChecked()
  await firstCheckbox.click()
  await expect(firstCheckbox).toBeChecked({ checked: !initialState })

  await page.getByRole('button', { name: /Save Availability/i }).click()
  await expect(page.locator('text=Saved.')).toBeVisible()

  await page.getByRole('tab', { name: /general/i }).click()
  await page.getByRole('tab', { name: /hours/i }).click()

  await expect(firstCheckbox).toBeChecked({ checked: !initialState })
})
