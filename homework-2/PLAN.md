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
- [x] Add `.gitignore` with `node_modules/`, `coverage/`, `.env`. *(root `.gitignore` already covers these — no per-homework file added per CLAUDE.md guidance)*

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
- [x] Read query flag `?auto_classify=true` (Task 2 hook): if set, call the classifier (Task 2) and merge results before persisting; manual `category`/`priority` in body wins over classifier output. *(flag is read and gates the priority default; classifier integration deferred to Step 2.8)*
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
- [ ] **CSV** (`src/parsers/csvParser.js`):
  - Use `csv-parse/sync` with `{ columns: true, skip_empty_lines: true, trim: true }`.
  - Expected columns include flat keys for nested metadata: `metadata.source`, `metadata.browser`, `metadata.device_type`, plus a `tags` column containing pipe-separated values (e.g., `"login|2fa"`).
  - Post-process: convert `metadata.*` columns into a nested `metadata` object; split `tags` by `|`; coerce empty strings to `null` for nullable fields.
  - Throw `ParseError('Malformed CSV: ...')` on syntax errors.
- [ ] **JSON** (`src/parsers/jsonParser.js`):
  - `JSON.parse(buffer.toString('utf8'))`.
  - Accept either an array of tickets or a single object → wrap in array.
  - Throw `ParseError('Malformed JSON: ...')` on `SyntaxError`.
- [ ] **XML** (`src/parsers/xmlParser.js`):
  - Use `xml2js.parseStringPromise(buffer.toString('utf8'), { explicitArray: false, trim: true })`.
  - Expected shape: `<tickets><ticket>...</ticket><ticket>...</ticket></tickets>`.
  - Normalize: when only one `<ticket>` exists, `xml2js` yields an object — coerce to single-element array.
  - Convert nested `<metadata><source/>...</metadata>` to a JS object; convert `<tags><tag>x</tag><tag>y</tag></tags>` to a string array.
  - Throw `ParseError('Malformed XML: ...')` on parse failures.

### Step 1.11 — Implement `POST /tickets/import` (bulk import)
- [ ] Configure `multer` with `multer.memoryStorage()` and a 10 MB limit; field name `file`.
- [ ] Detect format from `req.file.mimetype` and `req.file.originalname` extension (fallback). Map to one of `csv | json | xml` or 415 Unsupported Media Type.
- [ ] Call the matching parser. If it throws `ParseError`, respond `400` with the error message.
- [ ] Iterate parsed records and, for each, validate with `createTicketSchema`:
  - On valid → `repo.create()`, push to `successful` list (return only `id`).
  - On invalid → push to `failed` list with `{ index, errors: [...], record }`.
  - Wrap iteration in try/catch so a single bad record never aborts the batch.
- [ ] Respond `200` (or `207 Multi-Status` if you want to be strict) with:
  ```json
  {
    "total": 50,
    "successful": 47,
    "failed": 3,
    "successful_ids": ["uuid", "..."],
    "errors": [{ "index": 4, "errors": ["customer_email must be a valid email"] }]
  }
  ```
- [ ] If **all** records fail → respond `400` with the same payload (signals total rejection to clients).

### Step 1.12 — Centralized error handling and HTTP status code discipline
- [ ] Create `src/errors/index.js` defining: `ValidationError` (400), `NotFoundError` (404), `ParseError` (400), `UnsupportedMediaTypeError` (415), `PayloadTooLargeError` (413).
- [ ] Express error middleware (last `app.use`):
  - If `err` has a known type, respond with its `statusCode` and `{ error: err.message, details: err.details ?? undefined }`.
  - Multer errors (`LIMIT_FILE_SIZE`) → 413.
  - `SyntaxError` from `express.json` → 400 (`'Malformed JSON body'`).
  - Unknown → 500 with generic message; log full stack server-side.
- [ ] Confirm every route uses the right status code:
  - `201` create, `200` read/update, `204` delete, `400` validation, `404` not found, `415` unsupported file type, `413` payload too large.

---

## Task 2 — Auto-Classification

### Step 2.1 — Define keyword dictionaries for categories and priorities
- [ ] Create `src/classification/keywords.js` with two maps:
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
- [ ] Keep keyword matching **case-insensitive** and **whole-token aware** (use a regex like `\bkeyword\b` for single words; for multi-word phrases, check substring after lowercasing).

