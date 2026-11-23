"""
Applies one "sprint" to the demo shop: three ordinary-looking changes and one
regression. This is what the agent loop is pointed at.

  1. UI change     - the add button of product 3 gets a new data-testid
  2. data drift    - the desk mat changes price in the catalogue data
  3. app bug       - VAT starts being charged before the discount
  4. lazy loading  - the last product now renders late, exposing a fixed wait

Run once:  python3 -I scripts-seed.py
"""
import sys

def patch(path, old, new, label):
    t = open(path, encoding="utf-8").read()
    if old not in t:
        sys.exit(f"FAIL [{label}]: anchor not found in {path}")
    open(path, "w", encoding="utf-8").write(t.replace(old, new, 1))
    print(f"ok  {label}")

# 1. UI change — somebody renamed a test id during a refactor
patch("public/index.html",
      '<button data-testid="add-to-cart-${p.id}">Add to cart</button>',
      '<button data-testid="${p.id === 3 ? `cart-add-${p.id}` : `add-to-cart-${p.id}`}">Add to cart</button>',
      "1/4 UI change: add-to-cart-3 -> cart-add-3")

# 4. lazy loading — the catalogue got paginated
patch("public/index.html",
      "        products.forEach(renderProduct);",
      """        // The catalogue is now paged: the tail arrives after the first render.
        products.slice(0, 4).forEach(renderProduct);
        setTimeout(() => products.slice(4).forEach(renderProduct), 1500);""",
      "4/4 lazy loading: product 5 renders after 1500 ms")

# 2. data drift — a price changed in the source data
patch("data/products.json",
      '{ "id": 4, "name": "Desk mat",            "price": 299 }',
      '{ "id": 4, "name": "Desk mat",            "price": 349 }',
      "2/4 data drift: desk mat 299 -> 349")

# 3. app bug — VAT moved off the discounted amount back onto the subtotal
patch("public/cart.js",
      """  // Rule 3 says VAT is charged on what the customer pays, so the discount
  // has to come off first.
  const taxable = subtotal(items) - discount(items);
  return Math.round(taxable * VAT_RATE);""",
      """  const taxable = subtotal(items);
  return Math.round(taxable * VAT_RATE);""",
      "3/4 app bug: VAT charged before the discount")

print("\nsprint applied - 4 of the 5 tests should now fail, each for its own reason")
