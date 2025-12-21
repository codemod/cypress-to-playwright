import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should navigate correctly', async ({ page }) => {
    await page.goto('/home');
    await page.goto('https://example.com/page', { timeout: 30000 });
    await page.reload();
    await page.goBack();
    await page.goForward();
    await page.goBack(); // TODO: Verify - was cy.go(-2);
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/home/);
    expect(new URL(page.url()).pathname).toBe('/home');
    expect(new URL(page.url()).hash).toBe('#section');
  });
});
