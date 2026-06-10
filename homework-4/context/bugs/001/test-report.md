# Test Report — Bug 001

## 1. Scope

### Changed units covered

| # | File | Function / Symbol | Covered? |
|---|------|-------------------|----------|
| 1 | `src/store.js` | `applyCoupon` — `percent / 100` fix | Yes |
| 2 | `src/store.js` | `cartTotal` — loop-bound `i < items.length` fix | Yes |
| 3 | `src/auth.js` | `verifyToken` — strict equality `===` fix | Yes |
| 4 | `src/auth.js` | `module.exports` — `API_KEY` removed from exports | Yes |

### Intentionally skipped

- `formatPrice` (`src/store.js`): unchanged by the bug fix; already covered by the pre-existing `tests/store.test.js` baseline test. No new tests were added for it.
- `findUser` (`src/auth.js`): unchanged by the bug fix. Three smoke tests were added in `tests/auth.bug001.test.js` solely to confirm the module still exports `findUser` correctly after `API_KEY` was removed — they are not primary coverage of that function.

---

## 2. Generated Tests

### `tests/store.bug001.test.js`

| Test name | Description |
|-----------|-------------|
| `applyCoupon regression: SAVE10 on 100 returns 90, not -900` | Directly exercises the regression: the old code returned -900 due to missing `/100`; the fixed code must return 90. |
| `applyCoupon: SAVE10 on 200 returns 180` | Golden path: 10% off 200 = 180. |
| `applyCoupon: SAVE25 on 200 returns 150` | Golden path: 25% off 200 = 150. |
| `applyCoupon: HALF on 200 returns 100` | Golden path: 50% off 200 = 100. |
| `applyCoupon: unknown coupon code returns original price` | Edge: an unrecognised code produces 0 discount; price is unchanged. |
| `applyCoupon: zero price returns 0` | Edge: zero price always produces zero regardless of coupon. |
| `cartTotal regression: three items summed correctly (was missing last item)` | Directly exercises the regression: old loop skipped the last item, returning 30 instead of 60. |
| `cartTotal: single item returns its price` | Golden path: one-element cart. |
| `cartTotal: two items returns their sum` | Golden path: two-element cart. |
| `cartTotal: empty array returns 0` | Edge: empty cart must return 0. |
| `cartTotal: decimal prices are summed correctly` | Edge: floating-point prices (1.5 + 2.5 = 4). |
| `cartTotal: items with zero price contribute nothing` | Edge: zero-price items do not distort the sum. |

### `tests/auth.bug001.test.js`

| Test name | Description |
|-----------|-------------|
| `verifyToken: correct token string returns true` | Golden path: exact matching token returns true. |
| `verifyToken: wrong string returns false` | Golden path: a different string returns false. |
| `verifyToken regression: numeric 0 does not match string token (no type coercion)` | Regression: with loose `==`, certain values (e.g. `0`) could coerce to a truthy match; strict `===` must prevent this. |
| `verifyToken: null returns false` | Edge: null must not authenticate. |
| `verifyToken: undefined returns false` | Edge: undefined must not authenticate. |
| `verifyToken: empty string returns false` | Edge: empty string must not authenticate. |
| `verifyToken: boolean true returns false` | Edge: boolean true must not authenticate. |
| `auth module does not export API_KEY` | Regression: `require('../src/auth').API_KEY` must be `undefined` (not a property of the exports object). |
| `findUser: returns matching user object from array` | Smoke: `findUser` is still exported and works after the export change. |
| `findUser: returns undefined when user not found` | Smoke: `findUser` returns `undefined` for a missing name. |
| `findUser: returns undefined for empty users array` | Smoke: `findUser` handles an empty array gracefully. |

---

## 3. Run Results

**Command:** `npm test`  
(`npm test` invokes `node --test`, which auto-discovers all `*.test.js` files under the project.)

