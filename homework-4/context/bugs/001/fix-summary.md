# Fix Summary — Bug 001

## 1. Changes Made

### Change 1 — Fix coupon math in `applyCoupon`

- **File:** `src/store.js`
- **Location:** function `applyCoupon`, line 18

**Before:**
```js
const discount = price * percent;
```

**After:**
```js
const discount = price * (percent / 100);
```

**Result:** Applied successfully. `COUPONS` stores whole-number percents (10, 25, 50), so dividing by 100 produces the correct fractional rate. `applyCoupon(100, "SAVE10")` now returns `90` instead of `-900`.

---

### Change 2 — Fix cart total loop bound in `cartTotal`

- **File:** `src/store.js`
- **Location:** function `cartTotal`, line 29

**Before:**
```js
for (let i = 0; i < items.length - 1; i++) {
```

**After:**
```js
for (let i = 0; i < items.length; i++) {
```

**Result:** Applied successfully. The loop now iterates over every item, including the last one. `cartTotal([{price:10},{price:20},{price:30}])` now returns `60` instead of `30`.

---

### Change 3 — Use strict equality in `verifyToken`

- **File:** `src/auth.js`
- **Location:** function `verifyToken`, line 11

**Before:**
```js
return token == API_KEY;
```

**After:**
```js
return token === API_KEY;
```

**Result:** Applied successfully. Strict equality prevents type-coercion bypasses on a security-sensitive credential comparison.

---

### Change 4 — Stop exporting `API_KEY`

- **File:** `src/auth.js`
- **Location:** `module.exports`, line 23

**Before:**
```js
module.exports = { verifyToken, findUser, API_KEY };
```

**After:**
```js
module.exports = { verifyToken, findUser };
```

**Result:** Applied successfully. Pre-change grep of the entire repo confirmed no downstream consumer references `API_KEY` via `require('./auth')`, so no consumers were broken.

---

## 2. Overall Status

**success** — All four changes applied exactly as specified in the plan; `npm test` passed with 1 test, 0 failures, 0 cancelled.

---

## 3. Manual Verification

Run these commands from `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4`:

```bash
# Run the test suite
npm test
# Expected: "pass 1", "fail 0"

# Spot-check coupon fix (should print 90)
node -e "const {applyCoupon} = require('./src/store'); console.log(applyCoupon(100, 'SAVE10'));"

# Spot-check cart total fix (should print 60)
node -e "const {cartTotal} = require('./src/store'); console.log(cartTotal([{price:10},{price:20},{price:30}]));"

# Spot-check strict equality in verifyToken (should print true then false)
node -e "const {verifyToken} = require('./src/auth'); console.log(verifyToken('PLACEHOLDER_FAKE_SECRET_FOR_HOMEWORK')); console.log(verifyToken(0));"

# Confirm API_KEY is no longer exported (should print undefined)
node -e "const auth = require('./src/auth'); console.log(auth.API_KEY);"
```

Expected output for each command:
- `npm test`: `# pass 1` / `# fail 0`
- `applyCoupon(100, 'SAVE10')`: `90`
- `cartTotal([...])`: `60`
- `verifyToken(...)` two calls: `true` then `false`
- `auth.API_KEY`: `undefined`

---

## 4. Deviations from the Plan

None. All four changes were applied verbatim. The plan's note about leaving line 3 of `auth.js` (the hardcoded secret literal) unchanged was honored — that line was not modified.

---

## 5. References

- Plan entries: Change 1 (Verified Claim 1), Change 2 (Verified Claim 2), Change 3 (Verified Claim 3), Change 4 (Verified Claim 5).
- Source: `context/bugs/001/implementation-plan.md`, derived from `context/bugs/001/research/verified-research.md`.
- Files modified: `src/store.js`, `src/auth.js`.
