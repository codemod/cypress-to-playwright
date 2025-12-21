describe('E-commerce Checkout', () => {
  beforeEach(() => {
    cy.visit('/products');
    cy.get('[data-testid="product-card"]').first().click();
  });

  it('should complete checkout flow', () => {
    // Add to cart
    cy.get('[data-testid="add-to-cart"]').click();
    cy.get('.cart-count').should('have.text', '1');

    // Go to cart
    cy.get('.cart-icon').click();
    cy.url().should('include', '/cart');
    cy.get('.cart-item').should('have.length', 1);

    // Proceed to checkout
    cy.contains('Proceed to Checkout').click();
    cy.get('#email').type('customer@example.com');
    cy.get('#address').type('123 Main St');
    cy.get('#city').type('New York');
    cy.get('#country').select('USA');
    cy.get('#terms').check();

    // Submit order
    cy.get('[data-testid="submit-order"]').click();
    cy.get('.confirmation').should('be.visible');
    cy.get('.confirmation').should('contain', 'Order confirmed');
  });

  it('should validate required fields', () => {
    cy.get('.cart-icon').click();
    cy.contains('Proceed to Checkout').click();
    cy.get('[data-testid="submit-order"]').click();
    cy.get('.error-message').should('be.visible');
    cy.get('#email').should('have.class', 'invalid');
  });
});
