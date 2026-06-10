# Implementation Plan — Bug 001

Based on: `context/bugs/001/research/verified-research.md` (Research Quality: **High**, Status: **PASS**).

## 1. Overview

Three correctness/security defects in the Node.js pricing/auth module must be fixed:

1. **Coupon over-discount (functional):** `applyCoupon` multiplies `price` by a whole-number percent (e.g. `10`) instead of a fractional rate (e.g. `0.10`), producing wildly negative totals.
2. **Cart total off-by-one (functional):** `cartTotal` loops `i < items.length - 1`, skipping the last item.
3. **Auth security issues:** `verifyToken` uses loose equality (`==`) for a secret comparison, and the `API_KEY` constant is both a hardcoded literal and exported from the module, broadening the secret's exposure.

All fixes are surgical and local. No unrelated refactoring. The Bug Fixer applies the BEFORE/AFTER blocks verbatim. Test authoring is **not** part of this plan — that belongs to the Unit Test Generator.

---

## 2. Planned Changes

### Change 1 — Fix coupon math in `applyCoupon`

- **File:** `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/store.js`
- **Location:** function `applyCoupon`, line 18 (the `discount` computation).
- **Before:**
  ```js
  function applyCoupon(price, code) {
    const percent = COUPONS[code] || 0;
    const discount = price * percent;
    return price - discount;
  }
  ```
- **After:**
  ```js
  function applyCoupon(price, code) {
    const percent = COUPONS[code] || 0;
    const discount = price * (percent / 100);
    return price - discount;
  }
  ```
- **Rationale:** `COUPONS` stores whole-number percents (`SAVE10: 10`, `SAVE25: 25`, `HALF: 50`). Dividing by `100` converts the percent into the correct fractional rate, so a $100 order with `SAVE10` becomes `100 - 100 * 0.10 = 90`, matching the bug report's expected ~$90 result. Addresses **Verified Claim 1**.

---

### Change 2 — Fix cart total loop bound in `cartTotal`

- **File:** `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/store.js`
- **Location:** function `cartTotal`, line 29 (the `for` loop bound).
- **Before:**
  ```js
  function cartTotal(items) {
    let total = 0;
    for (let i = 0; i < items.length - 1; i++) {
      total += items[i].price;
    }
    return total;
  }
  ```
- **After:**
  ```js
  function cartTotal(items) {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      total += items[i].price;
    }
    return total;
  }
  ```
- **Rationale:** Removing `- 1` from the loop bound makes the loop iterate over every item, so the last item's price is included. Addresses **Verified Claim 2**.

---

### Change 3 — Use strict equality in `verifyToken`

- **File:** `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/auth.js`
- **Location:** function `verifyToken`, line 11.
- **Before:**
  ```js
  function verifyToken(token) {
    return token == API_KEY;
  }
  ```
- **After:**
  ```js
  function verifyToken(token) {
    return token === API_KEY;
  }
  ```
- **Rationale:** `==` performs type coercion, which is inappropriate for a security-sensitive credential comparison (e.g. `0 == ""` would be true if `API_KEY` were ever falsy). Strict equality (`===`) is the minimum-correct fix and is consistent with the `===` already used in `findUser` on line 20. Addresses **Verified Claim 3**.

> Note: The verified research mentions "constant-time comparison" as a stronger alternative. We intentionally do NOT introduce that here — it adds a new dependency/code path and is out of scope for the minimal fix. The hardcoded secret is a placeholder (Change 4), so timing-attack hardening is not warranted at this level.

---

### Change 4 — Stop exporting `API_KEY`

- **File:** `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/auth.js`
- **Location:** `module.exports`, line 23.
- **Before:**
  ```js
  module.exports = { verifyToken, findUser, API_KEY };
  ```
- **After:**
  ```js
  module.exports = { verifyToken, findUser };
  ```
- **Rationale:** Removing `API_KEY` from the module's public surface limits the secret's exposure to the single module that consumes it (via `verifyToken`). Addresses **Verified Claim 5**.

> Note on Verified Claim 4 (hardcoded secret literal on line 3): The string is explicitly named `PLACEHOLDER_FAKE_SECRET_FOR_HOMEWORK` and the bug context says no specific issue is asserted. Replacing it with `process.env.API_KEY` would change runtime behavior (tests/`npm start` would need an env var) and is a larger architectural change than the minimal fix requires. We **leave line 3 unchanged**. Reducing the export surface in Change 4 already mitigates the practical exposure risk for this homework scope. If the Security Verifier insists on env-var sourcing, that should be a separate, explicit decision — not silently bundled here.

---

## 3. Test Command

After applying the four changes above, the Bug Fixer should run:

```
npm test
```

(from `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4`). This runs `node --test` against the `tests/` directory. The Bug Fixer is **not** responsible for adding new tests; the Unit Test Generator stage will add coverage for the corrected behavior.

If `npm test` reports a failure that traces to a stale assertion encoding the **old buggy** behavior (e.g. a test asserting `cartTotal([a,b,c])` skips the last item, or `applyCoupon(100, "SAVE10") === -900`), the Bug Fixer should escalate / flag — not silently "fix" the test to match the bug. Correctness tests should be re-aligned by the Unit Test Generator stage, not here.

---

## 4. Risks / Notes

- **Ordering:** The four changes are independent. They can be applied in any order; they touch two files (`src/store.js`, `src/auth.js`) and do not interact.
- **Public API surface change:** Change 4 removes `API_KEY` from `module.exports`. Any downstream consumer doing `const { API_KEY } = require('./auth')` would break. A grep of the repo at planning time should confirm no in-repo consumer references `auth.API_KEY` or destructures `API_KEY` from `./auth`. The Bug Fixer should run such a grep before committing; if a consumer is found, surface it rather than silently restoring the export.
- **Numeric precision (Change 1):** `price * (percent / 100)` introduces standard IEEE-754 rounding (e.g. `19.99 * 0.1 = 1.9990000000000003`). This is acceptable because the consumer formats with `formatPrice` (`n.toFixed(2)`). Do not "fix" this with rounding inside `applyCoupon` — that would change return semantics.
- **Empty cart (Change 2):** With the corrected loop, `cartTotal([])` returns `0`, which is the correct behavior. The previous buggy bound also returned `0` for an empty cart, so this is not a regression.
- **No new files, no test edits, no dependency changes.**

---

## 5. References

This plan is derived directly from the following items in `context/bugs/001/research/verified-research.md`:

- **Verified Claim 1** (`src/store.js:18`, coupon math) → Change 1.
- **Verified Claim 2** (`src/store.js:29`, cart loop bound) → Change 2.
- **Verified Claim 3** (`src/auth.js:11`, loose equality) → Change 3.
- **Verified Claim 4** (`src/auth.js:3`, hardcoded secret literal) → discussed under Change 4 note; **intentionally not modified** in this minimal fix.
- **Verified Claim 5** (`src/auth.js:23`, secret exported) → Change 4.

Source files inspected while drafting this plan:

- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/store.js`
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/auth.js`
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/package.json`
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/context/bugs/001/bug-context.md`
