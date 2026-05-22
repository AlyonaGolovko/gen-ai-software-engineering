# Implementation Plan — Intelligent Customer Support System

**Stack:** Node.js + Express
**Storage:** In-memory store (`Map<id, Ticket>`) — sufficient for the homework scope; can be swapped for SQLite/Postgres without changing route handlers if access is encapsulated in a repository module.
**Validation:** Joi (mature, expressive, ergonomic for nested schemas).
**File parsing:** `csv-parse` (CSV), `xml2js` (XML), built-in `JSON.parse` (JSON).
**File upload:** `multer` with in-memory storage (no disk writes during parse).
**IDs:** `uuid` (v4).
**Testing:** Jest + Supertest, with Jest coverage thresholds enforced ≥85%.

---

## Task 1 — Multi-Format Ticket Import API

### Step 1.1 — Bootstrap the Node.js project and install dependencies

- [x] Run `npm init -y` from `src/` (or repo root, depending on chosen layout) to generate `package.json`.
- [x] Install runtime dependencies: `express`, `multer`, `csv-parse`, `xml2js`, `uuid`, `joi`, `cors`, `helmet`, `morgan`.
- [x] Install dev dependencies: `jest`, `supertest`, `nodemon`, `cross-env`.
- [x] Add `npm` scripts:
  - `"start": "node src/server.js"`
  - `"dev": "nodemon src/server.js"`
  - `"test": "jest"`
  - `"test:coverage": "jest --coverage"`
- [x] Set `"type": "commonjs"` (or `"module"` if you prefer ESM — be consistent everywhere).
- [x] Add `.gitignore` with `node_modules/`, `coverage/`, `.env`. _(root `.gitignore` already covers these — no per-homework file added per CLAUDE.md guidance)_

### Step 1.2 — Define the canonical Ticket model and validation schema

This is the single source of truth used by every endpoint, every parser, and every test.

- [x] Define enum constants in one module (e.g., `src/models/enums.js`):
  - `CATEGORIES = ['account_access', 'technical_issue', 'billing_question', 'feature_request', 'bug_report', 'other']`
  - `PRIORITIES = ['urgent', 'high', 'medium', 'low']`
  - `STATUSES = ['new', 'in_progress', 'waiting_customer', 'resolved', 'closed']`
  - `SOURCES = ['web_form', 'email', 'api', 'chat', 'phone']`
  - `DEVICE_TYPES = ['desktop', 'mobile', 'tablet']`
- [x] Build a Joi schema (`src/models/ticketSchema.js`) with two variants:
  - `createTicketSchema` — all client-supplied fields with required/optional rules:
    - `customer_id`: required string, non-empty.
    - `customer_email`: required, `Joi.string().email()`.
    - `customer_name`: required string, 1–100 chars.
    - `subject`: required string, 1–200 chars.
    - `description`: required string, 10–2000 chars.
    - `category`: optional, must be in `CATEGORIES`.
    - `priority`: optional, must be in `PRIORITIES`.
    - `status`: optional, must be in `STATUSES`, default `'new'`.
    - `assigned_to`: optional string, nullable.
    - `tags`: optional array of strings, default `[]`.
    - `metadata`: optional object with `source` (in `SOURCES`), `browser` (string), `device_type` (in `DEVICE_TYPES`).
  - `updateTicketSchema` — same fields but **all optional**, plus `resolved_at` (date, nullable). Disallow updating `id`, `created_at`.
- [x] Export a helper `validate(payload, schema)` that returns `{ value, error }` with `abortEarly: false` so all errors surface at once.

### Step 1.3 — Implement the in-memory ticket repository

Encapsulate all storage operations behind a tiny module so route handlers never touch the Map directly.

- [x] Create `src/repositories/ticketRepository.js` exporting a singleton with methods:
  - `create(ticketData)` → assigns `id` (UUID v4), `created_at`, `updated_at` (ISO strings), persists, returns the ticket.
  - `findAll(filters = {})` → applies filters by `category`, `priority`, `status`, `customer_id`, `source` (from `metadata.source`); supports `limit`/`offset` for pagination.
  - `findById(id)` → returns ticket or `null`.
  - `update(id, patch)` → merges `patch`, updates `updated_at`; if status transitions to `'resolved'`, sets `resolved_at = now`; returns updated ticket or `null` if not found.
  - `delete(id)` → returns boolean.
  - `clear()` → wipes the store (used by tests).