### Step 2.2 — Implement the category classifier
- [ ] Create `src/classification/categoryClassifier.js` with a pure function `classifyCategory({ subject, description })`.
- [ ] Concatenate `subject + ' ' + description`, lowercase the result.
- [ ] For each category, compute a **score** = number of keyword hits (count occurrences, not booleans, so repeated mentions strengthen confidence).
- [ ] Track which keywords matched per category (used for reasoning).
- [ ] Choose the category with the highest score.
- [ ] If the highest score is `0` → return `'other'`.
- [ ] Return `{ category, score, matchedKeywords: [...], scoresByCategory: {...} }`.

### Step 2.3 — Implement the priority classifier
- [ ] Create `src/classification/priorityClassifier.js` with a pure function `classifyPriority({ subject, description })`.
- [ ] Same keyword-scoring approach as category.
- [ ] Resolution order when multiple priorities match: `urgent > high > low > medium` (urgent wins ties to be safe).
- [ ] Default → `'medium'` when no keywords match.
- [ ] Return `{ priority, score, matchedKeywords: [...], scoresByPriority: {...} }`.

### Step 2.4 — Compute a confidence score (0–1)
- [ ] Create `src/classification/confidence.js`.
- [ ] Heuristic: `confidence = min(1, hits / 3)` where `hits` is the number of distinct matched keywords for the chosen label.
  - 0 hits → `0.0` (forces `'other'` / `'medium'`)
  - 1 hit → `~0.33`
  - 2 hits → `~0.66`
  - 3+ hits → `1.0`
- [ ] Compute confidence independently for category and priority; the endpoint may return both or an aggregate (`(catConf + priConf) / 2`). Document whichever choice you make in the API reference.

### Step 2.5 — Generate human-readable reasoning
- [ ] Add a `buildReasoning(categoryResult, priorityResult)` function returning a string such as:
  > `"Category 'account_access' inferred from keywords: [login, password reset]. Priority 'urgent' inferred from keywords: [can't access, security]."`
- [ ] When falling back to `'other'` / `'medium'`, the reasoning should explicitly state `"No category keywords matched; defaulted to 'other'."`.

### Step 2.6 — Implement the classification log
- [ ] Create `src/classification/classificationLog.js` exporting:
  - `record({ ticket_id, category, priority, confidence, keywords, reasoning, source })` where `source ∈ { 'auto_create', 'auto_classify_endpoint', 'manual_override' }`. Stamp `timestamp` automatically (ISO).
  - `getAll()` and `getByTicketId(ticket_id)` for inspection (used by tests).
  - Internal storage: in-memory array (capped at, e.g., 10k entries with FIFO eviction to prevent unbounded growth).
- [ ] Every classification — auto or manual — must hit this log so audits remain complete.

### Step 2.7 — Implement `POST /tickets/:id/auto-classify`
- [ ] Validate `:id` (UUID); 400 if invalid.
- [ ] Look up ticket; 404 if missing.
- [ ] Run category + priority classifiers on `{ subject, description }`.
- [ ] Compute confidence + reasoning.
- [ ] Persist the result into the ticket via `repo.update(id, { category, priority, classification_confidence, classified_at: now })`.
- [ ] Log via `classificationLog.record(... source: 'auto_classify_endpoint')`.
- [ ] Respond `200` with:
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
- [ ] In `POST /tickets`, read `auto_classify` from query string OR body (boolean).
- [ ] When `true`:
  - Run classifiers before persistence.
  - If the request body **also** specifies `category` or `priority`, treat the body values as **manual override** — keep the body values, but still log the auto result + the override decision (`source: 'manual_override'`).
  - Otherwise, write classifier results onto the new ticket along with `classification_confidence` and `classified_at`.
- [ ] Log the decision either way.

### Step 2.9 — Manual override behavior on update
- [ ] When `PUT /tickets/:id` updates `category` or `priority`, log a `manual_override` entry referencing the previous (auto-assigned, if any) value.
- [ ] Set `classification_confidence` to `null` and `classified_at` unchanged for manually overridden fields — confidence is only meaningful when the system inferred the value.

### Step 2.10 — Persist classification metadata on the Ticket model
- [ ] Extend the ticket structure with two additional fields:
  - `classification_confidence`: number 0–1 or `null`.
  - `classified_at`: ISO datetime or `null`.
- [ ] Update `createTicketSchema` and `updateTicketSchema` to allow these as **server-managed** fields (clients should not set them directly — strip from incoming payloads).

---

## Task 3 — AI-Generated Test Suite (>85% coverage)

