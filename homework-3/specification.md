# Virtual Card Freeze & Unfreeze Specification

> Ingest the information from this file, implement the Low-Level Tasks, and generate the code that will satisfy the High and Mid-Level Objectives.

## High-Level Objective

- Build a cardholder- and ops-facing capability to freeze and unfreeze virtual cards, with real-time propagation to the card processor, immutable audit trail, and cardholder notifications.

## Mid-Level Objectives

Each objective is testable and traces to the ticket's Acceptance Criteria (AC) or Non-Functional Requirements (NFR) sections.

- **MLO-1 (State machine):** State machine rejects 100% of attempted transitions out of `closed`, `expired`, `lost`, `stolen`, and rejects 100% of cardholder unfreeze requests where `last_freeze_initiator='ops'`. Traces to AC: "Cardholder cannot unfreeze a card that was force-frozen by ops"; Edge cases: terminal-state freeze, cardholder unfreeze on ops-frozen card.
- **MLO-2 (Cardholder endpoints):** `POST /v1/cards/{id}/freeze` and `/unfreeze` accept authenticated cardholder requests; freeze additionally requires a step-up token issued within the last 5 minutes; repeat calls with the same `Idempotency-Key` return the original response byte-for-byte. Traces to AC: cardholder freeze/unfreeze, idempotent repeat-freeze.
- **MLO-3 (Ops endpoints):** Ops endpoints require role `card_ops` and reject any request whose `reason_code` is not in `{suspected_fraud, aml_review, customer_request_phone, chargeback_investigation, other}`. Traces to AC: "Ops user with the correct role can force-freeze any card with a mandatory reason code".
- **MLO-4 (Processor propagation):** No local state change is committed unless the processor returns success within 2s; on failure the API returns a retryable 5xx and no local divergence is introduced. Traces to AC: "A freeze that fails to propagate to the processor returns a retryable error and leaves no divergent state".
- **MLO-5 (Audit):** Every state change writes one audit row before the API responds; audit-write failure fails the API call; audit rows are append-only with 7-year retention; no PAN appears in any audit row. Traces to AC: "Every state change is durably recorded in the audit log before user-visible confirmation"; "PAN does not appear in any log, audit record, event, or notification".
- **MLO-6 (Notifications):** Cardholder receives push + email on every state change; notification failure never rolls back state; ops-initiated freezes use the generic cardholder template (no reason code, no operator identity). Traces to AC: "Cardholder receives a push + email notification for every state change on their card".
- **MLO-7 (Latency — freeze p95):** `POST /v1/cards/{id}/freeze` p95 latency ≤ 300ms, measured at the load balancer over a rolling 5-minute window at ≥ 100 RPS sustained load. Traces to NFR §Latency.
- **MLO-8 (Latency — processor p99):** Processor acknowledgment latency p99 ≤ 2s, measured from outbound request emission to ack receipt at the processor client. Traces to NFR §Latency.
- **MLO-9 (Availability):** 99.95% monthly availability for `POST /v1/cards/{id}/freeze`, measured as `(2xx + idempotent-replay responses) / (total requests − 4xx)` over a calendar month. Traces to NFR §Availability.
- **MLO-10 (Reconciliation):** A `pending_processor_verification` row is auto-resolved by the reconciler within 15 minutes when processor state matches the intended target; unexplained divergence (any other mismatch) pages on-call within 5 minutes of detection. Traces to NFR §Observability and to the processor-propagation/audit-failure edge cases.

## Implementation Notes

