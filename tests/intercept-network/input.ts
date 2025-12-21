describe('Network Interception', () => {
  it('should intercept API calls', () => {
    cy.intercept('GET', '/api/users', { fixture: 'users.json' }).as('getUsers');
    cy.visit('/users');
    cy.wait('@getUsers');
    cy.get('.user-list').should('be.visible');
  });
});
