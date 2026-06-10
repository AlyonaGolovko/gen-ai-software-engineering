#!/usr/bin/env node
// CLI entry point — demonstrates the app's current (buggy) behaviour.

const { applyCoupon, cartTotal, formatPrice } = require("./store");

const cart = [
  { name: "Book", price: 12.0 },
  { name: "Pen", price: 3.0 },
  { name: "Mug", price: 8.5 },
];

const total = cartTotal(cart);
console.log("Items in cart:", cart.length);
console.log("Cart total:   ", formatPrice(total), "(expected $23.50)");
console.log("With SAVE10:  ", formatPrice(applyCoupon(total, "SAVE10")), "(expected ~$21.15)");
