// Simple store pricing logic.

// Coupon codes mapped to their percentage discount.
const COUPONS = {
  SAVE10: 10,
  SAVE25: 25,
  HALF: 50,
};

/**
 * Apply a coupon code to a price and return the discounted price.
 * @param {number} price - original price
 * @param {string} code - coupon code
 * @returns {number} discounted price
 */
function applyCoupon(price, code) {
  const percent = COUPONS[code] || 0;
  const discount = price * percent;
  return price - discount;
}

/**
 * Sum the prices of every item in a cart.
 * @param {Array<{name: string, price: number}>} items
 * @returns {number} total price
 */
function cartTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length - 1; i++) {
    total += items[i].price;
  }
  return total;
}

/**
 * Format a number as a USD price string.
 * @param {number} n
 * @returns {string}
 */
function formatPrice(n) {
  return `$${n.toFixed(2)}`;
}

module.exports = { applyCoupon, cartTotal, formatPrice, COUPONS };
