# Verified Research — Bug 001

## Verification Summary

- Overall status: **PASS**
- Research Quality: **High**
- All `file:line` references and verbatim snippets in `codebase-research.md` were checked against the actual source files and match exactly.
- Conclusions about behavior are consistent with the source code.
- Downstream agents (Bug Planner, Bug Fixer, etc.) may proceed using this verified research.

---

## Verified Claims

### Claim 1 — Coupon over-discount root cause

- Reference: `src/store.js:18`
- Stated snippet:
  ```js
  const discount = price * percent;
  ```
- Actual line 18 of `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/store.js`:
  ```js
    const discount = price * percent;
  ```
- Status: **Verified.** The snippet matches the source verbatim (the research omits the two leading spaces of indentation, but that is acceptable trimming, not a content difference).
- Behavior claim verified: `COUPONS` (lines 4–8) maps codes to whole-number percents (`SAVE10: 10`, `SAVE25: 25`, `HALF: 50`). `applyCoupon` (line 16) reads `percent = COUPONS[code] || 0` and computes `price - price * percent`, which for a $100 order with `SAVE10` yields `100 - 100*10 = -900`. This matches the reported symptom.

### Claim 2 — Cart total off-by-one loop

- Reference: `src/store.js:29`
- Stated snippet:
  ```js
  for (let i = 0; i < items.length - 1; i++) {
  ```
- Actual line 29 of `src/store.js`:
  ```js
    for (let i = 0; i < items.length - 1; i++) {
  ```
- Status: **Verified.** Snippet matches verbatim (modulo leading indentation).
- Behavior claim verified: The loop terminates at `items.length - 1`, so the final item is never added to `total`. Three items `[12, 3, 8.50]` would yield `15.00` instead of `23.50`. This matches the reported symptom.

### Claim 3 — Loose equality token comparison

- Reference: `src/auth.js:11`
- Stated snippet:
  ```js
  return token == API_KEY;
  ```
- Actual line 11 of `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/auth.js`:
  ```js
    return token == API_KEY;
  ```
- Status: **Verified.** Snippet matches verbatim (modulo leading indentation).
- Security claim verified: The function uses `==` for a security-sensitive comparison; `===` (or a constant-time comparison) is the appropriate primitive.

### Claim 4 — Hardcoded API key constant

- Reference: `src/auth.js:3`
- Stated snippet:
  ```js
  const API_KEY = "PLACEHOLDER_FAKE_SECRET_FOR_HOMEWORK";
  ```
- Actual line 3 of `src/auth.js`:
  ```js
  const API_KEY = "PLACEHOLDER_FAKE_SECRET_FOR_HOMEWORK";
  ```
- Status: **Verified.** Character-for-character match.
- Security claim verified: The secret is a string literal embedded in source.

### Claim 5 — API key exported from module

- Reference: `src/auth.js:23`
- Stated snippet:
  ```js
  module.exports = { verifyToken, findUser, API_KEY };
  ```
- Actual line 23 of `src/auth.js`:
  ```js
  module.exports = { verifyToken, findUser, API_KEY };
  ```
- Status: **Verified.** Character-for-character match.
- Security claim verified: `API_KEY` is exported alongside the auth functions, broadening accessibility of the secret.

---

## Discrepancies Found

None. All five `file:line` references resolve to the correct lines, and every quoted snippet matches the source content exactly (the research strips leading indentation in its quoted snippets — this is conventional and not treated as a discrepancy).

---

## Research Quality Assessment

**Level: High**

Reasoning:
- Every `file:line` reference (5 total) is correct and points to the exact line cited.
- Every verbatim snippet matches the source character-for-character (with only standard leading-indentation trimming, which is not a content change).
- Every behavioral/security conclusion is directly supported by the source:
  - Coupon math producing negative totals: confirmed by `COUPONS` table values and the `applyCoupon` formula.
  - Cart-total off-by-one: confirmed by the loop bound `i < items.length - 1`.
  - Loose equality, hardcoded secret, and exported secret: confirmed in `src/auth.js`.
- Zero discrepancies found.
- The Bug Planner may proceed using this report without caveats.

---

## References

Files read and checked during verification:

- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/context/bugs/001/bug-context.md`
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/context/bugs/001/research/codebase-research.md`
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/store.js` (lines 1–44; specifically verified lines 4–8, 16–20, 27–33)
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/auth.js` (lines 1–23; specifically verified lines 3, 11, 23)
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/skills/research-quality-measurement.md`
