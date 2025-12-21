import { test, expect } from '@playwright/test';

test.describe('Advanced Cypress Commands', () => {
  test('handles API requests', async ({ page }) => {
    await page.request.get('/api/users');
    await page.request.post('/api/users', { data: { name: 'John' } });
    await page.request.delete('/api/users/1');
  });

  test('handles fixtures', async ({ page }) => {
    // TODO: Migrate cy.fixture('users.json') - use import or fs.readFileSync in Playwright;
  });

  test('handles invoke and its', async ({ page }) => {
    await page.locator('input').evaluate((el) => el.val());
    await page.locator('select').evaluate((el) => el.val('option1'));
  });

  test('handles scrolling', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.scrollTo(0, 500));
  });

  test('handles focused element', async ({ page }) => {
    await expect(page.locator(':focus')).toHaveClass(/active/);
  });

  test('handles cookies', async ({ page }) => {
    await page.context().cookies();
    await page.context().cookies().then(cookies => cookies.find(c => c.name === 'session'));
    await page.context().addCookies([{ name: 'name', value: 'value', url: page.url() }]);
    await page.context().clearCookies();
  });

  test('handles debugging', async ({ page }) => {
    await page.pause(); // Opens Playwright Inspector for debugging;
    await page.pause(); // cy.debug() equivalent - opens Playwright Inspector;
  });

  test('handles hover and right click', async ({ page }) => {
    await page.locator('.menu').hover();
    await page.locator('.item').click({ button: 'right' });
  });

  test('handles sibling selectors', async ({ page }) => {
    page.locator('.item').locator('+ *');
    page.locator('.item').locator('xpath=preceding-sibling::*[1]');
    page.locator('.item').locator('~ *');
  });

  test('handles form submit', async ({ page }) => {
    await page.locator('form').evaluate((form) => form.submit());
  });
});
