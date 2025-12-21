describe('Assertions', () => {
  it('should test various assertions', () => {
    cy.get('#element').should('be.visible');
    cy.get('#element').should('exist');
    cy.get('#element').should('have.text', 'Hello');
    cy.get('#element').should('contain', 'World');
    cy.get('#element').should('have.value', 'test');
    cy.get('#element').should('have.class', 'active');
    cy.get('#element').should('have.attr', 'href', '/home');
    cy.get('#element').should('have.attr', 'disabled');
    cy.get('#element').should('be.disabled');
    cy.get('#element').should('be.enabled');
    cy.get('#element').should('be.checked');
    cy.get('#element').should('have.length', 5);
    cy.get('#element').should('have.css', 'display', 'block');
    cy.url().should('include', '/dashboard');
    cy.title().should('eq', 'My App');
  });
});