- [x] Internal storage: `const store = new Map()` keyed by ticket `id`.

### Step 1.4 — Wire up the Express application skeleton

- [x] Create `src/app.js` exporting a configured Express app (no `listen` call here — keeps it test-friendly).
  - Middleware order: `helmet()`, `cors()`, `morgan('dev')` (skip when `NODE_ENV === 'test'`), `express.json({ limit: '10mb' })`.
  - Mount routers: `app.use('/tickets', ticketsRouter)`.
  - 404 fallthrough handler returning `{ error: 'Not Found' }` with status 404.
  - Centralized error middleware (see Step 1.11).
- [x] Create `src/server.js` that imports `app`, reads `PORT` from env (default 3000), and calls `app.listen`.

### Step 1.5 — Implement `POST /tickets` (create a single ticket)

- [x] Add route in `src/routes/tickets.js`.
- [x] Validate `req.body` against `createTicketSchema`. On error → respond 400 with `{ error: 'Validation failed', details: error.details.map(d => d.message) }`.
- [x] Apply server-side defaults: `status = 'new'`, `priority = 'medium'` (if not provided **and** `auto_classify` is false), `tags = []`, `resolved_at = null`, `assigned_to = null`.
- [x] Read query flag `?auto_classify=true` (Task 2 hook): if set, call the classifier (Task 2) and merge results before persisting; manual `category`/`priority` in body wins over classifier output. _(flag is read and gates the priority default; classifier integration deferred to Step 2.8)_
- [x] Call `repo.create(payload)`.
- [x] Respond `201 Created` with the full ticket as JSON; include `Location: /tickets/:id` header.

### Step 1.6 — Implement `GET /tickets` (list with filtering and pagination)

- [x] Accept query params: `category`, `priority`, `status`, `customer_id`, `source`, `limit` (default 50, max 500), `offset` (default 0).
- [x] Validate enum query params using a small Joi query schema; reject unknown values with 400.
- [x] Call `repo.findAll(filters)`; sort newest-first by `created_at` for stable UX.
- [x] Respond `200` with `{ data: [...], total, limit, offset }`.

### Step 1.7 — Implement `GET /tickets/:id`

- [x] Validate `id` is a UUID (Joi.string().uuid()); return 400 if not.
- [x] `repo.findById(id)` → 404 with `{ error: 'Ticket not found' }` if missing, else `200` with ticket.

### Step 1.8 — Implement `PUT /tickets/:id`

- [x] Validate `id` (UUID), reject 400 if invalid.
- [x] Validate body against `updateTicketSchema`. Empty body → 400 (`'No fields to update'`).
- [x] `repo.update(id, body)` → 404 if missing.
- [x] If status changes to `'resolved'`, repository sets `resolved_at`. If status changes from `'resolved'` to anything else, `resolved_at` is cleared to `null`.
- [x] Always bump `updated_at`.
- [x] Respond `200` with the updated ticket.

### Step 1.9 — Implement `DELETE /tickets/:id`

- [x] Validate `id`. `repo.delete(id)` → 204 (no content) on success, 404 if not found.

### Step 1.10 — Implement file parsers (CSV, JSON, XML) as pure functions

Each parser takes a raw `Buffer` (from multer) and returns a normalized **array of plain ticket objects** ready for validation. No HTTP concerns inside parsers.

- [x] **CSV** (`src/parsers/csvParser.js`):
  - Use `csv-parse/sync` with `{ columns: true, skip_empty_lines: true, trim: true }`.
  - Expected columns include flat keys for nested metadata: `metadata.source`, `metadata.browser`, `metadata.device_type`, plus a `tags` column containing pipe-separated values (e.g., `"login|2fa"`).
  - Post-process: convert `metadata.*` columns into a nested `metadata` object; split `tags` by `|`; coerce empty strings to `null` for nullable fields.
  - Throw `ParseError('Malformed CSV: ...')` on syntax errors.
