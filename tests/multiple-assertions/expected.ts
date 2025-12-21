import { test, expect } from '@playwright/test';

test.describe('Multiple Assertions', () => {
  test('should handle multiple chained assertions', async ({ page }) => {
    await expect(page.locator('#element')).toBeVisible();
    await expect(page.locator('#element')).toHaveClass(/active/);
    await expect(page.locator('#element')).toContainText('Hello');
  });
});
