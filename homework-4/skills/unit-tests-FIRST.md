# Unit Tests — FIRST Principles

**Purpose**: Define the FIRST principles the Unit Test Generator must follow when writing tests for changed code in this Node.js project (using the built-in `node:test` runner).

## The Five FIRST Principles

### F — Fast

Tests must run quickly. No real network calls, no real database, no `setTimeout`/sleeps.

- **Do**: import the function under test directly and call it in-process; stub I/O with `t.mock` or small fakes.
- **Don't**: hit a live HTTP endpoint, open a real DB connection, or use `await new Promise(r => setTimeout(r, 1000))` to "wait for something".

### I — Independent

No shared state or ordering between tests. Each test sets up the data it needs.

- **Do**: create fresh inputs inside each `test(...)` block; use `t.beforeEach` for per-test setup.
- **Don't**: rely on a module-level variable mutated by an earlier test, or assume tests run in file order.

### R — Repeatable

Same result every run, on any machine. No reliance on wall-clock time, randomness, locale, or env vars.

- **Do**: inject clocks/RNGs, or stub `Date.now` and `Math.random` via `t.mock.method(...)`.
- **Don't**: assert `expect(result.createdAt).toBe(new Date().toISOString())` or depend on `process.env.USER`.

### S — Self-validating

Each test asserts pass/fail automatically. No human reads the output to decide.

- **Do**: use `node:assert/strict` (`assert.equal`, `assert.deepEqual`, `assert.rejects`) so the runner reports pass/fail.
- **Don't**: `console.log(result)` and eyeball it, or write a test with no assertions.

### T — Timely

Tests are written alongside the fix and cover the new or changed behaviour.

- **Do**: add tests in the same change as the bug fix, covering the regression case and key edge cases of the modified code.
- **Don't**: defer tests "for later", or only test code paths that were untouched.

## How to use this skill

The Unit Test Generator MUST:

1. **Write tests only for the new/changed code** identified in `fix-summary.md` — do not add coverage for unrelated modules.
2. **Make every generated test satisfy all five FIRST principles** (Fast, Independent, Repeatable, Self-validating, Timely).
3. **Confirm in `test-report.md`** that the generated tests meet FIRST — include a short checklist mapping each principle to how the tests satisfy it.