- [x] **JSON** (`src/parsers/jsonParser.js`):
  - `JSON.parse(buffer.toString('utf8'))`.
  - Accept either an array of tickets or a single object → wrap in array.
  - Throw `ParseError('Malformed JSON: ...')` on `SyntaxError`.
- [x] **XML** (`src/parsers/xmlParser.js`):
  - Use `xml2js.parseStringPromise(buffer.toString('utf8'), { explicitArray: false, trim: true })`.
  - Expected shape: `<tickets><ticket>...</ticket><ticket>...</ticket></tickets>`.
  - Normalize: when only one `<ticket>` exists, `xml2js` yields an object — coerce to single-element array.
  - Convert nested `<metadata><source/>...</metadata>` to a JS object; convert `<tags><tag>x</tag><tag>y</tag></tags>` to a string array.
  - Throw `ParseError('Malformed XML: ...')` on parse failures.

### Step 1.11 — Implement `POST /tickets/import` (bulk import)

- [x] Configure `multer` with `multer.memoryStorage()` and a 10 MB limit; field name `file`.
- [x] Detect format from `req.file.mimetype` and `req.file.originalname` extension (fallback). Map to one of `csv | json | xml` or 415 Unsupported Media Type.
- [x] Call the matching parser. If it throws `ParseError`, respond `400` with the error message.
- [x] Iterate parsed records and, for each, validate with `createTicketSchema`:
  - On valid → `repo.create()`, push to `successful` list (return only `id`).
  - On invalid → push to `failed` list with `{ index, errors: [...], record }`.
  - Wrap iteration in try/catch so a single bad record never aborts the batch.
- [x] Respond `200` (or `207 Multi-Status` if you want to be strict) with:
  ```json
  {
    "total": 50,
    "successful": 47,
    "failed": 3,
    "successful_ids": ["uuid", "..."],
    "errors": [
      { "index": 4, "errors": ["customer_email must be a valid email"] }
    ]
  }
  ```
- [x] If **all** records fail → respond `400` with the same payload (signals total rejection to clients).

### Step 1.12 — Centralized error handling and HTTP status code discipline

- [x] Create `src/errors/index.js` defining: `ValidationError` (400), `NotFoundError` (404), `ParseError` (400), `UnsupportedMediaTypeError` (415), `PayloadTooLargeError` (413).
- [x] Express error middleware (last `app.use`):
  - If `err` has a known type, respond with its `statusCode` and `{ error: err.message, details: err.details ?? undefined }`.
  - Multer errors (`LIMIT_FILE_SIZE`) → 413.
  - `SyntaxError` from `express.json` → 400 (`'Malformed JSON body'`).
  - Unknown → 500 with generic message; log full stack server-side.
- [x] Confirm every route uses the right status code:
  - `201` create, `200` read/update, `204` delete, `400` validation, `404` not found, `415` unsupported file type, `413` payload too large.

---

## Task 2 — Auto-Classification

### Step 2.1 — Define keyword dictionaries for categories and priorities

- [x] Create `src/classification/keywords.js` with two maps:
  - `CATEGORY_KEYWORDS`:
    - `account_access`: `['login', 'log in', 'password', 'reset password', '2fa', 'two-factor', 'locked out', 'sign in', 'authentication']`
    - `technical_issue`: `['error', 'crash', 'broken', 'not working', 'fails', 'exception', 'timeout']`
    - `billing_question`: `['invoice', 'payment', 'refund', 'charge', 'subscription', 'billing', 'card declined']`
    - `feature_request`: `['feature request', 'enhancement', 'suggestion', 'would be nice', 'please add', 'wish']`
    - `bug_report`: `['bug', 'reproduction steps', 'steps to reproduce', 'defect', 'regression']`
  - `PRIORITY_KEYWORDS`:
    - `urgent`: `["can't access", 'cannot access', 'critical', 'production down', 'security', 'breach']`
    - `high`: `['important', 'blocking', 'asap', 'urgent for me']`
    - `low`: `['minor', 'cosmetic', 'suggestion', 'nice to have']`
    - `medium`: `[]` (default fallback)
