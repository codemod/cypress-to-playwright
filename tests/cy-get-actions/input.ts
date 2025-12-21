describe('Form Actions', () => {
  it('should perform various actions', () => {
    cy.get('#input').type('hello world');
    cy.get('#input').clear();
    cy.get('#checkbox').check();
    cy.get('#checkbox').uncheck();
    cy.get('#select').select('option1');
    cy.get('#button').click();
    cy.get('#button').dblclick();
    cy.get('#input').focus();
    cy.get('#input').blur();
    cy.get('#element').scrollIntoView();
    cy.get('#element').trigger('mouseover');
  });
});
