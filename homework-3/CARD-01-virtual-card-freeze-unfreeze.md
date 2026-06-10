# [CARD-01] Virtual Card Freeze & Unfreeze

| Field            | Value                                       |
| ---------------- | ------------------------------------------- |
| **Type**         | Story                                       |
| **Priority**     | High                                        |
| **Status**       | Ready for Development                       |
| **Reporter**     | Product — Cards Team                        |
| **Sprint**       | TBD                                         |
| **Story Points** | 8                                           |
| **Labels**       | `cards`, `self-service`, `fraud-controls`   |
| **Components**   | Card Management, Notifications, Audit       |
| **Epic Link**    | CARD-200 — Cardholder Self-Service Controls |

---

## Summary

Allow cardholders to instantly freeze and unfreeze their virtual cards from the app. Allow fraud operations to force-freeze a card when suspicious activity is detected. All state changes propagate to the card processor in near real-time, are fully audited, and trigger notifications to the cardholder.

---

## Background

Cardholders currently have no way to temporarily disable a card — they must call support and close/reissue it. This is poor UX for common cases (card misplaced, recurring merchant needs pausing, suspicious activity) and drives unnecessary reissuance cost. Separately, fraud ops needs the ability to immediately disable a card when monitoring flags high-risk activity, before reaching the cardholder.

---

## Scope

**In scope:** freeze and unfreeze of virtual cards by cardholders and by ops; state propagation to processor; audit; notifications.

**Out of scope:** card issuance, replacement, closure, dispute intake, limit changes, transaction-level controls (merchant/MCC/geo blocking), physical cards.

---

## User Stories

**Cardholder**

- Freeze my card in one tap and trust no further transactions will be approved
- Unfreeze my card when I'm ready to use it again
- Be notified whenever my card's state changes, including if the bank freezes it

**Fraud analyst**

- Force-freeze any card immediately when monitoring flags it
- Trust that the cardholder cannot undo my force-freeze
- Have a complete record of who froze what, when, and why

**Compliance**

- Every state change preserved in an immutable audit log
- Full state history of any card retrievable on demand

---

## Functional Requirements

### State model

- Card statuses: `active`, `frozen`, `closed`, `expired`, `lost`, `stolen`
- Allowed transitions: `active ↔ frozen`
- Terminal states (`closed`, `expired`, `lost`, `stolen`) cannot be frozen or unfrozen
- A freeze records its initiator: `cardholder` or `ops`
- A card frozen by `ops` cannot be unfrozen by the cardholder; only ops can lift it

### Cardholder actions

- Freeze and unfreeze are available from the app to authenticated cardholders
- Freeze requires step-up authentication; unfreeze does not
- Repeated freeze requests on an already-frozen card succeed with no side effects (idempotent)
- Unfreeze on an ops-frozen card is rejected with a clear message ("Please contact support")

### Ops actions

- Force-freeze and lift-force-freeze require elevated role
- Both require a reason code from a controlled vocabulary: `suspected_fraud`, `aml_review`, `customer_request_phone`, `chargeback_investigation`, `other`

### Processor propagation

- Every state change is propagated to the card processor before the action is considered complete
- On propagation failure: action fails, system state remains aligned with processor state, user sees a retryable error
- On processor ack timeout: fail closed (treat as not frozen), surface clear error, reconciliation job reconciles any divergence

### Notifications

- Cardholder receives push + email on every state change to their card
- Ops-initiated freezes show a generic message to the cardholder; reason codes are internal only
- Notification delivery failure does not roll back the state change; failures are logged and retried

### Audit

- Every state change writes an immutable audit record before user-visible completion
- Audit record contains: tokenized card identifier, previous state, new state, initiator type, initiator identity, reason code (if applicable), timestamp, originating system, request ID
- Audit write failure fails the state change
- PAN must never appear in any audit record, log, event, or notification — tokenized references only

---

## Non-Functional Requirements

- **Latency:** freeze API response p95 under 300ms; processor acknowledgment p99 under 2 seconds (freeze must beat typical merchant authorization clearance time)
- **Availability:** tier-1 — 99.95% monthly for the freeze endpoint
- **Audit retention:** 7 years, append-only, tamper-evident storage
- **Security:** step-up auth on freeze; elevated role on ops actions; ops actions logged separately for SOX/SOC2; PAN tokenization enforced everywhere
- **Observability:** per-action metrics for latency, success rate, processor ack latency, notification delivery; alerts on elevated failure rate or state divergence with processor

---

## Edge Cases

- Freeze requested while an authorization is in flight at the processor
- Cardholder requests unfreeze on an ops-frozen card
- Concurrent freeze requests from app and ops console
- Freeze requested on a card in a terminal state
- Recurring/subscription merchant attempts authorization on a frozen card
- Processor unreachable at the moment of the request
- Audit write fails after processor has already acknowledged
- Notification provider down during ops-initiated freeze
- Cardholder freezes then immediately attempts unfreeze before first ack arrives
- Multiple ops analysts force-freeze the same card simultaneously
- Card expires while in `frozen` state

---

## Acceptance Criteria

- Cardholder can freeze their card from the app and receive confirmation that no further authorizations will be approved
- Cardholder can unfreeze a card they froze themselves
- Cardholder cannot unfreeze a card that was force-frozen by ops
- Ops user with the correct role can force-freeze any card with a mandatory reason code
- Every state change is durably recorded in the audit log before user-visible confirmation
- Cardholder receives a push + email notification for every state change on their card
- Repeated freeze on an already-frozen card succeeds without side effects
- A freeze that fails to propagate to the processor returns a retryable error and leaves no divergent state
- PAN does not appear in any log, audit record, event, or notification