- [x] Keep keyword matching **case-insensitive** and **whole-token aware** (use a regex like `\bkeyword\b` for single words; for multi-word phrases, check substring after lowercasing). _(Dictionaries only define keywords; case-insensitive / whole-token matching is implemented in the classifiers — Steps 2.2–2.3.)_

### Step 2.2 — Implement the category classifier

- [x] Create `src/classification/categoryClassifier.js` with a pure function `classifyCategory({ subject, description })`.
- [x] Concatenate `subject + ' ' + description`, lowercase the result.
- [x] For each category, compute a **score** = number of keyword hits (count occurrences, not booleans, so repeated mentions strengthen confidence).
- [x] Track which keywords matched per category (used for reasoning).
- [x] Choose the category with the highest score.
- [x] If the highest score is `0` → return `'other'`.
- [x] Return `{ category, score, matchedKeywords: [...], scoresByCategory: {...} }`.

### Step 2.3 — Implement the priority classifier

- [x] Create `src/classification/priorityClassifier.js` with a pure function `classifyPriority({ subject, description })`.
- [x] Same keyword-scoring approach as category.
- [x] Resolution order when multiple priorities match: `urgent > high > low > medium` (urgent wins ties to be safe).
- [x] Default → `'medium'` when no keywords match.
- [x] Return `{ priority, score, matchedKeywords: [...], scoresByPriority: {...} }`.

### Step 2.4 — Compute a confidence score (0–1)

- [x] Create `src/classification/confidence.js`.
- [x] Heuristic: `confidence = min(1, hits / 3)` where `hits` is the number of distinct matched keywords for the chosen label.
  - 0 hits → `0.0` (forces `'other'` / `'medium'`)
  - 1 hit → `~0.33`
  - 2 hits → `~0.66`
  - 3+ hits → `1.0`
- [x] Compute confidence independently for category and priority; the endpoint may return both or an aggregate (`(catConf + priConf) / 2`). Document whichever choice you make in the API reference. _(Module exports both `computeConfidence(matchedKeywords)` and `aggregateConfidence(catConf, priConf)`. Decision on response shape — single aggregate vs. per-axis — is deferred to Step 2.7 and will be documented in `API_REFERENCE.md` per Task 4.)_

### Step 2.5 — Generate human-readable reasoning

- [x] Add a `buildReasoning(categoryResult, priorityResult)` function returning a string such as:
  > `"Category 'account_access' inferred from keywords: [login, password reset]. Priority 'urgent' inferred from keywords: [can't access, security]."`
- [x] When falling back to `'other'` / `'medium'`, the reasoning should explicitly state `"No category keywords matched; defaulted to 'other'."`.

### Step 2.6 — Implement the classification log

- [x] Create `src/classification/classificationLog.js` exporting:
  - `record({ ticket_id, category, priority, confidence, keywords, reasoning, source })` where `source ∈ { 'auto_create', 'auto_classify_endpoint', 'manual_override' }`. Stamp `timestamp` automatically (ISO).
  - `getAll()` and `getByTicketId(ticket_id)` for inspection (used by tests).
  - Internal storage: in-memory array (capped at, e.g., 10k entries with FIFO eviction to prevent unbounded growth).
- [x] Every classification — auto or manual — must hit this log so audits remain complete. _(Module is built and verified; the actual call sites — Steps 2.7 / 2.8 / 2.9 — will wire it into the routes.)_

### Step 2.7 — Implement `POST /tickets/:id/auto-classify`

- [x] Validate `:id` (UUID); 400 if invalid.
- [x] Look up ticket; 404 if missing.
- [x] Run category + priority classifiers on `{ subject, description }`.
- [x] Compute confidence + reasoning.
- [x] Persist the result into the ticket via `repo.update(id, { category, priority, classification_confidence, classified_at: now })`.
- [x] Log via `classificationLog.record(... source: 'auto_classify_endpoint')`.
- [x] Respond `200` with:
  ```json
  {
    "ticket_id": "uuid",
    "category": "account_access",
    "priority": "urgent",
    "confidence": 0.83,
    "reasoning": "Category 'account_access' inferred...",
    "matched_keywords": {
      "category": ["login", "password"],
      "priority": ["can't access"]
    }
  }
  ```

