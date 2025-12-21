// Regular code with variable named 'cy' - should NOT be transformed
const cy = {
  get: (id: string) => document.getElementById(id),
  visit: (url: string) => window.location.href = url,
};

function useCypress() {
  // This is not Cypress
  const cy = createMockCy();
  cy.get('#test');
  return cy;
}

// Currency symbol
const currencyCy = 'CY';
const cyCurrency = { code: 'CYP', symbol: 'CY' };
