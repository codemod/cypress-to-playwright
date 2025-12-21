describe('Login Page', () => {
  before(() => {
    cy.task('seedDatabase');
  });

  beforeEach(() => {
    cy.visit('/login');
  });

  afterEach(() => {
    cy.clearCookies();
  });

  after(() => {
    cy.task('cleanDatabase');
  });

  it('should display login form', () => {
    cy.get('#login-form').should('be.visible');
  });

  it('should login successfully', () => {
    cy.get('#email').type('user@example.com');
    cy.get('#password').type('password123');
    cy.get('button[type="submit"]').click();
  });
});