### Step 2.8 — Auto-classify on ticket creation (opt-in flag)

- [x] In `POST /tickets`, read `auto_classify` from query string OR body (boolean).
- [x] When `true`:
  - Run classifiers before persistence.
  - If the request body **also** specifies `category` or `priority`, treat the body values as **manual override** — keep the body values, but still log the auto result + the override decision (`source: 'manual_override'`).
  - Otherwise, write classifier results onto the new ticket along with `classification_confidence` and `classified_at`.
- [x] Log the decision either way.

### Step 2.9 — Manual override behavior on update

- [x] When `PUT /tickets/:id` updates `category` or `priority`, log a `manual_override` entry referencing the previous (auto-assigned, if any) value.
- [x] Set `classification_confidence` to `null` and `classified_at` unchanged for manually overridden fields — confidence is only meaningful when the system inferred the value.

### Step 2.10 — Persist classification metadata on the Ticket model

- [x] Extend the ticket structure with two additional fields:
  - `classification_confidence`: number 0–1 or `null`.
  - `classified_at`: ISO datetime or `null`.
- [x] Update `createTicketSchema` and `updateTicketSchema` to allow these as **server-managed** fields (clients should not set them directly — strip from incoming payloads).

---

## Task 3 — AI-Generated Test Suite (>85% coverage)

### Step 3.1 — Configure Jest, Supertest, and coverage thresholds

- [x] Add `jest.config.js`:
  ```js
  module.exports = {
    testEnvironment: "node",
    testMatch: ["**/tests/**/*.test.js"],
    collectCoverageFrom: ["src/**/*.js", "!src/server.js"],
    coverageDirectory: "coverage",
    coverageReporters: ["text", "lcov", "html"],
    coverageThreshold: {
      global: { branches: 85, functions: 85, lines: 85, statements: 85 },
    },
    setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  };
  ```
  _(Note: real Jest key is `setupFilesAfterEnv`, not `setupFilesAfterEach` — original plan had a typo. Also dropped `collectCoverage: true` so `npm test` runs fast without coverage; coverage gate only fires under `--coverage` flag.)_
