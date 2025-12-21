describe('Advanced Cypress Commands', () => {
  it('handles API requests', () => {
    cy.request('/api/users');
    cy.request('POST', '/api/users', { name: 'John' });
    cy.request('DELETE', '/api/users/1');
  });

  it('handles fixtures', () => {
    cy.fixture('users.json');
  });

  it('handles invoke and its', () => {
    cy.get('input').invoke('val');
    cy.get('select').invoke('val', 'option1');
  });

  it('handles scrolling', () => {
    cy.scrollTo('bottom');
    cy.scrollTo('top');
    cy.scrollTo(0, 500);
  });

  it('handles focused element', () => {
    cy.focused().should('have.class', 'active');
  });

  it('handles cookies', () => {
    cy.getCookies();
    cy.getCookie('session');
    cy.setCookie('name', 'value');
    cy.clearCookies();
  });

  it('handles debugging', () => {
    cy.pause();
    cy.debug();
  });

  it('handles hover and right click', () => {
    cy.get('.menu').hover();
    cy.get('.item').rightclick();
  });

  it('handles sibling selectors', () => {
    cy.get('.item').next();
    cy.get('.item').prev();
    cy.get('.item').siblings();
  });

  it('handles form submit', () => {
    cy.get('form').submit();
  });
});