- Data privacy: PCI-DSS scope — PAN never logged, audited, emitted to events, or rendered in notifications. Use the processor's tokenized card identifier everywhere outside the card vault.
- Compliance: SOX/SOC2 — ops actions logged separately from cardholder actions; audit storage append-only and tamper-evident (e.g., WORM or hash-chained log); 7-year retention.
- Auth: cardholder freeze requires step-up (re-auth / biometric / OTP) verified via the existing identity service; ops endpoints require the `card_ops` elevated role asserted in the JWT/session.
- Concurrency (MLO-1, MLO-3): serialize state transitions per card via a Postgres advisory lock keyed on `hashtext(tokenized_card_id)`, acquired with `pg_try_advisory_xact_lock`. Acquisition timeout 500ms; on timeout return HTTP 503 with error code `concurrent_request_in_progress` (retryable). Concurrent ops force-freezes resolve as first-writer-wins; losing writers observe the new state inside the lock and return 200 `unchanged: true`, and still write an audit row of type `force_freeze_attempt_noop` recording the attempted action.
- Idempotency (MLO-2): clients send `Idempotency-Key`; scope is `(card_id, key)` with 24h TTL persisted in a dedicated `idempotency_responses` table. (a) Reuse with the same canonical request body returns the original response byte-for-byte (status, body, error code). (b) Reuse with a different body returns HTTP 422 `idempotency_key_conflict`. (c) Keys are not invalidated by subsequent state changes — a replay after the card has moved on still returns the original cached response, never the current state. The cached response is what the client gets even if the underlying card has since been frozen and unfrozen.
- Processor integration (MLO-4, MLO-10): synchronous call with a 2s hard timeout. On success: commit local state + audit in the same DB transaction. On 4xx from processor: do not commit, return 4xx to caller. On 5xx, transport error, or timeout: roll back the local transaction AND write a `pending_processor_verification` row in a separate autocommit transaction containing `(tokenized_card_id, intended_target_state, initiator, request_id, created_at)`; return HTTP 503 `processor_unavailable` (retryable) to the caller. The reconciler is the sole mechanism that closes these rows — see MLO-10.
- Audit: write audit record before responding to the user; if audit write fails, fail the state change. Audit fields: tokenized card identifier, previous state, new state, initiator type, initiator identity, reason code (nullable for cardholder), timestamp (UTC, ISO-8601), originating system, request id.
- Notifications: enqueue push + email via the existing notification service after state commit; retry with exponential backoff; do not block the API response on delivery. Ops-initiated freezes use a generic cardholder-facing template ("Your card has been temporarily frozen. Please contact support.").
- Observability: emit metrics for action latency, success rate, processor ack latency, notification delivery rate; alert on elevated failure rate or processor-divergence count > 0.
- Error handling: typed errors for `terminal_state`, `cardholder_cannot_unfreeze_ops_freeze`, `processor_unavailable`, `processor_timeout`, `step_up_required`, `forbidden`, `audit_write_failed`. Map to HTTP 4xx/5xx with stable error codes for clients.
- Use decimal-safe types only where money appears (not in this feature directly, but maintain repo convention).
- Testing: unit tests for state machine and authorization rules; integration tests against a processor sandbox; contract tests for the notification and audit clients; load test the freeze endpoint to validate p95/p99.

### Edge case resolutions (defined behavior, not open questions)

Each row defines: trigger → expected post-state → user response → audit rows → notifications. Tests in Task 8 assert these exactly.

- **In-flight authorization at processor when freeze arrives:** out of scope for this feature. The freeze takes effect for *subsequent* authorization requests only; the in-flight auth completes per processor policy. Cardholder confirmation copy must say "no further transactions will be approved" — *further* is load-bearing wording. (MLO-4)
- **Audit write fails after processor has already acknowledged the freeze:** issue a compensating `unfreezeCard` to the processor. If compensation succeeds: return HTTP 5xx `audit_write_failed`, no local state change, no notification. If compensation also fails: write a `pending_processor_verification` row with `intended_target_state=previous_state`, return HTTP 5xx `audit_write_failed`, no notification — the reconciler closes the loop. (MLO-5, MLO-10)
- **Card expires while in `frozen` state:** nightly expiry job transitions `frozen → expired` with `initiator=system`, writes one audit row of type `system_expiry`, sends no cardholder notification (expiry is communicated through the separate expiry-reminder channel and is out of scope here).
- **Notification provider down during any state change:** state change commits successfully; the notification dispatch enqueues to the notification service's durable queue and that service handles retry. If the queue itself is unavailable, log `notification_enqueue_failed` and emit a metric — do not roll back state. (MLO-6)
- **Rapid freeze-then-unfreeze before first processor ack:** the first request holds the per-card lock until it completes (success or rolled back). The second request blocks on the lock for up to 500ms, then either proceeds against the post-first-request state or returns 503 `concurrent_request_in_progress`.
- **Concurrent ops force-freezes:** first writer wins (already-frozen card just records `force_freeze_attempt_noop`); the cardholder receives exactly one generic notification (from the first winning write), not one per attempt.
- **Recurring/subscription merchant authorization on a frozen card:** processor declines per its own policy; this system does not need to do anything special. Out of scope for testing in this codebase.

