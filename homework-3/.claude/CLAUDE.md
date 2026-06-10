# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Scope

Virtual card freeze/unfreeze feature for a regulated fintech. Authoritative policy: `agents.md`. Functional spec: `specification.md`. When this file and `agents.md` conflict, `agents.md` wins. Anything needing more than one line of rationale belongs in `agents.md`, not here.

## Stack & Layout

- TypeScript strict (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`); Node LTS; ESM only.
- Source under `src/cards/` (camelCase filenames). Tests mirror under `tests/cards/*.test.ts`.
- Money: always `Decimal` (decimal.js/bignumber.js). Never `number`.

## Endpoint surface (exact)

- `POST /v1/cards/{card_id}/freeze`
- `POST /v1/cards/{card_id}/unfreeze`
- `POST /v1/ops/cards/{card_id}/force-freeze`
- `POST /v1/ops/cards/{card_id}/lift-force-freeze`

Never add routes outside this set without an explicit MLO reference.

## PAN handling — non-negotiable

- Never log, audit, emit, render, or return raw PAN. Use `TokenizedCardId` (branded type) outside the vault.
- Processor client must reject inputs that look like a PAN (13–19 digits).
- Notifications carry only last-4 of tokenized card + new state. Never reason code, never operator identity.

## Authorization

- Cardholder endpoints: verify ownership. Cardholder **freeze** requires step-up token ≤ 5 minutes; cardholder **unfreeze** does not.
- Ops endpoints: require `role === 'card_ops'`; else 403 `forbidden`.
- Never trust client-supplied `initiator` — derive from authenticated principal.
- Cardholder cannot unfreeze a card whose `last_freeze_initiator === 'ops'` → 409 `cardholder_cannot_unfreeze_ops_freeze`.
- Ops `reason_code` ∈ `{suspected_fraud, aml_review, customer_request_phone, chargeback_investigation, other}`. Ops `notes` ≤ 500 chars.

## Idempotency

- Require `Idempotency-Key` on side-effecting POSTs. Persist `(card_id, key) → response` 24h.
- Same body → byte-identical cached response. Different body → 422 `idempotency_key_conflict`. Replay after state change → still return cached response.

## State machine

- States: `active | frozen | closed | expired | lost | stolen`. Only `active ↔ frozen` is allowed; the rest are terminal.
- Must be pure: no I/O, no clock, no DB. Inject `now()` and dependencies.
- Freeze on already-frozen card → 200 `unchanged: true`; do not call processor, audit, or notify.
- Record `last_freeze_initiator` on every freeze.

## Handler orchestration (every state-changing endpoint)

1. Acquire per-card Postgres advisory lock (`pg_try_advisory_xact_lock` on `hashtext(tokenized_card_id)`); 500ms timeout → 503 `concurrent_request_in_progress`.
2. Load card; short-circuit on cached idempotency response.
3. Run state machine (pure).
4. Call processor: 2s hard timeout, exactly one retry on transport/5xx, never on 4xx.
5. Single DB transaction: audit row + new state + idempotency response. Commit only after processor success.
   - 5a. If this txn fails post-processor-ack: issue compensating `unfreezeCard`/`freezeCard`. Compensation OK → 5xx `audit_write_failed`, no state change, no notification. Compensation fails → write `pending_processor_verification` (autocommit) with `intended_target_state = previous_state` → 5xx `audit_write_failed`, no notification.
6. Enqueue notification best-effort; never roll back state on notification failure (log `notification_enqueue_failed`).
7. Release lock; respond.

Never hold the advisory lock past the 2s processor timeout.

## Errors (stable client contract — never rename)

Typed classes extending `DomainError`; never throw plain `Error`. Codes: `terminal_state`, `cardholder_cannot_unfreeze_ops_freeze`, `processor_unavailable`, `processor_timeout`, `step_up_required`, `forbidden`, `audit_write_failed`, `concurrent_request_in_progress`, `idempotency_key_conflict`.

## Audit

- Append-only, 7-year retention. Never mutate or delete.
- Fields (exact 9): tokenized card id, previous state, new state, initiator type, initiator identity, reason code (nullable), UTC ISO-8601 timestamp, originating system, request id.
- Ops actions write to the SOX/SOC2 stream **in addition to** the standard card audit stream.
- All timestamps UTC ISO-8601. Never local time, never epoch millis.

## Cardholder copy

- Ops-initiated freeze message: `"Your card has been temporarily frozen. Please contact support."`
- In-flight auth scenario: use the literal phrase `"no further transactions"`. Never attempt to cancel an in-flight authorization.

## Reconciliation

- Reconciler may only resolve `pending_processor_verification` rows where processor state matches intended target. Any other divergence → page on-call.
- `frozen → expired` happens via nightly job, `initiator = system`, one `system_expiry` audit row, **zero** notifications.

## Testing

- Test runner: Jest (or one consistent choice). One test per AC bullet (tag MLO ID in name); one test per edge-case row in `specification.md`.
- Stub processor at the network boundary. Never mock the state machine — exercise it directly.
- Integration (not mocks) for: audit writer ↔ audit service, idempotency store ↔ DB, advisory lock behavior.
- Required: PAN-leakage test (seed PAN literal; assert absent from all logs/audit/events/notifications).
- Required: load test for MLO-7/8/9 (freeze p95 ≤ 300ms, processor ack p99 ≤ 2s, success ≥ 99.95%) at 500 RPS / 10 min.

## Self-check before returning code

Run §7 of `agents.md` line by line. If any answer is "no", fix before returning.
