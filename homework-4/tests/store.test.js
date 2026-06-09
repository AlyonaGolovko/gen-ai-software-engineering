const test = require("node:test");
const assert = require("node:assert");
const { formatPrice } = require("../src/store");

// Baseline test for the function that is already correct.
// (The seeded bugs in applyCoupon / cartTotal are intentionally NOT covered yet —
//  the Unit Test Generator agent will add tests for them after the fix.)
test("formatPrice formats a number as a USD string", () => {
  assert.strictEqual(formatPrice(5), "$5.00");
  assert.strictEqual(formatPrice(12.5), "$12.50");
});
