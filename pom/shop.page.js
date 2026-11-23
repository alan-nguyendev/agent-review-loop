// Page object for the demo shop. Every locator lives here, so a change in the
// markup is a one-file change rather than a sweep through the specs.

class ShopPage {
  constructor(page) {
    this.page = page;

    // Heading — used to confirm the page itself has loaded at all.
    this.heading = page.getByRole('heading', { name: 'Demo Shop' });

    // One row per product in the catalogue. The prefix is deliberately
    // "product-row-" so this does not also match the name and price spans
    // inside each row.
    this.products = page.locator('[data-testid^="product-row-"]');

    // Cart summary lines. These are the numbers the customer actually reads,
    // so they are what the money tests assert on.
    this.subtotal = page.getByTestId('cart-subtotal');
    this.discount = page.getByTestId('cart-discount');
    this.vat = page.getByTestId('cart-vat');
    this.total = page.getByTestId('cart-total');
  }

  async open() {
    await this.page.goto('/');
    // Wait for the first product row rather than a fixed delay — the catalogue
    // is fetched, so "the page responded" is not the same as "there is content".
    await this.products.first().waitFor({ state: 'visible' });
  }

  // Price shown in the catalogue for one product.
  priceOf(productId) {
    return this.page.getByTestId(`product-${productId}-price`);
  }

  // "Add to cart" button of one product row.
  addButton(productId) {
    return this.page.getByTestId(`add-to-cart-${productId}`);
  }

  async addToCart(productId) {
    await this.addButton(productId).click();
  }

  // All four summary values at once, as numbers — saves four awaits per assert.
  async summary() {
    return {
      subtotal: Number(await this.subtotal.textContent()),
      discount: Number(await this.discount.textContent()),
      vat: Number(await this.vat.textContent()),
      total: Number(await this.total.textContent()),
    };
  }
}

module.exports = { ShopPage };
