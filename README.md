# cypress-to-playwright

Migrate Cypress end-to-end tests to Playwright. This codemod transforms test structure, selectors, actions, assertions, and navigation commands.

## Migration Approach

This codemod uses a **two-phase approach** to ensure reliable transformations:

1. **AST-based transformations** (automatic, reliable): Handles standard Cypress patterns using traditional AST-based codemods. These transformations are deterministic and cover the majority of common patterns.

2. **AI-assisted transformations** (optional): Handles tricky cases that require context-aware conversion. When enabled via Codemod Campaign, AI will automatically migrate complex patterns that were marked with TODO comments by the AST-based step.

## What Gets Transformed

### AST-Based Transformations (Automatic)

The following transformations are handled reliably by AST-based codemods:

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

### Configuration Migration

The codemod also automatically migrates Cypress configuration files:
- `cypress.config.ts` → `playwright.config.ts`
- Converts Cypress-specific settings to equivalent Playwright configuration

### Custom Command Detection

The codemod scans for custom Cypress commands in support files and reports them for review. These are typically handled by the optional AI-assisted step when enabled.

### AI-Assisted Transformations (Optional)

When running via Codemod Campaign with `autoAIReview` enabled (default), the AI will automatically handle these tricky patterns that cannot be reliably transformed by AST-based codemods:

1. **`.then()` patterns** (including `cy.visit().then()`):
   - `cy.visit().then((window) => {...})` → Uses `page.evaluate()` to access window object
   - `locator.then((el) => {...})` → Extracts logic and uses `locator.evaluate()` or locator methods
   - Generic `.then()` callbacks → Converts to async/await patterns with proper Playwright APIs

2. **Custom Cypress commands**:
   - Custom commands like `cy.nextStep()`, `cy.prevStep()`, `cy.compareSnapshot()`, etc.
   - AI analyzes the command definition and converts to appropriate Playwright helpers or `page.evaluate()`

3. **Complex `.should()` callbacks**:
   - Assertions with callback functions that contain custom logic
   - Converts Cypress assertions within callbacks to Playwright matchers

These patterns are initially marked with TODO comments by the AST-based codemod, then automatically resolved by AI when the optional AI step is enabled.

### Requires Manual Migration

Some Cypress features may still require manual attention:

- `cy.intercept()` → Use `page.route()` in Playwright (may be handled by AI if simple cases)
- `cy.wait('@alias')` → Use `page.waitForResponse()` or similar (may be handled by AI)
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