## Context

### Beginning context

- Existing card service with read-only card lookup and the `cards` table containing `card_id`, `tokenized_pan`, `status`, `expires_at`.
- Existing identity service supporting step-up authentication and role-based claims (`card_ops`).
- Existing card processor client SDK with `getCardState(token)` only — no state-mutation methods yet.
- Existing notification service supporting push and email templates.
- Existing audit log service with append-only, tamper-evident storage.
- No existing endpoints for freeze/unfreeze; no audit records for card state changes; no reconciliation job.

### Ending context

- Card state machine module enforcing transitions and initiator rules.
- Cardholder freeze/unfreeze API endpoints with step-up enforcement and idempotency.
- Ops force-freeze / lift-force-freeze API endpoints with role and reason-code enforcement.
- Processor client extended with `freezeCard` / `unfreezeCard` calls, timeout, and retry semantics.
- Audit log entries for every state change, queryable by card token.
- Notification dispatch hooks invoked on every state change.
- Reconciliation job comparing local vs processor card state, with alerting on divergence.
- Dashboards and alerts for latency, success rate, processor ack latency, divergence.
- Complete test suite (unit, integration, contract, load) and OpenAPI documentation for the new endpoints.

## Low-Level Tasks

### 1. Card state machine and authorization rules

What prompt would you run to complete this task?
Implement a `CardStateMachine` that enforces the allowed `active ↔ frozen` transitions, blocks transitions from terminal states (`closed`, `expired`, `lost`, `stolen`), records the initiator type (`cardholder` or `ops`) on every freeze, and rejects cardholder-initiated unfreeze when the current freeze was initiated by ops. Return typed domain errors rather than throwing strings.

What file do you want to CREATE or UPDATE?
`src/cards/state_machine.py` (CREATE), `src/cards/errors.py` (CREATE)

What function do you want to CREATE or UPDATE?
`CardStateMachine.transition(card, target_state, initiator)`, `CardStateMachine.can_unfreeze(card, initiator)`

What are details you want to add to drive the code changes?
- Inputs: current card record (status, last_freeze_initiator), target state (`frozen` or `active`), initiator (`cardholder` with user id, or `ops` with operator id and reason code).
- Validate: terminal states reject all transitions; cardholder cannot unfreeze a card whose `last_freeze_initiator == 'ops'`; ops reason code must be in the controlled vocabulary; idempotent no-op when target state equals current state.
- Output: a `TransitionResult` containing the new card record (not yet persisted) and the audit fields, or a typed error (`TerminalStateError`, `CardholderCannotUnfreezeOpsFreezeError`, `InvalidReasonCodeError`).
- Pure function — no I/O. State persistence and processor calls happen in the orchestrator layer.

### 2. Processor client integration

What prompt would you run to complete this task?
Extend the existing card processor client with `freezeCard(token, request_id)` and `unfreezeCard(token, request_id)` methods. Calls must be synchronous with a 2-second hard timeout, retry once on transport error (not on 4xx), and surface a distinct `ProcessorTimeoutError` vs `ProcessorRejectedError` to the caller. Never log the PAN; log only the tokenized identifier and request id.

What file do you want to CREATE or UPDATE?
`src/cards/processor_client.py` (UPDATE)

What function do you want to CREATE or UPDATE?
`ProcessorClient.freeze_card`, `ProcessorClient.unfreeze_card`

What are details you want to add to drive the code changes?
- Use the tokenized card identifier; reject calls that receive a raw PAN.
- Emit metrics: `processor.freeze.latency_ms`, `processor.freeze.success`, `processor.freeze.timeout`.
- On 5xx or transport error: retry once with 200ms backoff, then raise `ProcessorTimeoutError`.
- On 4xx: do not retry, raise `ProcessorRejectedError` carrying the processor error code.
- Caller is responsible for not committing local state until this returns success.

