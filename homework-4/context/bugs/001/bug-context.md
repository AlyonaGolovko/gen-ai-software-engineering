# Bug Context — 001

A seeded bug report. This is the **first input** to the pipeline: the Bug Researcher
reads it, then investigates the codebase to locate the cause(s). It intentionally
describes **symptoms only** — not file names, line numbers, or root causes. Finding
those is the agents' job.

## Application under test

A minimal Node.js pricing/auth module.

- Run the app: `npm start`
- Run tests: `npm test`
- Source lives under `src/`, tests under `tests/`.

## Reported symptoms — functional

1. **Coupons over-discount.** Applying a discount code reduces the price far more
   than it should — large orders can even end up with a negative total. Example
   reported by QA: a $100 order with a "10% off" code displayed a large negative
   amount instead of about $90.

2. **Cart total looks too low.** The displayed cart total seems to be missing the
   value of one item. Customers report the shown total is less than the sum of the
   items they added.

## Requested review — security

A security review was requested for the authentication code (token handling and
user lookup). No specific issue is asserted here — the security agent should assess
the code independently and report whatever it finds.

## Expected end state (after the pipeline runs)

- Discount codes reduce the price by the correct percentage; totals are never negative.
- The cart total equals the sum of **all** item prices.
- Any security findings are remediated.
- New unit tests cover the corrected behaviour, and `npm test` passes.