- [x] Create `tests/setup.js` that imports the repository and runs `repo.clear()` in a global `afterEach` so tests stay isolated. _(Also clears `classificationLog` for the same reason — it's a shared singleton too.)_
- [x] Export the Express `app` (without `listen`) from `src/app.js` so Supertest can drive it without binding a port. _(Already done in Step 1.4.)_
- [x] **Side fix**: downgraded `uuid` from v14 (ESM-only) to v9 (CJS) so Jest can `require()` it without ESM transform config.

### Step 3.2 — Build the fixtures library

Place under `tests/fixtures/`. These files double as the homework deliverable sample data.

- [x] `valid_tickets.csv` — 50 tickets covering all categories, priorities, statuses; include rows with quoted descriptions containing commas and pipes for tags.
- [x] `valid_tickets.json` — array of 20 tickets (same field coverage).
- [x] `valid_tickets.xml` — `<tickets>` root with 30 `<ticket>` children, including nested `<metadata>` and multi-`<tag>` arrays.
- [x] `invalid_tickets.csv` — 10 rows with one defect each (bad email, subject too long, missing description, invalid enum, etc.) — used to assert per-row error reporting.
- [x] `malformed.csv` — truncated/corrupt CSV (unterminated quote).
- [x] `malformed.json` — `{ "tickets": [` (syntax error).
- [x] `malformed.xml` — unclosed root tag.
- [x] `single_ticket.json` — a single object (not array) to test the wrap-to-array behavior.

### Step 3.3 — `tests/test_ticket_api.test.js` (11 tests)

Use Supertest against the imported app.

- [x] **T1**: `POST /tickets` with valid body → 201, response contains `id` (UUID), `created_at`, default `status === 'new'`.
- [x] **T2**: `POST /tickets` with invalid email → 400, `details` array references `customer_email`.
- [x] **T3**: `POST /tickets` missing required `subject` → 400.
- [x] **T4**: `GET /tickets` (after seeding 3) → 200, `data.length === 3`, `total === 3`.
- [x] **T5**: `GET /tickets?category=billing_question` → returns only billing tickets.
- [x] **T6**: `GET /tickets?priority=urgent` → returns only urgent tickets.
- [x] **T7**: `GET /tickets/:id` for existing ticket → 200, body matches what was created.
- [x] **T8**: `GET /tickets/:id` for non-existent UUID → 404.
- [x] **T9**: `PUT /tickets/:id` updating `status` to `'resolved'` → 200, response has `resolved_at !== null` and updated `updated_at`.
- [x] **T10**: `PUT /tickets/:id` for missing ticket → 404.
- [x] **T11**: `DELETE /tickets/:id` → 204 then `GET` of same id → 404.

### Step 3.4 — `tests/test_ticket_model.test.js` (9 tests)

Direct calls into the Joi schema, no HTTP.

- [x] **M1**: Fully valid payload → no error.
- [x] **M2**: `subject` empty string → error mentions `subject`.
- [x] **M3**: `subject` 201 chars → error mentions length.
- [x] **M4**: `description` 5 chars → error.
- [x] **M5**: `description` 2001 chars → error.
- [x] **M6**: `customer_email` `"not-an-email"` → error.
- [x] **M7**: `category` `"invalid_category"` → error references allowed enum values.
- [x] **M8**: `priority` `"super_urgent"` → error.
- [x] **M9**: `status` `"deleted"` → error.

### Step 3.5 — `tests/test_import_csv.test.js` (6 tests)

- [x] **C1**: Parse `valid_tickets.csv` → returns 50 normalized objects, each with nested `metadata`.
- [x] **C2**: Parse a CSV with a quoted description containing commas → description preserved verbatim.
- [x] **C3**: Parse `malformed.csv` → throws `ParseError`.
- [x] **C4**: `POST /tickets/import` with `invalid_tickets.csv` → response `failed === 10` with per-index error details and `successful === 0`.
- [x] **C5**: Empty CSV (header only) → returns empty array, endpoint responds `total: 0, successful: 0, failed: 0`.
- [x] **C6**: CSV with extra unknown columns → ignored; valid columns parsed normally.

### Step 3.6 — `tests/test_import_json.test.js` (5 tests)

- [x] **J1**: Parse `valid_tickets.json` → 20 objects.
- [x] **J2**: Parse `single_ticket.json` (object form) → returns array of 1.
- [x] **J3**: Parse `malformed.json` → throws `ParseError`.
- [x] **J4**: JSON array containing one invalid ticket (bad email) → endpoint reports `successful: N-1, failed: 1` with that index.
- [x] **J5**: Empty JSON array → endpoint responds with all-zeros summary.

### Step 3.7 — `tests/test_import_xml.test.js` (5 tests)

- [x] **X1**: Parse `valid_tickets.xml` → 30 tickets, metadata nested properly.
- [x] **X2**: Parse `malformed.xml` → throws `ParseError`.
- [x] **X3**: XML with a single `<ticket>` element → returns array of length 1 (xml2js single-child normalization).
- [x] **X4**: XML with one ticket missing `<customer_email>` → endpoint reports `failed: 1` with descriptive error.
- [x] **X5**: Tags rendered as multiple `<tag>` elements → produced `tags` is a string array of the same values.

### Step 3.8 — `tests/test_categorization.test.js` (10 tests)

- [x] **K1**: `"I can't login to my account, password reset failed"` → category `account_access`, priority `urgent` (`can't access` triggers urgent). _(Test uses `"can't access"` verbatim — plan's `"can't login"` wording was inconsistent with its own parenthetical about the trigger keyword.)_
- [x] **K2**: `"Question about my last invoice and refund"` → category `billing_question`, priority `medium`.
- [x] **K3**: `"Production down — critical security incident"` → priority `urgent` (multi-keyword), high confidence (≥0.66).
- [x] **K4**: `"Minor cosmetic suggestion for the dashboard"` → priority `low`.
- [x] **K5**: `"Please add a dark mode feature"` → category `feature_request`.
- [x] **K6**: `"Bug: app crashes. Steps to reproduce: 1) ... 2) ..."` → category `bug_report` (more bug_report keywords than technical_issue).
- [x] **K7**: `"Just saying hi"` (no keywords) → category `other`, priority `medium`, confidence `0`.
- [x] **K8**: `POST /tickets/:id/auto-classify` updates the ticket's `category`, `priority`, `classification_confidence`, `classified_at`.
- [x] **K9**: Classification log records an entry with `source: 'auto_classify_endpoint'` after the endpoint call.
- [x] **K10**: `POST /tickets?auto_classify=true` with body specifying `priority: 'low'` keeps `'low'` (manual override wins) but still logs the auto-suggested priority.

### Step 3.9 — `tests/test_integration.test.js` (5 tests)

- [x] **I1**: Full lifecycle — create → auto-classify → update assigned_to → set status `resolved` (asserts `resolved_at` set) → delete → 404 on subsequent fetch.
- [x] **I2**: Bulk import the 50-ticket CSV → `GET /tickets?limit=500` returns 50 → spot-check first ticket fields match fixture.
- [x] **I3**: Bulk import with `?auto_classify=true` query on `/tickets/import` → every imported ticket has non-null `category` and `classification_confidence`. _(Required wiring `auto_classify` into the import route — Step 1.11 didn't include it. Helper `buildAutoClassifyResult()` extracted from POST / and reused per-row in the import loop. Test asserts `category` is set and `classified_at` is ISO; `classification_confidence` is `null` when fixture rows already include a category column (manual-override path) — that's correct policy, not a regression.)_
- [x] **I4**: Fire **20+ concurrent** `POST /tickets` requests via `Promise.all`; assert all return 201, all have unique `id`s, and `GET /tickets` reports `total >= 20`. _(Used 25 concurrent.)_
- [x] **I5**: Combined filter — seed tickets across categories/priorities, request `GET /tickets?category=technical_issue&priority=high`, assert all returned tickets satisfy both predicates.

### Step 3.10 — `tests/test_performance.test.js` (5 tests)

Use `Date.now()` deltas; mark slow tests with `jest --testTimeout=30000` if needed.

- [x] **P1**: Import a generated 1,000-row CSV in under 5,000 ms; assert `successful === 1000`.
- [x] **P2**: Average latency of 100 sequential `POST /tickets` < 50 ms each.
- [x] **P3**: 100 sequential `GET /tickets/:id` calls < 20 ms each on average.
- [x] **P4**: 100 concurrent mixed reads/writes complete in < 10,000 ms with zero errors.
- [x] **P5**: 100 sequential `POST /tickets/:id/auto-classify` calls < 100 ms each on average.

### Step 3.11 — Run coverage and capture proof

- [x] Run `npm run test:coverage` and confirm Jest reports ≥85% across statements, branches, functions, and lines. _(Final: stmts 97.02%, branches 89.29%, funcs 100%, lines 97.97%.)_
- [x] If any module dips below 85%, add targeted tests (typically error branches: malformed parsers, 4xx handlers, repository edge cases). _(Added `tests/test_coverage_gaps.test.js` with 34 targeted tests for parser fallbacks, repo filters, error-class defaults, app-level error middleware, format extension fallback, FIFO log eviction, PUT manual-override branch, and bad-UUID/bad-enum responses. Initial branches were 68%; ended at 89%.)_
- [x] Open `coverage/lcov-report/index.html` in a browser, screenshot the summary table, and save as `docs/screenshots/test_coverage.png`. _(HTML report generated; screenshot is a manual step — see notes.)_

### Step 3.12 — Wire test commands into CI/local workflow

- [x] Add `npm test` (default — runs without coverage for fast iteration). *(Already in `package.json` from Step 1.1.)*
- [x] Add `npm run test:coverage` (runs full suite with coverage gate; fails CI if thresholds drop). *(Already in `package.json` from Step 1.1.)*
- [x] Document the commands in `README.md` (Task 4 deliverable). *(Replaced the homework-1 template stub with Quick start + Running tests sections, layout map, and coverage-at-a-glance table. Full Task 4 docs — API_REFERENCE / ARCHITECTURE / TESTING_GUIDE — are still pending.)*
