describe('Negated Assertions', () => {
  it('should handle negated assertions', () => {
    cy.get('#element').should('not.exist');
    cy.get('#element').should('not.be.visible');
    cy.get('#element').should('not.be.disabled');
    cy.get('#element').should('not.be.checked');
    cy.get('#element').should('not.have.class', 'hidden');
    cy.get('#element').should('not.have.text', 'Error');
    cy.get('#element').should('not.contain', 'Error');
    cy.get('#element').should('not.have.value', '');
  });
});
