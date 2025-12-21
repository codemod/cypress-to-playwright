describe('Aliases and Then', () => {
  it('should handle aliases and then callbacks', () => {
    cy.get('.button').as('submitBtn');
    cy.get('@submitBtn').click();
    cy.get('.data').then(($el) => {
      const text = $el.text();
      cy.log(text);
    });
  });
});
