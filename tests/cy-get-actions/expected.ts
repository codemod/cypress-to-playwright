import { test, expect } from '@playwright/test';

test.describe('Form Actions', () => {
  test('should perform various actions', async ({ page }) => {
    await page.locator('#input').fill('hello world');
    await page.locator('#input').clear();
    await page.locator('#checkbox').check();
    await page.locator('#checkbox').uncheck();
    await page.locator('#select').selectOption('option1');
    await page.locator('#button').click();
    await page.locator('#button').dblclick();
    await page.locator('#input').focus();
    await page.locator('#input').blur();
    await page.locator('#element').scrollIntoViewIfNeeded();
    await page.locator('#element').hover();
  });
});
