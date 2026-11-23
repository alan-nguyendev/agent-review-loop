// Cart maths for the demo shop.
//
// Business rules, as agreed with the (imaginary) product owner:
//   1. subtotal  = sum of price * quantity
//   2. discount  = 10% of subtotal, but only when subtotal is over 1000
//   3. VAT       = 21%, charged on the amount the customer actually pays,
//                  i.e. AFTER the discount has been taken off
//   4. total     = (subtotal - discount) + VAT

const VAT_RATE = 0.21;
const DISCOUNT_RATE = 0.1;
const DISCOUNT_THRESHOLD = 1000;

function subtotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function discount(items) {
  const sub = subtotal(items);
  return sub > DISCOUNT_THRESHOLD ? Math.round(sub * DISCOUNT_RATE) : 0;
}

function vat(items) {
  // Rule 3 says VAT is charged on what the customer pays, so the discount
  // has to come off first.
  const taxable = subtotal(items) - discount(items);
  return Math.round(taxable * VAT_RATE);
}

function total(items) {
  return subtotal(items) - discount(items) + vat(items);
}

if (typeof module !== 'undefined') {
  module.exports = { subtotal, discount, vat, total };
}
