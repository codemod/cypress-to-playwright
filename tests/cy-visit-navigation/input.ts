describe('Navigation', () => {
  it('should navigate correctly', () => {
    cy.visit('/home');
    cy.visit('https://example.com/page', { timeout: 30000 });
    cy.reload();
    cy.go('back');
    cy.go('forward');
    cy.go(-2);
    cy.wait(1000);
    cy.url().should('include', '/home');
    cy.location('pathname').should('eq', '/home');
    cy.hash().should('eq', '#section');
  });
});