### Step 3.1 — Configure Jest, Supertest, and coverage thresholds
- [ ] Add `jest.config.js`:
  ```js
  module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    collectCoverage: true,
    collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    coverageThreshold: {
      global: { branches: 85, functions: 85, lines: 85, statements: 85 }
    },
    setupFilesAfterEach: ['<rootDir>/tests/setup.js']
  };
  ```
- [ ] Create `tests/setup.js` that imports the repository and runs `repo.clear()` in a global `afterEach` so tests stay isolated.
- [ ] Export the Express `app` (without `listen`) from `src/app.js` so Supertest can drive it without binding a port.

### Step 3.2 — Build the fixtures library
Place under `tests/fixtures/`. These files double as the homework deliverable sample data.
- [ ] `valid_tickets.csv` — 50 tickets covering all categories, priorities, statuses; include rows with quoted descriptions containing commas and pipes for tags.
- [ ] `valid_tickets.json` — array of 20 tickets (same field coverage).
- [ ] `valid_tickets.xml` — `<tickets>` root with 30 `<ticket>` children, including nested `<metadata>` and multi-`<tag>` arrays.
- [ ] `invalid_tickets.csv` — 10 rows with one defect each (bad email, subject too long, missing description, invalid enum, etc.) — used to assert per-row error reporting.
- [ ] `malformed.csv` — truncated/corrupt CSV (unterminated quote).
- [ ] `malformed.json` — `{ "tickets": [` (syntax error).
- [ ] `malformed.xml` — unclosed root tag.
- [ ] `single_ticket.json` — a single object (not array) to test the wrap-to-array behavior.

### Step 3.3 — `tests/test_ticket_api.test.js` (11 tests)
Use Supertest against the imported app.
- [ ] **T1**: `POST /tickets` with valid body → 201, response contains `id` (UUID), `created_at`, default `status === 'new'`.
- [ ] **T2**: `POST /tickets` with invalid email → 400, `details` array references `customer_email`.
- [ ] **T3**: `POST /tickets` missing required `subject` → 400.
- [ ] **T4**: `GET /tickets` (after seeding 3) → 200, `data.length === 3`, `total === 3`.
- [ ] **T5**: `GET /tickets?category=billing_question` → returns only billing tickets.
- [ ] **T6**: `GET /tickets?priority=urgent` → returns only urgent tickets.
- [ ] **T7**: `GET /tickets/:id` for existing ticket → 200, body matches what was created.
- [ ] **T8**: `GET /tickets/:id` for non-existent UUID → 404.
- [ ] **T9**: `PUT /tickets/:id` updating `status` to `'resolved'` → 200, response has `resolved_at !== null` and updated `updated_at`.
- [ ] **T10**: `PUT /tickets/:id` for missing ticket → 404.
- [ ] **T11**: `DELETE /tickets/:id` → 204 then `GET` of same id → 404.

### Step 3.4 — `tests/test_ticket_model.test.js` (9 tests)
Direct calls into the Joi schema, no HTTP.
- [ ] **M1**: Fully valid payload → no error.
- [ ] **M2**: `subject` empty string → error mentions `subject`.
- [ ] **M3**: `subject` 201 chars → error mentions length.
- [ ] **M4**: `description` 5 chars → error.
- [ ] **M5**: `description` 2001 chars → error.
- [ ] **M6**: `customer_email` `"not-an-email"` → error.
- [ ] **M7**: `category` `"invalid_category"` → error references allowed enum values.
- [ ] **M8**: `priority` `"super_urgent"` → error.
- [ ] **M9**: `status` `"deleted"` → error.

### Step 3.5 — `tests/test_import_csv.test.js` (6 tests)
- [ ] **C1**: Parse `valid_tickets.csv` → returns 50 normalized objects, each with nested `metadata`.
- [ ] **C2**: Parse a CSV with a quoted description containing commas → description preserved verbatim.
- [ ] **C3**: Parse `malformed.csv` → throws `ParseError`.
- [ ] **C4**: `POST /tickets/import` with `invalid_tickets.csv` → response `failed === 10` with per-index error details and `successful === 0`.
- [ ] **C5**: Empty CSV (header only) → returns empty array, endpoint responds `total: 0, successful: 0, failed: 0`.
- [ ] **C6**: CSV with extra unknown columns → ignored; valid columns parsed normally.

### Step 3.6 — `tests/test_import_json.test.js` (5 tests)
- [ ] **J1**: Parse `valid_tickets.json` → 20 objects.
- [ ] **J2**: Parse `single_ticket.json` (object form) → returns array of 1.
- [ ] **J3**: Parse `malformed.json` → throws `ParseError`.
- [ ] **J4**: JSON array containing one invalid ticket (bad email) → endpoint reports `successful: N-1, failed: 1` with that index.
- [ ] **J5**: Empty JSON array → endpoint responds with all-zeros summary.

