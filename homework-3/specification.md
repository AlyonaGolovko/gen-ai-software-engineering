# Virtual Card Freeze & Unfreeze Specification

> Ingest the information from this file, implement the Low-Level Tasks, and generate the code that will satisfy the High and Mid-Level Objectives.

## High-Level Objective

- Build a cardholder- and ops-facing capability to freeze and unfreeze virtual cards, with real-time propagation to the card processor, immutable audit trail, and cardholder notifications.

## Mid-Level Objectives

- Implement a card state machine that enforces `active ↔ frozen` transitions, rejects transitions from terminal states (`closed`, `expired`, `lost`, `stolen`), and tracks initiator (`cardholder` vs `ops`) so an ops-frozen card cannot be unfrozen by the cardholder.
- Expose authenticated cardholder endpoints for freeze (step-up auth required) and unfreeze (step-up not required) that are idempotent on repeat calls and return a retryable error on processor failure.
- Expose ops endpoints (elevated role) for force-freeze and lift-force-freeze that require a controlled-vocabulary reason code (`suspected_fraud`, `aml_review`, `customer_request_phone`, `chargeback_investigation`, `other`).
- Synchronously propagate every state change to the card processor before user-visible completion; fail closed on timeout; reconcile divergence via a background job.
- Write an immutable, tamper-evident audit record (7-year retention) for every state change before user-visible completion; PAN must never appear in any audit record, log, event, or notification.
- Deliver push + email notifications to the cardholder on every state change; failures do not roll back state but are logged and retried; ops-initiated freezes show a generic message to the cardholder (reason codes stay internal).
- Meet NFRs: freeze API p95 < 300ms, processor ack p99 < 2s, 99.95% monthly availability for the freeze endpoint.

## Implementation Notes

- Data privacy: PCI-DSS scope — PAN never logged, audited, emitted to events, or rendered in notifications. Use the processor's tokenized card identifier everywhere outside the card vault.
- Compliance: SOX/SOC2 — ops actions logged separately from cardholder actions; audit storage append-only and tamper-evident (e.g., WORM or hash-chained log); 7-year retention.
- Auth: cardholder freeze requires step-up (re-auth / biometric / OTP) verified via the existing identity service; ops endpoints require the `card_ops` elevated role asserted in the JWT/session.
- Idempotency: clients send an `Idempotency-Key` header; repeat freeze on an already-frozen card returns 200 with no side effects. Persist idempotency keys for at least 24h.
- Concurrency: serialize state transitions per card via a row-level lock or distributed lock keyed on tokenized card id; resolve concurrent ops force-freezes by first-writer-wins, log subsequent attempts.
- Processor integration: synchronous call with a hard timeout (≤ 2s). On timeout or non-success, do not commit the state change locally; surface a retryable 5xx to the caller. A reconciliation job (every 5 min) compares local card state with processor state and emits alerts on divergence.
- Audit: write audit record before responding to the user; if audit write fails, fail the state change. Audit fields: tokenized card identifier, previous state, new state, initiator type, initiator identity, reason code (nullable for cardholder), timestamp (UTC, ISO-8601), originating system, request id.
- Notifications: enqueue push + email via the existing notification service after state commit; retry with exponential backoff; do not block the API response on delivery. Ops-initiated freezes use a generic cardholder-facing template ("Your card has been temporarily frozen. Please contact support.").
- Observability: emit metrics for action latency, success rate, processor ack latency, notification delivery rate; alert on elevated failure rate or processor-divergence count > 0.
- Error handling: typed errors for `terminal_state`, `cardholder_cannot_unfreeze_ops_freeze`, `processor_unavailable`, `processor_timeout`, `step_up_required`, `forbidden`, `audit_write_failed`. Map to HTTP 4xx/5xx with stable error codes for clients.
- Use decimal-safe types only where money appears (not in this feature directly, but maintain repo convention).
- Testing: unit tests for state machine and authorization rules; integration tests against a processor sandbox; contract tests for the notification and audit clients; load test the freeze endpoint to validate p95/p99.

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
- Acceptance-criteria coverage, one test per bullet from the ticket's Acceptance Criteria section.
- Edge cases (one test each): freeze during in-flight authorization; cardholder unfreeze on ops-frozen card; concurrent app + ops requests; transition from terminal state; recurring merchant auth on frozen card; processor unreachable; audit write failure after processor ack; notification provider down on ops freeze; rapid freeze-then-unfreeze before first ack; concurrent ops force-freezes; expiry while frozen.
- Security tests: PAN never appears in any captured log, audit row, event, or notification payload (assert by scanning all sinks for the PAN string in fixtures).
- Load test: 500 RPS sustained on `freeze` against a processor sandbox; assert p95 < 300ms, p99 processor ack < 2s, error rate < 0.05%.
