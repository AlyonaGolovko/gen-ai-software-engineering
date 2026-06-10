# Security Report — Bug 001

## 1. Summary

**Overall risk level:** MEDIUM (driven by a hardcoded credential literal that
remains in source, even though it is labeled as a placeholder).

Findings by severity:

- CRITICAL: 0
- HIGH: 1
- MEDIUM: 1
- LOW: 1
- INFO: 1

The four changes applied by the Bug Fixer are themselves improvements from a
security standpoint (strict equality on a credential comparison, and removal
of `API_KEY` from the module exports). The remaining risk is centered on the
hardcoded secret literal at `src/auth.js:3`, which was intentionally left in
place per the plan.

---

## 2. Findings

### Finding 1 — Hardcoded credential in source

- **Severity:** HIGH
- **Location:** `src/auth.js:3`
- **Description:** `API_KEY` is hardcoded as a string literal
  (`"PLACEHOLDER_FAKE_SECRET_FOR_HOMEWORK"`). Even though the value is
  labeled as a placeholder, storing API keys / shared secrets in source
  control is a well-known anti-pattern: it normalizes the practice, the value
  ends up in git history, and any future replacement with a real secret will
  silently inherit the same insecure storage. The Bug Fixer removed
  `API_KEY` from `module.exports`, which is good, but the literal itself is
  still readable to anyone with repo access and is still used as the
  comparison target in `verifyToken`.
- **Remediation:** Load the secret from an environment variable (e.g.,
  `process.env.API_KEY`) at module load time, fail fast if it is missing in
  production, and document the variable in a `.env.example` (without a real
  value). Add the real `.env` to `.gitignore`. For production, use a
  secret manager (AWS Secrets Manager, GCP Secret Manager, Vault, etc.).

### Finding 2 — Non-constant-time token comparison

- **Severity:** MEDIUM
- **Location:** `src/auth.js:11`
- **Description:** `verifyToken` compares the supplied token to `API_KEY`
  with `===`. The fix from `==` to `===` correctly eliminates type-coercion
  bypasses (e.g., `verifyToken(0)` no longer returns truthy when `API_KEY`
  is a non-empty string). However, `===` on strings in V8 is not
  constant-time: it short-circuits on the first mismatched character and on
  length differences. In contexts where an attacker can measure response
  time (network endpoints, especially), this enables a timing side-channel
  attack on the secret.
- **Remediation:** Use `crypto.timingSafeEqual` with both inputs coerced to
  equal-length `Buffer`s. Pseudocode:
  ```js
  const crypto = require("crypto");
  function verifyToken(token) {
    if (typeof token !== "string") return false;
    const a = Buffer.from(token);
    const b = Buffer.from(API_KEY);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
  ```
  Note: length comparison still leaks length, which is generally acceptable
  for fixed-length keys but should be considered in threat modeling.

### Finding 3 — Missing input validation in `verifyToken`

- **Severity:** LOW
- **Location:** `src/auth.js:10-12`
- **Description:** `verifyToken` accepts any value for `token` with no type
  guard. With `===` this is safe against coercion bypasses, but passing
  non-string types (objects, arrays, `undefined`) silently returns `false`
  rather than rejecting the input explicitly. This can mask bugs in callers
  and make abuse harder to detect via logs.
- **Remediation:** Add an explicit `typeof token !== "string"` guard at the
  top of `verifyToken` and return `false` (or throw) accordingly. Pair with
  logging for observability.

### Finding 4 — No validation of `code`/`price` in `applyCoupon`

- **Severity:** INFO
- **Location:** `src/store.js:16-20`
- **Description:** `applyCoupon` does not validate that `price` is a
  non-negative finite number or that `code` is a string. A caller passing
  `NaN`, `Infinity`, or a negative number will produce a meaningless result
  but no error. Lookup on `COUPONS[code]` is safe because `COUPONS` is a
  plain object literal with known keys, and `|| 0` neutralizes missing
  codes; there is no prototype-pollution risk introduced by the fix.
- **Remediation:** Add input validation (e.g., `Number.isFinite(price) &&
  price >= 0`, and `typeof code === "string"`) and return / throw on
  invalid input. Optional, not security-critical given the current
  call sites.

---

## 3. Categories Checked

- **Injection (command / SQL / template):** Examined. No issues found. The
  changed code performs only arithmetic, object property lookup with a
  string key against a static literal map, and a string equality check. No
  shell, SQL, or template interpolation is involved.
- **Hardcoded secrets / credentials:** Examined. See Finding 1
  (`src/auth.js:3`).
- **Insecure comparisons:** Examined. The loose-equality bug was fixed.
  Residual non-constant-time concern documented in Finding 2.
- **Missing input validation:** Examined. See Findings 3 and 4.
- **Unsafe dependencies:** Examined. The changes introduce no new
  dependencies; both files are pure local logic with no `require` calls
  added. No issues found from this change set.
- **XSS / CSRF:** Examined. Not applicable — there is no web rendering,
  cookie handling, or HTTP surface in the changed files. No issues found.

---

## 4. References

Files reviewed:

- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/context/bugs/001/fix-summary.md`
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/auth.js`
- `/Users/alyonagolovko/Alyona/study/ai-assisted-dev-homework/homework-4/src/store.js`
