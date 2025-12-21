describe('Contains', () => {
  it('should handle cy.contains', () => {
    cy.contains('Submit').click();
    cy.contains('button', 'Submit').click();
    cy.contains('.container', 'Hello').should('be.visible');
    cy.get('.list').contains('Item 1').click();
    cy.contains(/^Welcome/).should('exist');
  });
});
