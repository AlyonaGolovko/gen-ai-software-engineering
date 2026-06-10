# Codebase Research — Bug 001

## Summary

Investigation of the Node.js pricing/auth module under `src/` and `tests/` to locate
the root causes of two reported functional symptoms:

1. Coupons over-discounting (potentially producing negative totals).
2. Cart total being lower than the sum of all items.

Additionally, the `src/auth.js` file was examined for observable security concerns
as requested in the bug report.

---

## Findings

### Symptom 1 — Coupons over-discount (negative totals possible)

**File:line:** `src/store.js:18`

**Verbatim snippet:**
```js
const discount = price * percent;
```

**Explanation:**
`COUPONS` maps coupon codes to whole-number percentages (e.g., `SAVE10 → 10`,
`SAVE25 → 25`). The variable `percent` therefore holds values like `10` or `25`,
not the decimal fraction `0.10` or `0.25`. Multiplying `price * percent` scales
the price by that whole number rather than by the intended fractional rate. For a
`$100` order and `SAVE10`, this produces `discount = 100 * 10 = 1000`, and
`price - discount = 100 - 1000 = -900` — a large negative total, matching the
reported symptom exactly.

---

### Symptom 2 — Cart total is missing one item

**File:line:** `src/store.js:29`

**Verbatim snippet:**
```js
for (let i = 0; i < items.length - 1; i++) {
```

**Explanation:**
The loop condition is `i < items.length - 1`, which stops one index short of the
last element. For a three-item cart `[Book $12, Pen $3, Mug $8.50]`, the loop
iterates `i = 0` and `i = 1` only, summing `$12 + $3 = $15` and omitting the last
item (`Mug $8.50`). The correct total should be `$23.50` but the function returns
`$15.00`. This matches the customer-reported symptom of the total being less than
the sum of all added items.

---

### Security Observations — Auth code

**Finding A — Loose equality for token comparison**

**File:line:** `src/auth.js:11`

**Verbatim snippet:**
```js
return token == API_KEY;
```

The `==` operator performs type-coercing equality. Strict equality (`===`) is the
standard for security-sensitive comparisons. Type coercion can introduce subtle
bypass paths; for example, certain JavaScript type-juggling inputs may satisfy `==`
where `===` would not.

**Finding B — Hardcoded secret in source**

**File:line:** `src/auth.js:3`

**Verbatim snippet:**
```js
const API_KEY = "PLACEHOLDER_FAKE_SECRET_FOR_HOMEWORK";
```

The API key is a string literal committed directly in source code. Any actor with
read access to the repository can retrieve the secret. Production secrets should
be injected via environment variables or a secrets manager.

**Finding C — API key exported in module**

**File:line:** `src/auth.js:23`

**Verbatim snippet:**
```js
module.exports = { verifyToken, findUser, API_KEY };
```

`API_KEY` is exported alongside the auth functions. Any module that imports from
`auth.js` gains direct access to the raw secret, widening the blast radius of a
potential exposure.

---

## Files Examined

- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/context/bugs/001/bug-context.md`
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/store.js`
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/auth.js`
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/index.js`
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/tests/store.test.js`
