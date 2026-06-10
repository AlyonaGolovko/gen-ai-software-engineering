// Unit tests for the two bug-001 fixes in src/store.js:
//   1. applyCoupon — discount must use percent / 100 (not raw percent)
//   2. cartTotal   — loop must include the last item

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { applyCoupon, cartTotal } = require("../src/store");

// ---------------------------------------------------------------------------
// applyCoupon
// ---------------------------------------------------------------------------

// Regression: before the fix, `discount = price * percent` (e.g. 100 * 10 = 1000),
// so the result was negative (-900). After the fix it must be 90.
test("applyCoupon regression: SAVE10 on 100 returns 90, not -900", () => {
  assert.equal(applyCoupon(100, "SAVE10"), 90);
});

// Golden path — each known coupon code produces the correct discounted price.
test("applyCoupon: SAVE10 on 200 returns 180", () => {
  assert.equal(applyCoupon(200, "SAVE10"), 180);
});

test("applyCoupon: SAVE25 on 200 returns 150", () => {
  assert.equal(applyCoupon(200, "SAVE25"), 150);
});

test("applyCoupon: HALF on 200 returns 100", () => {
  assert.equal(applyCoupon(200, "HALF"), 100);
});

// Edge: unknown coupon code — discount is 0, price is unchanged.
test("applyCoupon: unknown coupon code returns original price", () => {
  assert.equal(applyCoupon(100, "DOESNOTEXIST"), 100);
});

// Edge: zero price always returns 0, regardless of coupon.
test("applyCoupon: zero price returns 0", () => {
  assert.equal(applyCoupon(0, "SAVE10"), 0);
});

// ---------------------------------------------------------------------------
// cartTotal
// ---------------------------------------------------------------------------

// Regression: before the fix, loop ran `i < items.length - 1`, skipping the
// last item.  [10, 20, 30] summed only [10, 20] = 30.  After the fix: 60.
test("cartTotal regression: three items summed correctly (was missing last item)", () => {
  assert.equal(cartTotal([{ price: 10 }, { price: 20 }, { price: 30 }]), 60);
});

// Golden path — single item.
test("cartTotal: single item returns its price", () => {
  assert.equal(cartTotal([{ price: 42 }]), 42);
});

// Golden path — two items.
test("cartTotal: two items returns their sum", () => {
  assert.equal(cartTotal([{ price: 5 }, { price: 15 }]), 20);
});

// Edge: empty cart returns 0.
test("cartTotal: empty array returns 0", () => {
  assert.equal(cartTotal([]), 0);
});

// Edge: items with decimal prices.
test("cartTotal: decimal prices are summed correctly", () => {
  assert.equal(cartTotal([{ price: 1.5 }, { price: 2.5 }]), 4);
});

// Edge: items with zero price contribute nothing.
test("cartTotal: items with zero price contribute nothing", () => {
  assert.equal(cartTotal([{ price: 0 }, { price: 10 }, { price: 0 }]), 10);
});
