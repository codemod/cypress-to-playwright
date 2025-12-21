describe('Multiple Assertions', () => {
  it('should handle multiple chained assertions', () => {
    cy.get('#element')
      .should('be.visible')
      .and('have.class', 'active')
      .and('contain', 'Hello');
  });
});
