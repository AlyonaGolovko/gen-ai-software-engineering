# agents.md — Guide for AI Coding Agents

This guide governs any AI coding agent producing code in this repository. Every rule is derived from `specification.md` or is a banking/fintech industry default (marked **[Domain default]**). Rules are written as "always" / "never" so an agent can self-check its output line by line.

---

## 1. Tech Stack Assumptions

- **Always** write TypeScript with `"strict": true` enabled in `tsconfig.json`. Also enable `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
- **Always** target Node.js LTS (current LTS line); **never** rely on non-LTS-only APIs.
- **Always** use ES2022+ module syntax (`import`/`export`); **never** mix CommonJS `require` into TypeScript source.
- **Never** introduce a runtime dependency without a clear mapping to a spec requirement (state machine, processor client, audit, notifications, reconciliation, idempotency store).
- **Always** translate the spec's example Python paths to TypeScript equivalents:
  - `src/cards/state_machine.py` → `src/cards/stateMachine.ts`
  - `src/cards/processor_client.py` → `src/cards/processorClient.ts`
  - `src/cards/audit.py` → `src/cards/audit.ts`
  - `src/cards/api/cardholder_routes.py` → `src/cards/api/cardholderRoutes.ts`
  - `src/cards/api/ops_routes.py` → `src/cards/api/opsRoutes.ts`
  - `src/cards/notifications.py` → `src/cards/notifications.ts`
  - `src/cards/reconciliation.py` → `src/cards/reconciliation.ts`
- **Always** put tests under `tests/cards/` mirroring source filenames (`tests/cards/stateMachine.test.ts`).
- **Always** use `Decimal`-safe types (e.g. `decimal.js` or `bignumber.js`) where money appears. **Never** use `number` for monetary values. **[Domain default]** and spec §Implementation Notes.

---

## 2. Banking / Fintech Domain Rules

### Card state model (MLO-1)
- **Always** treat the valid card statuses as exactly `active | frozen | closed | expired | lost | stolen`.
- **Always** permit only `active ↔ frozen` transitions. **Never** allow any transition out of `closed`, `expired`, `lost`, or `stolen` — these are terminal.
- **Always** record `last_freeze_initiator` (`cardholder` or `ops`) on every freeze.
- **Never** allow a cardholder-initiated unfreeze when `last_freeze_initiator === 'ops'`. Return HTTP 409 with error code `cardholder_cannot_unfreeze_ops_freeze`.
- **Always** treat a freeze on an already-frozen card as an idempotent no-op (200, `unchanged: true`). **Never** re-call the processor, re-write audit, or re-notify on a no-op.

### Initiators and authorization (MLO-2, MLO-3)
- **Always** require step-up authentication on cardholder freeze, with token age ≤ 5 minutes. **Never** require step-up on cardholder unfreeze.
- **Always** require role `card_ops` on every ops endpoint. **Never** accept ops endpoints without this role — return 403.
- **Always** require a `reason_code` on ops force-freeze and lift-force-freeze, drawn exactly from `{suspected_fraud, aml_review, customer_request_phone, chargeback_investigation, other}`. **Never** accept any other value — return 4xx.
- **Always** cap ops `notes` at 500 characters.

### Reason codes and operator identity (MLO-6)
- **Never** include `reason_code`, operator identity, or ops free-text `notes` in any cardholder-facing payload (push, email, API response body shown to cardholder).
- **Always** use the generic cardholder template for ops-initiated freezes: `"Your card has been temporarily frozen. Please contact support."`.

### Endpoint surface
- **Always** expose exactly these routes:
  - `POST /v1/cards/{card_id}/freeze`
  - `POST /v1/cards/{card_id}/unfreeze`
  - `POST /v1/ops/cards/{card_id}/force-freeze`
  - `POST /v1/ops/cards/{card_id}/lift-force-freeze`
- **Never** introduce new routes outside the spec's Ending Context without an explicit MLO reference.

---

## 3. Code Style

- **Always** prefer pure functions for domain logic. The state machine **must** be pure: no I/O, no clock reads, no DB calls. Inject `now()` and any external dependencies. (Spec Task 1.)
- **Always** model domain errors as typed classes extending a base `DomainError`. Required error types: `TerminalStateError`, `CardholderCannotUnfreezeOpsFreezeError`, `InvalidReasonCodeError`, `ProcessorTimeoutError`, `ProcessorRejectedError`, `AuditWriteError`, `StepUpRequiredError`, `ForbiddenError`, `ConcurrentRequestInProgressError`, `IdempotencyKeyConflictError`. **Never** throw plain `Error` or strings from domain code.
- **Always** map each domain error to a stable HTTP error code string in responses: `terminal_state`, `cardholder_cannot_unfreeze_ops_freeze`, `processor_unavailable`, `processor_timeout`, `step_up_required`, `forbidden`, `audit_write_failed`, `concurrent_request_in_progress`, `idempotency_key_conflict`. **Never** rename these codes — they are a client contract.
- **Always** use branded types for sensitive identifiers: `type TokenizedCardId = string & { readonly __brand: 'TokenizedCardId' }`. The audit writer's signature **must** accept `TokenizedCardId`, not `string`. **Never** widen a raw PAN string into `TokenizedCardId`.
- **Always** use ISO-8601 UTC strings for timestamps in audit rows and event payloads. **Never** use local time or epoch millis in audit rows.
- **Always** name files in camelCase, classes in PascalCase, constants in `SCREAMING_SNAKE_CASE`.
- **Never** write multi-paragraph comments. One short line max, only where the *why* is non-obvious.
- **Always** structure each state-changing handler in this order:
  1. Acquire per-card advisory lock (500ms acquisition timeout).
  2. Load card; resolve any cached idempotency response and short-circuit if present.
  3. Run state machine (pure).
  4. Call processor (2s hard timeout, exactly one retry on transport/5xx).
  5. **In a single DB transaction:** write audit row + persist new card state + persist idempotency response. Commit atomically.
     - 5a. If this transaction fails after processor success: issue a compensating `unfreezeCard`/`freezeCard` to the processor. If compensation succeeds → return 5xx `audit_write_failed` (no local state change, no notification). If compensation also fails → write a `pending_processor_verification` row with `intended_target_state = previous_state` in a separate autocommit transaction → return 5xx `audit_write_failed` (no notification).
  6. Enqueue notification (best-effort; do not block the response on delivery).
  7. Release lock.
  8. Respond.

---

## 4. Testing Expectations

- **Always** use the repo's test runner (Jest if present; otherwise pick one and use it consistently). Tests go in `tests/cards/*.test.ts`.
- **Always** write one test per Acceptance Criterion bullet from the spec, tagged in the test name with the AC text and the MLO ID it traces to.
- **Always** write one test per row of the spec's "Edge case resolutions" table. Required cases:
  - In-flight auth + concurrent freeze: response copy contains the literal substring `"no further transactions"`; assert the system does **not** call the processor to cancel the in-flight auth.
  - Audit write fails after processor ack, compensation succeeds: assert processor received `unfreezeCard`; assert no local state change; assert no notification dispatched; assert HTTP 5xx with code `audit_write_failed`.
  - Audit write fails after processor ack, compensation also fails: assert one `pending_processor_verification` row exists with `intended_target_state = previous_state`; assert HTTP 5xx with code `audit_write_failed`.
  - Expiry while frozen: nightly job emits exactly one `system_expiry` audit row and **zero** cardholder notifications.
  - Notification queue unavailable: state commits; `notification_enqueue_failed` metric emitted; **no** state rollback.
  - Rapid freeze-then-unfreeze: second request either operates on post-first state or returns 503 `concurrent_request_in_progress` within 500ms.
  - Concurrent ops force-freezes (N attempts): exactly one cardholder notification dispatched; N−1 `force_freeze_attempt_noop` audit rows recorded.
  - Idempotency replay with same body: byte-for-byte identical response (status + body).
  - Idempotency replay with different body: HTTP 422 `idempotency_key_conflict`.
  - Idempotency replay after state moved on: original cached response returned, **not** current state.
- **Always** include a PAN-leakage security test that seeds a known PAN literal into fixtures and asserts that string never appears in any captured log, audit row, event payload, or notification payload (MLO-5).
- **Always** include a load test asserting freeze p95 ≤ 300ms (MLO-7), processor ack p99 ≤ 2s (MLO-8), and success rate ≥ 99.95% per the MLO-9 formula, at 500 RPS sustained for 10 minutes against a processor sandbox.
- **Always** stub the processor client at the network boundary in unit tests; **never** mock the state machine itself — exercise it directly.
- **Always** use integration tests (not mocks) for: audit writer ↔ audit service, idempotency store ↔ DB, advisory lock behavior. **[Domain default]** mocking these hides the failure modes that matter in payments.

---

## 5. Security & Compliance Constraints

### PAN handling (MLO-5, **[Domain default]** reinforced by spec)
- **Never** log, audit, emit to events, render in notifications, or include in API responses the raw PAN. **Always** use the tokenized card identifier outside the card vault.
- **Never** accept a raw PAN as input to any function in `src/cards/` other than the existing card vault boundary. The processor client **must** reject calls that look like a PAN (length 13–19, all digits).
- **Always** include "last-4 of tokenized card and new state only" in notification payloads. **Never** include PAN, reason code, or operator identity in any notification.

### Audit (MLO-5)
- **Always** write the audit row **before** returning a success response. **Never** return success if the audit write failed — return 5xx `audit_write_failed`.
- **Always** include exactly these audit fields: tokenized card identifier, previous state, new state, initiator type, initiator identity, reason code (nullable), timestamp (UTC ISO-8601), originating system, request id.
- **Never** mutate or delete an audit row. Storage is append-only with 7-year retention.
- **Always** write ops actions to the separate SOX/SOC2 audit stream **in addition to** the standard card audit stream.

### Auth
- **Always** verify the cardholder owns the card before any cardholder endpoint operates on it.
- **Always** verify the step-up token's age ≤ 5 minutes on cardholder freeze; reject with `step_up_required` otherwise.
- **Always** verify `role === 'card_ops'` from the JWT/session on every ops endpoint; reject with 403 `forbidden` otherwise.
- **Never** trust a client-supplied `initiator` field — derive it from the authenticated principal.

### Idempotency (MLO-2)
- **Always** require an `Idempotency-Key` header on POST endpoints with side effects. Persist `(card_id, key) → response` in `idempotency_responses` with 24h TTL.
- **Always** return the cached response byte-for-byte on replay with the same canonical body.
- **Always** return HTTP 422 `idempotency_key_conflict` on replay with a different body under the same key.
- **Never** invalidate a cached idempotency response because the underlying card state has since changed. The cached response is returned regardless of current state.

### Concurrency (Spec §Concurrency)
- **Always** acquire a per-card Postgres advisory lock keyed on `hashtext(tokenized_card_id)` using `pg_try_advisory_xact_lock`. Acquisition timeout: 500ms.
- **Always** return HTTP 503 `concurrent_request_in_progress` (retryable) on lock-acquisition timeout.
- **Always** resolve concurrent ops force-freezes as first-writer-wins; subsequent attempts return 200 `unchanged: true` and write a `force_freeze_attempt_noop` audit row.
- **Never** hold the advisory lock across the processor call without enforcing the 2s processor timeout — total critical-section time must stay bounded.

### Processor integration (MLO-4)
- **Always** call the processor synchronously with a 2s hard timeout.
- **Always** commit local state + audit in the **same** DB transaction, **only** after processor success.
- **Always** roll back the local transaction and write a `pending_processor_verification` row (in a separate autocommit transaction) on processor 5xx, transport error, or timeout, then return 503 `processor_unavailable`.
- **Always** retry the processor call exactly once with 200ms backoff on transport error or 5xx. **Never** retry on 4xx.
- **Never** auto-correct card state from the reconciler except for resolving `pending_processor_verification` rows where processor state matches the intended target. All other divergence pages on-call. (MLO-10.)

### Observability
- **Always** emit metrics: action latency, success rate, processor ack latency (`processor.freeze.latency_ms`, `processor.freeze.success`, `processor.freeze.timeout`), notification delivery rate.
- **Always** alert on elevated failure rate and on `card.state.divergence > 0`.
- **Never** include PAN in log lines, metric tags, or trace attributes. **[Domain default]**

---

## 6. Edge-Case Handling Defaults

When in doubt, an agent **must** apply these defaults verbatim — they are the spec's "Edge case resolutions" section.

- **Always** treat an in-flight authorization at the processor as out of scope. A freeze affects *subsequent* authorizations only. **Always** use the literal phrase `"no further transactions"` in cardholder confirmation copy. **Never** attempt to cancel an in-flight auth.
- **Always** issue a compensating `unfreezeCard` when an audit write fails after the processor has already acknowledged the freeze. If compensation succeeds: 5xx `audit_write_failed`, no local state change, no notification. If compensation also fails: write `pending_processor_verification` with `intended_target_state = previous_state`, then 5xx `audit_write_failed`, no notification.
- **Always** transition `frozen → expired` via the nightly expiry job with `initiator = system`, write a single `system_expiry` audit row, and send **zero** notifications from this system.
- **Always** commit state changes even when the notification queue is unavailable. **Always** log `notification_enqueue_failed` and emit a metric. **Never** roll back state due to notification failure.
- **Always** serialize freeze-then-unfreeze sequences via the per-card lock with a 500ms acquisition timeout.
- **Always** dispatch exactly one cardholder notification for N concurrent ops force-freezes. **Always** write N−1 `force_freeze_attempt_noop` audit rows.
- **Never** add system-level logic for recurring/subscription merchant declines on a frozen card — processor handles this.

---

## 7. Self-Check Before Returning Code

Before emitting code, an agent **must** verify, line by line:

1. Does every state-changing endpoint follow the §3 orchestration order, and are audit + state-persist + idempotency-response written in a **single** DB transaction committed only after processor success? On post-processor transaction failure, does the handler run the compensation branch (5a) instead of returning success?
2. Does every domain error have a typed class and a stable string error code?
3. Is the state machine pure (no I/O, no clock, no DB)?
4. Does every audit row include all 9 required fields and use `TokenizedCardId` (never raw PAN)?
5. Are all timestamps UTC ISO-8601?
6. Does every cardholder-facing payload exclude PAN, reason code, and operator identity?
7. Is `Idempotency-Key` honored with the three-rule contract (same body / different body / replay-after-state-change)?
8. Are concurrent writes serialized by the per-card advisory lock with 500ms acquisition timeout?
9. Does the processor call have a 2s hard timeout with exactly-one retry on transport/5xx?
10. Is there a test for every AC bullet and every edge-case row?
11. Is there a PAN-leakage assertion in the test suite?
12. Are all monetary values typed as `Decimal`, never `number`?

If any answer is "no", fix it before returning.
