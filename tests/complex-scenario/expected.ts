import { test, expect } from '@playwright/test';

test.describe('E-commerce Checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/products');
    await page.locator('[data-testid="product-card"]').first().click();
  });

  test('should complete checkout flow', async ({ page }) => {
    // Add to cart
    await page.locator('[data-testid="add-to-cart"]').click();
    await expect(page.locator('.cart-count')).toHaveText('1');

    // Go to cart
    await page.locator('.cart-icon').click();
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.locator('.cart-item')).toHaveCount(1);

    // Proceed to checkout
    await page.getByText('Proceed to Checkout').click();
    await page.locator('#email').fill('customer@example.com');
    await page.locator('#address').fill('123 Main St');
    await page.locator('#city').fill('New York');
    await page.locator('#country').selectOption('USA');
    await page.locator('#terms').check();

    // Submit order
    await page.locator('[data-testid="submit-order"]').click();
    await expect(page.locator('.confirmation')).toBeVisible();
    await expect(page.locator('.confirmation')).toContainText('Order confirmed');
  });

  test('should validate required fields', async ({ page }) => {
    await page.locator('.cart-icon').click();
    await page.getByText('Proceed to Checkout').click();
    await page.locator('[data-testid="submit-order"]').click();
    await expect(page.locator('.error-message')).toBeVisible();
    await expect(page.locator('#email')).toHaveClass(/invalid/);
  });
});
