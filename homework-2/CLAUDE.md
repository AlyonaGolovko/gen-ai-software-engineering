# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this homework is

An **Intelligent Customer Support Ticket Management System** — a Node.js/Express REST API that imports tickets from CSV/JSON/XML, validates and stores them, and auto-classifies category + priority via keyword scoring with a confidence score and audit log. Full requirements live in `TASKS.md`.

## Source-of-truth files (read these first)

- **`TASKS.md`** — assignment spec. Defines endpoints, the canonical Ticket model, enums, validation rules (string lengths, email, enums), test-file inventory with required test counts, and deliverables.
- **`PLAN.md`** — step-by-step implementation plan with checkboxes for Tasks 1–3. **This is the authoritative implementation guide.** When picking up work, find the next unchecked box and continue from there. When finishing a step, tick its box.
- **`TASKS.md`** sections 4 (Documentation) and 5 (Integration & Performance Tests) are scoped *outside* `PLAN.md`; don't conflate them with the planned work.

## Commands

Everything runs from `homework-2/` (this directory). The `package.json` does not exist until Step 1.1 of `PLAN.md` runs `npm init`; until then, none of these work.

```bash
npm install                       # install deps after package.json exists
npm run dev                       # nodemon, hot-reload on src/ changes
npm start                         # node src/server.js (PORT env, default 3000)
npm test                          # Jest, no coverage — fast iteration
npm run test:coverage             # full suite with ≥85% threshold gate
npx jest tests/test_ticket_api.test.js     # single test file
npx jest -t "T7"                           # filter by test name substring
```

The coverage report lands at `coverage/lcov-report/index.html`; the homework deliverable requires a screenshot of it at `docs/screenshots/test_coverage.png`.

## Architecture

The plan in `PLAN.md` lays out a deliberately **layered** structure so each layer can be tested in isolation. The non-obvious bits a future contributor needs to know:

### App vs server split
`src/app.js` exports the **configured Express app without calling `listen`**. `src/server.js` is the only file that binds a port. Supertest in tests imports `app` directly — never start a real server in tests. Keep this separation.

### Repository pattern over an in-memory `Map`
All ticket storage goes through `src/repositories/ticketRepository.js`. Routes never touch the underlying `Map`. This is the seam where a future swap to SQLite/Postgres happens; do not leak storage details (e.g., `Map` methods, raw IDs without UUID validation) into route handlers. Tests rely on `repo.clear()` in a global `afterEach` for isolation — never share state across tests.

### Parsers are pure
`src/parsers/{csv,json,xml}Parser.js` each take a raw `Buffer` and return a normalized **array of plain ticket objects**. They do not see Express, do not write to the repository, do not return HTTP responses. They throw `ParseError` on malformed input. The `POST /tickets/import` route is the only place that orchestrates parser → validator → repository → summary response. This separation is what makes per-row error reporting and the parser unit tests possible.

### Validation is centralized in Joi
Two schemas only — `createTicketSchema` (strict, required fields) and `updateTicketSchema` (all-optional patch). Every entry point (single-create route, bulk-import per-row, manual update) validates against one of these. Do not invent ad-hoc validation in routes. Always call Joi with `abortEarly: false` so all errors surface together.

### Classification is rule-based, not ML
`src/classification/` is keyword scoring:
- Concatenate `subject + description`, lowercase, count keyword hits per category/priority.
- Confidence heuristic: `min(1, hits / 3)`.
- Priority tie-break: **urgent > high > low > medium** (urgent always wins ties — bias toward escalation).
- Default category when no keywords match: `'other'`. Default priority: `'medium'`.
- Every classification — auto-on-create, explicit `/auto-classify` endpoint, or manual override via `PUT` — must call `classificationLog.record(...)` so the audit trail stays complete. The `source` field distinguishes the three.
- Manual override **wins** when both `auto_classify=true` and explicit `category`/`priority` are supplied; the auto suggestion is still logged.

### Errors map centrally to HTTP codes
`src/errors/index.js` defines typed error classes (`ValidationError → 400`, `NotFoundError → 404`, `ParseError → 400`, `UnsupportedMediaTypeError → 415`, `PayloadTooLargeError → 413`). The single error middleware in `app.js` maps them to responses. Routes throw, never `res.status(...).send(...)` directly for error cases.

### Bulk-import response shape is part of the contract
`POST /tickets/import` returns `{ total, successful, failed, successful_ids, errors[] }`. A single bad row never aborts the batch — wrap each row in try/catch and append to the failure list. If **all** rows fail → respond 400 with the same shape; otherwise 200.

## Test layout

`tests/` contains 8 Jest+Supertest files (counts mandated by `TASKS.md`):

| File | Tests | Scope |
|------|-------|-------|
| `test_ticket_api` | 11 | HTTP via Supertest |
| `test_ticket_model` | 9 | Joi schema unit tests |
| `test_import_csv` | 6 | CSV parser + import endpoint |
| `test_import_json` | 5 | JSON parser + import endpoint |
| `test_import_xml` | 5 | XML parser + import endpoint |
| `test_categorization` | 10 | Classifiers + auto-classify endpoint |
| `test_integration` | 5 | End-to-end workflows incl. 20+ concurrent ops |
| `test_performance` | 5 | Latency/throughput budgets |

Fixtures live in `tests/fixtures/` and double as the homework's required sample data (`sample_tickets.{csv,json,xml}` with 50/20/30 records, plus `invalid_tickets.csv` and three `malformed.*` files). The `tests/setup.js` file calls `repo.clear()` after every test — keep it that way.

## Submission expectations specific to this homework

- Coverage screenshot at `docs/screenshots/test_coverage.png` (must show ≥85%).
- `README.md`, `API_REFERENCE.md`, `ARCHITECTURE.md`, `TESTING_GUIDE.md` per Task 4 (with at least 3 Mermaid diagrams across them).
- `HOWTORUN.md` with environment setup and run/test commands (course-wide submission requirement from the root `README.md`).
- Sample data files committed under `tests/fixtures/` (and/or copied to a sample folder per the spec).