```
TAP version 13
ok 1  - verifyToken: correct token string returns true
ok 2  - verifyToken: wrong string returns false
ok 3  - verifyToken regression: numeric 0 does not match string token (no type coercion)
ok 4  - verifyToken: null returns false
ok 5  - verifyToken: undefined returns false
ok 6  - verifyToken: empty string returns false
ok 7  - verifyToken: boolean true returns false
ok 8  - auth module does not export API_KEY
ok 9  - findUser: returns matching user object from array
ok 10 - findUser: returns undefined when user not found
ok 11 - findUser: returns undefined for empty users array
ok 12 - applyCoupon regression: SAVE10 on 100 returns 90, not -900
ok 13 - applyCoupon: SAVE10 on 200 returns 180
ok 14 - applyCoupon: SAVE25 on 200 returns 150
ok 15 - applyCoupon: HALF on 200 returns 100
ok 16 - applyCoupon: unknown coupon code returns original price
ok 17 - applyCoupon: zero price returns 0
ok 18 - cartTotal regression: three items summed correctly (was missing last item)
ok 19 - cartTotal: single item returns its price
ok 20 - cartTotal: two items returns their sum
ok 21 - cartTotal: empty array returns 0
ok 22 - cartTotal: decimal prices are summed correctly
ok 23 - cartTotal: items with zero price contribute nothing
ok 24 - formatPrice formats a number as a USD string
1..24
# tests 24
# suites 0
# pass 24
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 400.903625
```

**Result: 24 pass / 0 fail / 0 cancelled.**

---

## 4. FIRST Checklist

| Principle | How this test set satisfies it |
|-----------|-------------------------------|
| **Fast** | All tests call pure in-process functions with no I/O, no network, no timers. The full suite completes in ~400 ms. |
| **Independent** | Every test constructs its own inputs (literal values or inline arrays) inside its `test(...)` block. No shared mutable state exists between tests; no `beforeAll`/module-level variable is mutated. |
| **Repeatable** | No `Date.now`, `Math.random`, `process.env`, or locale-sensitive operations are used anywhere. All inputs are hard-coded literals. Results are identical on any machine, any run. |
| **Self-validating** | Every test uses `node:assert/strict` assertions (`assert.equal`, `assert.deepEqual`). The runner reports `ok` / `not ok` automatically — no human interpretation is needed. |
| **Timely** | Tests are written immediately after the fix (same change set). They directly cover the four changed behaviours identified in `fix-summary.md`, including the specific "before" regression inputs that would fail against the unfixed code. |

---

## 5. Coverage Notes / Gaps

| Gap | Reason / Category |
|-----|-------------------|
| Floating-point rounding edge cases in `applyCoupon` (e.g. non-round percentages) | Low priority; the project does not use `toFixed` or a rounding utility in `applyCoupon`, so results are raw JS IEEE-754 floats. Integration/contract tests should handle display rounding via `formatPrice`. |
| `verifyToken` with a token that is a number equal to a non-zero coercion target (e.g. `NaN`, `Infinity`) | Nice-to-have. `===` strict equality covers all of these in one go; the specific `0` regression case is tested explicitly. Additional numeric values add little confidence beyond what is already there. |
| `API_KEY` value itself is not tested | Intentional. The secret is a hardcoded placeholder; testing its value would hard-code it in the test suite, making rotation harder. The export-removal test is sufficient. |
| `cartTotal` with a single item (two-item loop boundary) that was affected by the off-by-one | Covered: the single-item golden path confirms the loop runs at least once, and the three-item regression test confirms the upper bound. |
| Performance / load characteristics of `cartTotal` with a large array | Out of scope for a unit test; would require a benchmark harness. |
| Integration between `applyCoupon` and `cartTotal` (e.g. discount after totalling) | Out of scope; those are separate pure functions with no shared state. Integration tests belong in a higher-level test layer. |

---

## 6. References

- `context/bugs/001/fix-summary.md` — four changes: `applyCoupon` math, `cartTotal` loop bound, `verifyToken` strict equality, `API_KEY` export removal.
- Modified source files: `src/store.js`, `src/auth.js`.
- `skills/unit-tests-FIRST.md` — FIRST principle checklist applied to every test.
- New test files: `tests/store.bug001.test.js`, `tests/auth.bug001.test.js`.
- Pre-existing baseline test retained unchanged: `tests/store.test.js`.
