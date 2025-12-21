describe('Chained Selectors', () => {
  it('should chain selectors', () => {
    cy.get('.list').first().click();
    cy.get('.list').last().click();
    cy.get('.list').eq(2).click();
    cy.get('.container').find('.item').click();
    cy.get('.item').parent().should('have.class', 'container');
    cy.get('.container').children().should('have.length', 3);
    cy.get('.container').find('button').first().click();
  });
});