### 3. Audit log writer for card state changes

What prompt would you run to complete this task?
Implement an audit writer that records every card state change with the exact fields required for compliance, before the API responds to the user. If the audit write fails, the state change must fail and the caller must roll back. Storage must be append-only and tamper-evident; reuse the existing audit service.

What file do you want to CREATE or UPDATE?
`src/cards/audit.py` (CREATE)

What function do you want to CREATE or UPDATE?
`CardAuditWriter.record_state_change(event)`

What are details you want to add to drive the code changes?
- Fields: tokenized card identifier, previous state, new state, initiator type, initiator identity, reason code (nullable), timestamp (UTC ISO-8601), originating system, request id.
- PAN field must be explicitly rejected at the type boundary — `record_state_change` takes a `TokenizedCardId`, not a raw string.
- Raise `AuditWriteError` on failure; the orchestrator translates this into a 5xx and does not commit state.
- Retention is 7 years; tamper-evident storage is delegated to the audit service.

### 4. Cardholder freeze/unfreeze API endpoints

What prompt would you run to complete this task?
Create authenticated cardholder endpoints `POST /v1/cards/{card_id}/freeze` and `POST /v1/cards/{card_id}/unfreeze`. Freeze requires step-up authentication (verified via the identity service); unfreeze does not. Both endpoints are idempotent via the `Idempotency-Key` header. Reject unfreeze when the card was force-frozen by ops with HTTP 409 and a `cardholder_cannot_unfreeze_ops_freeze` error code.

What file do you want to CREATE or UPDATE?
`src/cards/api/cardholder_routes.py` (CREATE)

What function do you want to CREATE or UPDATE?
`freeze_card_cardholder`, `unfreeze_card_cardholder`

What are details you want to add to drive the code changes?
- Auth: caller must own the card; freeze additionally verifies a fresh step-up token (max age 5 minutes).
- Orchestration order per request: (1) acquire per-card lock, (2) load card, (3) run state machine, (4) call processor, (5) write audit, (6) persist new state, (7) enqueue notification, (8) release lock, (9) respond.
- If processor call fails: do not persist, do not audit-as-success; return 503 with `processor_unavailable` and a retryable flag.
- Idempotent repeat on same state: return 200 with `unchanged: true`, do not re-call processor, do not re-audit, do not re-notify.
- p95 < 300ms — enforce a 1s server-side deadline and emit a deadline-exceeded metric.

### 5. Ops force-freeze API endpoints

What prompt would you run to complete this task?
Create ops-only endpoints `POST /v1/ops/cards/{card_id}/force-freeze` and `POST /v1/ops/cards/{card_id}/lift-force-freeze` requiring the `card_ops` role and a `reason_code` from the controlled vocabulary. A card frozen by ops cannot be unfrozen by the cardholder; only an ops `lift-force-freeze` clears it. Log ops actions to the separate SOX/SOC2 audit stream in addition to the standard card audit.

What file do you want to CREATE or UPDATE?
`src/cards/api/ops_routes.py` (CREATE)

What function do you want to CREATE or UPDATE?
`force_freeze_card_ops`, `lift_force_freeze_card_ops`

What are details you want to add to drive the code changes?
- Auth: JWT must carry `role=card_ops`; otherwise 403.
- Body: `{ "reason_code": "<one of suspected_fraud|aml_review|customer_request_phone|chargeback_investigation|other>", "notes": "<optional free text, max 500 chars>" }`.
- Concurrent force-freeze requests resolve as first-writer-wins; subsequent calls return 200 with `unchanged: true` and still write an audit row referencing the attempt.
- Cardholder-facing notification uses the generic template; reason codes and notes never leave the internal audit stream.

### 6. Notification dispatch on state change

What prompt would you run to complete this task?
After a state change is committed, enqueue a push + email notification to the cardholder. Delivery failures must not roll back the state change; they must be logged and retried by the notification service. Ops-initiated freezes use a generic message ("Your card has been temporarily frozen. Please contact support."); cardholder-initiated changes use the standard self-service template.

