import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeAll(async () => {
    // TODO: Migrate cy.task('seedDatabase') - Playwright uses fixtures or global setup;
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test.afterEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test.afterAll(async () => {
    // TODO: Migrate cy.task('cleanDatabase') - Playwright uses fixtures or global setup;
  });

  test('should display login form', async ({ page }) => {
    await expect(page.locator('#login-form')).toBeVisible();
  });

  test('should login successfully', async ({ page }) => {
    await page.locator('#email').fill('user@example.com');
    await page.locator('#password').fill('password123');
    await page.locator('button[type="submit"]').click();
  });
});
