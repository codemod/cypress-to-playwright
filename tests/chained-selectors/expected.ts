import { test, expect } from '@playwright/test';

test.describe('Chained Selectors', () => {
  test('should chain selectors', async ({ page }) => {
    await page.locator('.list').first().click();
    await page.locator('.list').last().click();
    await page.locator('.list').nth(2).click();
    await page.locator('.container').locator('.item').click();
    await expect(page.locator('.item').locator('..')).toHaveClass(/container/);
    await expect(page.locator('.container').locator('> *')).toHaveCount(3);
    await page.locator('.container').locator('button').first().click();
  });
});