What file do you want to CREATE or UPDATE?
`src/cards/notifications.py` (CREATE)

What function do you want to CREATE or UPDATE?
`CardStateChangeNotifier.dispatch(event)`

What are details you want to add to drive the code changes?
- Templates: `card_frozen_by_cardholder`, `card_unfrozen_by_cardholder`, `card_frozen_by_ops_generic`, `card_unfrozen_by_ops_generic`.
- Payload never includes PAN, reason code, or operator identity — only last-4 of the tokenized card and the new state.
- Enqueue is asynchronous (best-effort fire-and-forget into the notification service queue); emit `notifications.card_state_change.enqueued` metric.

### 7. Processor reconciliation job

What prompt would you run to complete this task?
Implement a background reconciliation job that runs every 5 minutes, compares local card state with processor card state for cards modified in the last 15 minutes, and emits an alert plus an audit-log entry when they diverge. The job must not auto-correct state — it surfaces divergence for human review.

What file do you want to CREATE or UPDATE?
`src/cards/reconciliation.py` (CREATE)

What function do you want to CREATE or UPDATE?
`reconcile_card_states()`

What are details you want to add to drive the code changes?
- Query recently modified cards from the local store; for each, call `ProcessorClient.get_card_state`.
- On mismatch: emit `card.state.divergence` metric (tagged with the two states), write an audit entry of type `state_divergence_detected`, and page the on-call channel via the alert service.
- Bound the per-card processor call to 1 second; skip and re-queue if it times out, do not block the run.

### 8. Test suite

What prompt would you run to complete this task?
Create a comprehensive test suite covering the state machine, cardholder and ops endpoints, processor failure modes, audit-write failure, notification dispatch, idempotency, concurrency, and reconciliation. Include load tests validating the freeze endpoint at p95 < 300ms and p99 processor ack < 2s.

What file do you want to CREATE or UPDATE?
`tests/cards/test_state_machine.py`, `tests/cards/test_cardholder_routes.py`, `tests/cards/test_ops_routes.py`, `tests/cards/test_processor_client.py`, `tests/cards/test_reconciliation.py`, `tests/cards/test_load_freeze.py`

What function do you want to CREATE or UPDATE?
Pytest test functions covering each acceptance criterion and edge case.

What are details you want to add to drive the code changes?
- **Acceptance-criteria coverage** (one test per AC bullet, each tagged with the AC text it covers, traced to MLO-1 through MLO-6).
- **Edge case tests** — assert the *exact* behavior defined in the "Edge case resolutions" subsection of Functional Requirements. One test per row:
  - In-flight auth + concurrent freeze: assert response copy contains "no further transactions" and that the system does not attempt to cancel the in-flight auth.
  - Audit write fails after processor ack — compensation succeeds: assert processor received `unfreezeCard`, no local state change, no notification, 5xx `audit_write_failed`.
  - Audit write fails after processor ack — compensation also fails: assert `pending_processor_verification` row exists with `intended_target_state=previous_state`, 5xx `audit_write_failed`.
  - Expiry while frozen: assert nightly job emits exactly one `system_expiry` audit row and zero notifications.
  - Notification queue unavailable: assert state still commits, `notification_enqueue_failed` metric emitted, no rollback.
  - Rapid freeze-then-unfreeze: assert second request either sees post-first state or gets 503 `concurrent_request_in_progress` within 500ms.
  - Concurrent ops force-freezes: assert exactly one notification dispatched and N-1 `force_freeze_attempt_noop` audit rows for N concurrent attempts.
  - Idempotency replay with same body: assert byte-for-byte identical response.
  - Idempotency replay with different body: assert 422 `idempotency_key_conflict`.
  - Idempotency replay after state moved on: assert original cached response returned, not current state.
- **Security tests** (MLO-5): PAN never appears in any captured log, audit row, event, or notification payload — assert by scanning all sinks for the literal PAN string seeded in fixtures.
- **Load test** (MLO-7, MLO-8, MLO-9): 500 RPS sustained for 10 minutes on `freeze` against a processor sandbox; assert p95 < 300ms (MLO-7), p99 processor ack < 2s (MLO-8), success rate ≥ 99.95% measured per MLO-9 formula.
