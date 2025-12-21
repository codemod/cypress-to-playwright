import { test, expect } from '@playwright/test';

test.describe('Assertions', () => {
  test('should test various assertions', async ({ page }) => {
    await expect(page.locator('#element')).toBeVisible();
    await expect(page.locator('#element')).toBeAttached();
    await expect(page.locator('#element')).toHaveText('Hello');
    await expect(page.locator('#element')).toContainText('World');
    await expect(page.locator('#element')).toHaveValue('test');
    await expect(page.locator('#element')).toHaveClass(/active/);
    await expect(page.locator('#element')).toHaveAttribute('href', '/home');
    await expect(page.locator('#element')).toHaveAttribute('disabled');
    await expect(page.locator('#element')).toBeDisabled();
    await expect(page.locator('#element')).toBeEnabled();
    await expect(page.locator('#element')).toBeChecked();
    await expect(page.locator('#element')).toHaveCount(5);
    await expect(page.locator('#element')).toHaveCSS('display', 'block');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).toHaveTitle('My App');
  });
});
