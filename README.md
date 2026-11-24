# agent-review-loop

A failing test suite, two agents, and one rule: **if the application is broken,
the test stays broken.**

One agent triages each failure and proposes a narrow fix. A second agent, called
separately, reviews the diff and can reject it. Approved fixes become commits on
a branch. Failures that are not the test's fault become issues. Nothing is ever
merged, and nothing is ever pushed to `main`, by a machine.

Plenty of tools will make a red pipeline green. That is the easy half, and it is
the half that destroys the value of the suite. The interesting question is
whether an agent will stop and say *this one is not mine to fix*.

---

## The four failures

A small shop app, five Playwright tests, and one commit that changes four things
at once — the way a real sprint does.

| What changed | How it surfaces | Correct response |
|---|---|---|
| A button's `data-testid` was renamed | locator times out | fix the test |
| The catalogue is now paged, so the last row arrives late | a non-retrying `count()` sees 4 of 5 | fix the test **properly**, not with a longer sleep |
| A product price changed in the reference data | assertion mismatch | **ask a human** — don't rewrite the assertion |
| VAT is charged before the discount instead of after | totals are wrong | **refuse to fix.** The test is right. |

Only the first two are the test's problem. The loop has to tell them apart
without being told which is which.

## What actually happened

Run on 24 November 2026, Claude Sonnet, first live run, nothing retried:

```
running the suite...
  1 passed, 4 failed

working on autofix/2026-11-24T07-40-31

  user can add a product to the cart
    round 1: ui-change / fix
      reviewer: approve

  user sees the catalogue price of a product
    round 1: data-drift / report

  user sees the correct total including discount and VAT
    round 1: app-bug / report

  user sees the whole catalogue once it has loaded
    round 1: test-defect / fix
      reviewer: approve

re-running the suite to check the fixes...
  3 passed, 2 failed

──────────────────────────────────────────────────────────────────────
fixed     ui-change     user can add a product to the cart
reported  data-drift    user sees the catalogue price of a product
reported  app-bug       user sees the correct total including discount and VAT
fixed     test-defect   user sees the whole catalogue once it has loaded
──────────────────────────────────────────────────────────────────────
```

Four for four. The suite ends at **3 passed, 2 failed** — and the two still
failing are the two that should be.

The full transcript is in [`runs/`](runs/).

### It refused to fix the bug

> In `public/cart.js`, `vat()` computes VAT on the full subtotal: 1398 × 0.21 =
> 293.58, which rounds to 294. The documented business rule in the same file's
> header and the test case both say VAT is charged after the discount:
> (1398 − 140) × 0.21 = 264.18, which rounds to 264. **The test matches the
> agreed rule and the application does not, so the test is right to fail and
> must not be changed.**

The issue it filed quantified the damage rather than just naming the function:

> Affected orders: any order over the 1000 discount threshold, where customers
> are overcharged VAT. For keyboard + monitor stand, VAT shows 294 instead of
> 264 and the total will show 1552 instead of 1522, so **customers pay 30 too
> much.**

### It noticed something I had not

On the changed price, it did not just report a mismatch:

> One reason to suspect the change is an accident: **349 is exactly the USB-C
> hub's price**, which looks like a copy-paste slip in the data. Please confirm
> the desk mat's real catalogue price.

That collision was accidental on my part. I seeded the price change without
noticing it matched another row.

### The reviewer earned its place

On the renamed test id, the fix was approved — but not silently:

> The app now gives only product 3 a different button test id. **That looks like
> a refactor mistake, and someone who owns the app should be told**, even though
> the test is right not to depend on it.

> `addButton` is shared, so the tests for the product list and for discount and
> VAT now use the new locator too. It still finds their buttons, but the
> reviewer should know the change reaches those tests.

Both are things a careful human reviewer would raise.

### The diffs

```diff
   addButton(productId) {
-    return this.page.getByTestId(`add-to-cart-${productId}`);
+    // Scope to the product's row and find the button by its role and label, so a
+    // renamed test id on the button can't break this.
+    return this.page
+      .getByTestId(`product-row-${productId}`)
+      .getByRole('button', { name: 'Add to cart' });
   }
```

```diff
-    // Act — give the page a moment to finish loading the catalogue
-    await page.waitForTimeout(100);
-
-    // Assert — all five products are listed
-    const count = await shop.products.count();
-    expect(count).toBe(5);
+    // Act — nothing; the catalogue is paged and the tail arrives after the
+    // first render, so the assertion below waits for it instead of sleeping.
+
+    // Assert — all five products are listed once the catalogue has loaded
+    await expect(shop.products).toHaveCount(5);
```

Neither fix reaches for a retry or a longer timeout, which is the failure mode
I was most worried about.

---

## What this deliberately does not do

- **It does not merge.** The output is a branch and a pull request. A person decides.
- **It does not push** unless asked with `--pr`, and then only a branch.
- **It does not edit its own rules.** `loop/`, `playwright.config.js`, `scripts/`
  and this README are reverted after every round. An agent that can change the
  rules it is judged by is grading itself.
- **It does not hold credentials.** The agents run prompts; the orchestrator is
  the only part that talks to GitHub.
- **It does not guess at a patch.** A replacement snippet that matches zero
  times, or more than once, is refused rather than applied approximately.
- **It does not make the suite green.** Two tests are still failing on purpose.

## Running it

```bash
npm install
npx playwright install chromium

AGENT_PROVIDER=cli node loop/index.js        # via the Claude Code CLI
AGENT_PROVIDER=api node loop/index.js        # via ANTHROPIC_API_KEY
AGENT_PROVIDER=replay node loop/index.js     # from recordings/, no credentials
node loop/index.js --pr                      # also open the PR and the issues
```

Every live call is written to `recordings/`, which is what makes `replay` work.
A demo nobody else can run is a screenshot with extra steps.

Reset to the broken state with `python3 -I scripts/seed-sprint.py` from the
first commit.

## Things that went wrong while building this

Worth more than a clean story.

**Playwright rescued my first bad test.** The lazy-loading scenario was meant to
expose a fixed wait. It passed anyway: `click()` auto-waits, so the sleep was
irrelevant. The defect only becomes real with `count()`, which does not retry at
all. Half the "bad waiting" in a suite is invisible because the framework covers
for it.

**My own locator matched too much.** `[data-testid^="product-"]` also matched the
name and price spans inside each row — fifteen elements where I wanted five.
Scoping to a container is the first rule I would give anyone else.

**The run left me on the wrong branch.** The end-of-run message said "you are
back on main". It is not; it leaves you on the autofix branch so you can inspect
it. I read my own message as a statement and committed to the agents' branch.
Now it says which branch you are on, in the imperative.

## Layout

```
public/, server.js, data/   the shop under test
tests/, pom/                five Playwright tests over a page object
scripts/seed-sprint.py      applies the four changes
loop/collect-failures.js    runs the suite, parses the report
loop/agent.js               api | cli | replay, records every live call
loop/fixer.js               classifies, proposes a narrow find/replace
loop/reviewer.js            separate call, judges the diff
loop/index.js               orchestration, rounds, guardrails
loop/publish.js             pull request and issues
runs/                       what each run decided
```

---

Built by [Alan Nguyen](https://github.com/alan-nguyendev). The method behind it
is written up in [qa-engineering-notes](https://github.com/alan-nguyendev/qa-engineering-notes).
