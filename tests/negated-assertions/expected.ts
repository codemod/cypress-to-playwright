import { test, expect } from '@playwright/test';

test.describe('Negated Assertions', () => {
  test('should handle negated assertions', async ({ page }) => {
    await expect(page.locator('#element')).not.toBeAttached();
    await expect(page.locator('#element')).not.toBeVisible();
    await expect(page.locator('#element')).not.toBeDisabled();
    await expect(page.locator('#element')).not.toBeChecked();
    await expect(page.locator('#element')).not.toHaveClass(/hidden/);
    await expect(page.locator('#element')).not.toHaveText('Error');
    await expect(page.locator('#element')).not.toContainText('Error');
    await expect(page.locator('#element')).not.toHaveValue('');
  });
});
