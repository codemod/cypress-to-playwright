import { test, expect } from '@playwright/test';

test.describe('Contains', () => {
  test('should handle cy.contains', async ({ page }) => {
    await page.getByText('Submit').click();
    await page.locator('button').filter({ hasText: 'Submit' }).click();
    await expect(page.locator('.container').filter({ hasText: 'Hello' })).toBeVisible();
    await page.locator('.list').getByText('Item 1').click();
    await expect(page.getByText(/^Welcome/)).toBeAttached();
  });
});
