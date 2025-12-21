# cypress-to-playwright

Migrate Cypress end-to-end tests to Playwright. This codemod transforms test structure, selectors, actions, assertions, and navigation commands.

## Installation

```bash
# Run from registry
npx codemod run @codemod/cypress-to-playwright

# Or run locally
npx codemod workflow run -w workflow.yaml -t /path/to/your/cypress/tests
```

## What Gets Transformed

### Test Structure

| Cypress | Playwright |
|---------|------------|
| `describe()` | `test.describe()` |
| `it()` | `test()` |
| `before()` | `test.beforeAll()` |
| `beforeEach()` | `test.beforeEach()` |
| `after()` | `test.afterAll()` |
| `afterEach()` | `test.afterEach()` |

### Selectors and Actions

| Cypress | Playwright |
|---------|------------|
| `cy.get('.selector')` | `page.locator('.selector')` |
| `cy.contains('text')` | `page.getByText('text')` |
| `cy.get('.el').click()` | `await page.locator('.el').click()` |
| `cy.get('.el').type('text')` | `await page.locator('.el').fill('text')` |
| `cy.get('.el').check()` | `await page.locator('.el').check()` |
| `cy.get('.el').select('opt')` | `await page.locator('.el').selectOption('opt')` |
| `cy.get('.el').first()` | `page.locator('.el').first()` |
| `cy.get('.el').last()` | `page.locator('.el').last()` |
| `cy.get('.el').eq(n)` | `page.locator('.el').nth(n)` |
| `cy.get('.el').find('.child')` | `page.locator('.el').locator('.child')` |

### Assertions

| Cypress | Playwright |
|---------|------------|
| `.should('be.visible')` | `await expect(...).toBeVisible()` |
| `.should('exist')` | `await expect(...).toBeAttached()` |
| `.should('have.text', 'x')` | `await expect(...).toHaveText('x')` |
| `.should('contain', 'x')` | `await expect(...).toContainText('x')` |
| `.should('have.value', 'x')` | `await expect(...).toHaveValue('x')` |
| `.should('have.class', 'x')` | `await expect(...).toHaveClass(/x/)` |
| `.should('have.attr', 'a', 'v')` | `await expect(...).toHaveAttribute('a', 'v')` |
| `.should('be.disabled')` | `await expect(...).toBeDisabled()` |
| `.should('have.length', n)` | `await expect(...).toHaveCount(n)` |
| `.should('not.exist')` | `await expect(...).not.toBeAttached()` |

### Navigation

| Cypress | Playwright |
|---------|------------|
| `cy.visit('/path')` | `await page.goto('/path')` |
| `cy.reload()` | `await page.reload()` |
| `cy.go('back')` | `await page.goBack()` |
| `cy.go('forward')` | `await page.goForward()` |
| `cy.wait(1000)` | `await page.waitForTimeout(1000)` |
| `cy.url().should('include', '/x')` | `await expect(page).toHaveURL(/\/x/)` |
| `cy.title().should('eq', 'x')` | `await expect(page).toHaveTitle('x')` |

### Other Transformations

| Cypress | Playwright |
|---------|------------|
| `cy.clearCookies()` | `await page.context().clearCookies()` |
| `cy.screenshot('name')` | `await page.screenshot({ path: 'name.png' })` |
| `cy.viewport(w, h)` | `await page.setViewportSize({ width: w, height: h })` |

### Requires Manual Migration

Some Cypress features require manual migration and will be marked with TODO comments:

- `cy.intercept()` → Use `page.route()` in Playwright
- `cy.wait('@alias')` → Use `page.waitForResponse()` or similar
- `cy.get().as('alias')` → Use const variables instead of aliases
- `cy.get('@alias')` → Use the const variable directly
- `cy.get().then()` → Use `locator.evaluate()` or similar
- `cy.task()` → Use Playwright fixtures or global setup

## Example

### Before (Cypress)

```typescript
describe('Login', () => {
  beforeEach(() => {
    cy.visit('/login');
  });

  it('should login successfully', () => {
    cy.get('#email').type('user@example.com');
    cy.get('#password').type('password123');
    cy.get('button[type="submit"]').click();
    cy.url().should('include', '/dashboard');
    cy.get('.welcome').should('be.visible');
  });
});
```

### After (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should login successfully', async ({ page }) => {
    await page.locator('#email').fill('user@example.com');
    await page.locator('#password').fill('password123');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('.welcome')).toBeVisible();
  });
});
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Validate the workflow
npx codemod workflow validate -w workflow.yaml
```

## License

MIT