### Step 3.7 — `tests/test_import_xml.test.js` (5 tests)
- [ ] **X1**: Parse `valid_tickets.xml` → 30 tickets, metadata nested properly.
- [ ] **X2**: Parse `malformed.xml` → throws `ParseError`.
- [ ] **X3**: XML with a single `<ticket>` element → returns array of length 1 (xml2js single-child normalization).
- [ ] **X4**: XML with one ticket missing `<customer_email>` → endpoint reports `failed: 1` with descriptive error.
- [ ] **X5**: Tags rendered as multiple `<tag>` elements → produced `tags` is a string array of the same values.

### Step 3.8 — `tests/test_categorization.test.js` (10 tests)
- [ ] **K1**: `"I can't login to my account, password reset failed"` → category `account_access`, priority `urgent` (`can't access` triggers urgent).
- [ ] **K2**: `"Question about my last invoice and refund"` → category `billing_question`, priority `medium`.
- [ ] **K3**: `"Production down — critical security incident"` → priority `urgent` (multi-keyword), high confidence (≥0.66).
- [ ] **K4**: `"Minor cosmetic suggestion for the dashboard"` → priority `low`.
- [ ] **K5**: `"Please add a dark mode feature"` → category `feature_request`.
- [ ] **K6**: `"Bug: app crashes. Steps to reproduce: 1) ... 2) ..."` → category `bug_report` (more bug_report keywords than technical_issue).
- [ ] **K7**: `"Just saying hi"` (no keywords) → category `other`, priority `medium`, confidence `0`.
- [ ] **K8**: `POST /tickets/:id/auto-classify` updates the ticket's `category`, `priority`, `classification_confidence`, `classified_at`.
- [ ] **K9**: Classification log records an entry with `source: 'auto_classify_endpoint'` after the endpoint call.
- [ ] **K10**: `POST /tickets?auto_classify=true` with body specifying `priority: 'low'` keeps `'low'` (manual override wins) but still logs the auto-suggested priority.

### Step 3.9 — `tests/test_integration.test.js` (5 tests)
- [ ] **I1**: Full lifecycle — create → auto-classify → update assigned_to → set status `resolved` (asserts `resolved_at` set) → delete → 404 on subsequent fetch.
- [ ] **I2**: Bulk import the 50-ticket CSV → `GET /tickets?limit=500` returns 50 → spot-check first ticket fields match fixture.
- [ ] **I3**: Bulk import with `?auto_classify=true` query on `/tickets/import` → every imported ticket has non-null `category` and `classification_confidence`.
- [ ] **I4**: Fire **20+ concurrent** `POST /tickets` requests via `Promise.all`; assert all return 201, all have unique `id`s, and `GET /tickets` reports `total >= 20`.
- [ ] **I5**: Combined filter — seed tickets across categories/priorities, request `GET /tickets?category=technical_issue&priority=high`, assert all returned tickets satisfy both predicates.

### Step 3.10 — `tests/test_performance.test.js` (5 tests)
Use `Date.now()` deltas; mark slow tests with `jest --testTimeout=30000` if needed.
- [ ] **P1**: Import a generated 1,000-row CSV in under 5,000 ms; assert `successful === 1000`.
- [ ] **P2**: Average latency of 100 sequential `POST /tickets` < 50 ms each.
- [ ] **P3**: 100 sequential `GET /tickets/:id` calls < 20 ms each on average.
- [ ] **P4**: 100 concurrent mixed reads/writes complete in < 10,000 ms with zero errors.
- [ ] **P5**: 100 sequential `POST /tickets/:id/auto-classify` calls < 100 ms each on average.

### Step 3.11 — Run coverage and capture proof
- [ ] Run `npm run test:coverage` and confirm Jest reports ≥85% across statements, branches, functions, and lines.
- [ ] If any module dips below 85%, add targeted tests (typically error branches: malformed parsers, 4xx handlers, repository edge cases).
- [ ] Open `coverage/lcov-report/index.html` in a browser, screenshot the summary table, and save as `docs/screenshots/test_coverage.png`.

### Step 3.12 — Wire test commands into CI/local workflow
- [ ] Add `npm test` (default — runs without coverage for fast iteration).
- [ ] Add `npm run test:coverage` (runs full suite with coverage gate; fails CI if thresholds drop).
- [ ] Document the commands in `README.md` (Task 4 deliverable).
