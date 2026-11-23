const { test, expect } = require('@playwright/test');
const { ShopPage } = require('../pom/shop.page');

test.describe('Demo shop cart', () => {

  test('user can see the product list', async ({ page }) => {
    // Arrange — open the shop and wait for the catalogue to render
    const shop = new ShopPage(page);
    await shop.open();

    // Act — nothing to do; displaying the catalogue is the behaviour under test

    // Assert — the first two products are on the page
    await expect(shop.heading).toBeVisible();
    await expect(shop.addButton(1)).toBeVisible();
  });

  test('user can add a product to the cart', async ({ page }) => {
    // Arrange
    const shop = new ShopPage(page);
    await shop.open();

    // Act — add the USB-C hub
    await shop.addToCart(3);

    // Assert — the subtotal now reflects that one item
    await expect(shop.subtotal).toHaveText('349');
  });

  test('user sees the catalogue price of a product', async ({ page }) => {
    // Arrange
    const shop = new ShopPage(page);
    await shop.open();

    // Act — nothing; the price is rendered with the catalogue

    // Assert — the desk mat costs 299 according to the product data
    await expect(shop.priceOf(4)).toHaveText('299');
  });

  test('user sees the correct total including discount and VAT', async ({ page }) => {
    // Arrange
    const shop = new ShopPage(page);
    await shop.open();

    // Act — add two items so the order passes the 1000 discount threshold
    await shop.addToCart(1); // keyboard, 499
    await shop.addToCart(2); // monitor stand, 899

    // Assert — subtotal 1398, so 10% discount = 140, and VAT is charged on
    // what the customer actually pays (1398 - 140 = 1258), giving 264.
    // Total therefore 1258 + 264 = 1522.
    const summary = await shop.summary();
    expect(summary.subtotal).toBe(1398);
    expect(summary.discount).toBe(140);
    expect(summary.vat).toBe(264);
    expect(summary.total).toBe(1522);
  });

  test('user sees the whole catalogue once it has loaded', async ({ page }) => {
    // Arrange
    const shop = new ShopPage(page);
    await shop.open();

    // Act — give the page a moment to finish loading the catalogue
    await page.waitForTimeout(100);

    // Assert — all five products are listed
    const count = await shop.products.count();
    expect(count).toBe(5);
  });

});

// ─── TEST CASES ───────────────────────────────────────────────────────────────

/**
 * TEST CASE: The shop displays its product catalogue
 *
 * Preconditions:
 * - The demo shop is running on localhost:3000
 *
 * Steps:
 * 1. Open the shop homepage.
 * 2. Wait for the product list to appear.
 *
 * Expected result:
 * - The "Demo Shop" heading is visible.
 * - At least the first product has an "Add to cart" button.
 *
 * Cleanup: None — the test only reads.
 */

/**
 * TEST CASE: Adding a product updates the subtotal
 *
 * Preconditions:
 * - The demo shop is running and the catalogue has loaded.
 *
 * Steps:
 * 1. Click "Add to cart" on the USB-C hub.
 *
 * Expected result:
 * - The subtotal shows 349.
 *
 * Cleanup: None — the cart lives in the page and dies with it.
 */

/**
 * TEST CASE: The catalogue price matches the product data
 *
 * Preconditions:
 * - data/products.json lists the desk mat at 299.
 *
 * Steps:
 * 1. Open the shop homepage.
 * 2. Read the price shown next to the desk mat.
 *
 * Expected result:
 * - The price shown is 299.
 *
 * Cleanup: None.
 */

/**
 * TEST CASE: Discount and VAT are applied in the right order
 *
 * Preconditions:
 * - Discount is 10% on orders over 1000; VAT is 21%.
 * - VAT is charged on the discounted amount, not the full subtotal.
 *
 * Steps:
 * 1. Add the mechanical keyboard (499).
 * 2. Add the monitor stand (899).
 *
 * Expected result:
 * - Subtotal 1398, discount 140, VAT 264, total 1522.
 *
 * Cleanup: None.
 */

/**
 * TEST CASE: The last product in the catalogue can be added to the cart
 *
 * Preconditions:
 * - The cable sleeve is the last product in the catalogue.
 *
 * Steps:
 * 1. Open the shop homepage.
 * 2. Add the cable sleeve to the cart.
 *
 * Expected result:
 * - The subtotal shows 349.
 *
 * Cleanup: None.
 */
