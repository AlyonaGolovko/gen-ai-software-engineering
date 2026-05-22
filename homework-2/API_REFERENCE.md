# API Reference

Complete endpoint reference for the Intelligent Customer Support Ticket System. For design rationale see `ARCHITECTURE.md`. For test commands see `README.md`.

## Base URL

```
http://localhost:3000
```

The server reads `PORT` from the environment (default `3000`). Start it with `npm run dev` (auto-reload) or `npm start` (plain Node).

## Authentication

None. The system is open by design — see `ARCHITECTURE.md` "Security posture" for the full list of intentional non-features.

## Content types

- All JSON request/response bodies use `application/json; charset=utf-8`.
- The bulk-import endpoint accepts `multipart/form-data`; file content is detected from the `Content-Type` of the uploaded part with extension fallback.

## Error response format

Every error response follows the same shape:

```json
{
  "error": "<human-readable message>",
  "details": ["<optional, only when multiple sub-errors exist>"]
}
```

| Status | Class | When |
|---|---|---|
| `400` | `ValidationError` | Joi validation failed (body, query param, or path UUID). `details` lists every failure. |
| `400` | `ParseError` | Malformed CSV / JSON / XML during bulk import. |
| `400` | — | Malformed JSON in request body (`{ "error": "Malformed JSON body" }`). |
| `400` | — | Bulk import where every row failed. Body uses the bulk-import summary shape, not `{error, details}`. |
| `404` | `NotFoundError` | Ticket id not found, or unknown route (`{ "error": "Not Found" }`). |
| `413` | — | Upload exceeds 10 MB (`{ "error": "File exceeds 10 MB limit" }`). |
| `415` | `UnsupportedMediaTypeError` | Bulk import with neither a recognized mimetype nor a recognized file extension. |

## Data model

### Ticket

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "customer_id": "cust-1042",
  "customer_email": "ana@example.com",
  "customer_name": "Ana Customer",
  "subject": "Cannot log in",
  "description": "Locked out since this morning, password reset failed.",
  "category": "account_access",
  "priority": "urgent",
  "status": "new",
  "created_at": "2026-05-09T13:07:08.981Z",
  "updated_at": "2026-05-09T13:07:08.981Z",
  "resolved_at": null,
  "assigned_to": null,
  "tags": ["login", "2fa"],
  "metadata": {
    "source": "web_form",
    "browser": "Chrome",
    "device_type": "desktop"
  },
  "classification_confidence": 0.83,
  "classified_at": "2026-05-09T13:07:08.981Z"
}
```

| Field | Type | Constraints | Set by |
|---|---|---|---|
| `id` | UUID v4 | server-generated | server |
| `customer_id` | string | required, non-empty | client |
| `customer_email` | string | required, valid email | client |
| `customer_name` | string | required, 1–100 chars | client |
| `subject` | string | required, 1–200 chars | client |
| `description` | string | required, 10–2000 chars | client |
| `category` | enum (see below) | optional | client / classifier |
| `priority` | enum | optional, defaults to `medium` (when no `auto_classify`) | client / classifier |
| `status` | enum | optional, defaults to `new` | client |
| `created_at` | ISO 8601 datetime | server-generated | server |
| `updated_at` | ISO 8601 datetime | server-generated, bumped on every PUT | server |
| `resolved_at` | ISO 8601 datetime or `null` | set when `status` becomes `resolved`, cleared otherwise | server |
| `assigned_to` | string or `null` | optional | client |
| `tags` | string[] | optional, defaults to `[]` | client |
| `metadata` | object | optional, see below | client |
| `classification_confidence` | number 0-1 or `null` | server-managed; clients cannot set it | server |
| `classified_at` | ISO 8601 or `null` | server-managed; set when classifier runs | server |

#### `metadata`

Optional nested object:

| Field | Type | Constraints |
|---|---|---|
| `source` | enum | one of `web_form`, `email`, `api`, `chat`, `phone` |
| `browser` | string | free text |
| `device_type` | enum | one of `desktop`, `mobile`, `tablet` |

### Enums

| Enum | Values |
|---|---|
| `category` | `account_access`, `technical_issue`, `billing_question`, `feature_request`, `bug_report`, `other` |
| `priority` | `urgent`, `high`, `medium`, `low` |
| `status` | `new`, `in_progress`, `waiting_customer`, `resolved`, `closed` |
| `metadata.source` | `web_form`, `email`, `api`, `chat`, `phone` |
| `metadata.device_type` | `desktop`, `mobile`, `tablet` |

### Server-managed fields

`classification_confidence` and `classified_at` are owned by the server. They appear in every response body, but any value a client sends in a `POST` or `PUT` body is silently stripped before validation. To set them, use `POST /tickets?auto_classify=true` or `POST /tickets/:id/auto-classify`.

---

## Endpoints

### POST /tickets

Create a single ticket.

**Query parameters**

| Name | Type | Default | Description |
|---|---|---|---|
| `auto_classify` | boolean | `false` | If `true`, run the classifier and set `category` / `priority` / `classification_confidence` / `classified_at`. The same flag can be supplied as a body field. |

**Request body** — see `Ticket` model. Required: `customer_id`, `customer_email`, `customer_name`, `subject`, `description`. Server-managed fields are stripped.

**Success — `201 Created`**

Response body is the full ticket with server-generated `id`, `created_at`, `updated_at`. Includes a `Location: /tickets/<id>` header.

**Errors**

- `400` — validation failure (`details` lists each failed field).

**cURL**

```bash
curl -i -X POST http://localhost:3000/tickets \
  -H 'Content-Type: application/json' \
  -d '{
    "customer_id": "cust-1042",
    "customer_email": "ana@example.com",
    "customer_name": "Ana Customer",
    "subject": "Cannot log in",
    "description": "Locked out since this morning, password reset failed."
  }'
```

With auto-classify:

```bash
curl -i -X POST 'http://localhost:3000/tickets?auto_classify=true' \
  -H 'Content-Type: application/json' \
  -d '{
    "customer_id": "cust-1042",
    "customer_email": "ana@example.com",
    "customer_name": "Ana",
    "subject": "Critical security incident",
    "description": "Production down, breach in progress, login broken."
  }'
```

**Manual override semantics**: when `auto_classify=true` *and* the body specifies `category` or `priority`, the body wins for those axes; the classifier's suggestion is still recorded in the audit log with `source: "manual_override"`.

---

### POST /tickets/import

Bulk-import tickets from a CSV, JSON, or XML file. Format is detected from the upload's `Content-Type` (`text/csv`, `application/json`, `application/xml` / `text/xml`) with filename-extension fallback.

**Query parameters**

| Name | Type | Default | Description |
|---|---|---|---|
| `auto_classify` | boolean | `false` | If `true`, run the classifier per row and stamp classification metadata on each successful insert. |

**Request body** — `multipart/form-data` with field name `file`. Maximum 10 MB.

**Success — `200 OK` (or `400` if every row failed)**

```json
{
  "total": 50,
  "successful": 47,
  "failed": 3,
  "successful_ids": ["550e8400-e29b-41d4-a716-446655440000", "..."],
  "errors": [
    {
      "index": 4,
      "errors": ["\"customer_email\" must be a valid email"],
      "record": { "customer_id": "c5", "customer_email": "not-an-email", "...": "..." }
    }
  ]
}
```

The summary body shape is identical for `200` and `400`. `400` is used only when `total > 0 && successful === 0` — i.e., total rejection.

**Errors**

- `400` — `ParseError`: malformed file content (`{ "error": "Malformed CSV: ..." }`).
- `400` — `Missing file field` if the multipart body has no `file` part.
- `413` — file exceeds 10 MB.
- `415` — unsupported media type (neither mimetype nor extension matches CSV/JSON/XML).

**cURL**

```bash
# CSV
curl -i -X POST http://localhost:3000/tickets/import \
  -F 'file=@tests/fixtures/valid_tickets.csv;type=text/csv'

# JSON with auto-classify
curl -i -X POST 'http://localhost:3000/tickets/import?auto_classify=true' \
  -F 'file=@tests/fixtures/valid_tickets.json;type=application/json'

# XML
curl -i -X POST http://localhost:3000/tickets/import \
  -F 'file=@tests/fixtures/valid_tickets.xml;type=application/xml'
```

#### File format expectations

**CSV** — first row is the header. Columns can include flat `metadata.source`, `metadata.browser`, `metadata.device_type` (folded into a nested `metadata` object). The `tags` column is pipe-separated (`login|2fa|password`). Empty cells are ignored.

```csv
customer_id,customer_email,customer_name,subject,description,category,priority,tags,metadata.source,metadata.device_type
c1,ana@example.com,Ana,Login fail,"Locked out, password reset failed",account_access,urgent,login|2fa,web_form,desktop
```

**JSON** — either an array of ticket objects or a single object (silently wrapped to an array).

```json
[
  {
    "customer_id": "c1",
    "customer_email": "ana@example.com",
    "customer_name": "Ana",
    "subject": "Login fail",
    "description": "Locked out, password reset failed.",
    "tags": ["login", "2fa"],
    "metadata": { "source": "web_form" }
  }
]
```

**XML** — `<tickets>` root with one or more `<ticket>` children. Multiple `<tag>` elements become an array; nested `<metadata>` becomes an object.

```xml
<tickets>
  <ticket>
    <customer_id>c1</customer_id>
    <customer_email>ana@example.com</customer_email>
    <customer_name>Ana</customer_name>
    <subject>Login fail</subject>
    <description>Locked out, password reset failed.</description>
    <tags><tag>login</tag><tag>2fa</tag></tags>
    <metadata><source>web_form</source></metadata>
  </ticket>
</tickets>
```

---

### POST /tickets/:id/auto-classify

Run the classifier on an existing ticket's `subject` and `description`, persist the results, and append an entry to the audit log with `source: "auto_classify_endpoint"`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | UUID v4 | The ticket id |

**Request body** — empty.

**Success — `200 OK`**

```json
{
  "ticket_id": "550e8400-e29b-41d4-a716-446655440000",
  "category": "account_access",
  "priority": "urgent",
  "confidence": 0.83,
  "reasoning": "Category 'account_access' inferred from keywords: [login, password, locked out]. Priority 'urgent' inferred from keywords: [can't access, security].",
  "matched_keywords": {
    "category": ["login", "password", "locked out"],
    "priority": ["can't access", "security"]
  }
}
```

`confidence` is the aggregate `(category_confidence + priority_confidence) / 2`, where each per-axis confidence is `min(1, distinct_keywords_matched / 3)`. The same value is persisted on the ticket as `classification_confidence`.

**Errors**

- `400` — path `id` is not a UUID v4.
- `404` — ticket not found.

**cURL**

```bash
curl -i -X POST http://localhost:3000/tickets/550e8400-e29b-41d4-a716-446655440000/auto-classify
```

---

### GET /tickets

List tickets, sorted newest-first by `created_at`. Supports filters and pagination.

**Query parameters**

| Name | Type | Default | Description |
|---|---|---|---|
| `category` | enum | — | Filter by category |
| `priority` | enum | — | Filter by priority |
| `status` | enum | — | Filter by status |
| `customer_id` | string | — | Filter by customer id |
| `source` | enum | — | Filter by `metadata.source` |
| `limit` | integer | `50` | Max items returned, capped at `500` |
| `offset` | integer | `0` | Skip the first N items |

**Success — `200 OK`**

```json
{
  "data": [ /* array of Ticket objects */ ],
  "total": 47,
  "limit": 50,
  "offset": 0
}
```

`total` is the *unpaginated* count after filters apply, useful for client-side pagination UI.

**Errors**

- `400` — invalid enum value or out-of-range `limit` / `offset`.

**cURL**

```bash
# All tickets
curl -s 'http://localhost:3000/tickets'

# Filtered
curl -s 'http://localhost:3000/tickets?category=billing_question&priority=urgent'

# Paginated
curl -s 'http://localhost:3000/tickets?limit=20&offset=40'
```

---

### GET /tickets/:id

Fetch a single ticket.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | UUID v4 | The ticket id |

**Success — `200 OK`** — the full Ticket object.

**Errors**

- `400` — `id` is not a UUID v4.
- `404` — ticket not found.

**cURL**

```bash
curl -s http://localhost:3000/tickets/550e8400-e29b-41d4-a716-446655440000
```

---

### PUT /tickets/:id

Patch one or more fields of an existing ticket. Empty bodies are rejected. Server-managed fields in the body are silently stripped.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | UUID v4 | The ticket id |

**Request body** — any subset of the writable Ticket fields. At least one field is required.

**Behavior worth knowing**

- `updated_at` is bumped on every successful PUT.
- Setting `status` to `resolved` stamps `resolved_at` to the current time; setting it to anything else clears `resolved_at` to `null`.
- Changing `category` or `priority` to a new value is treated as a **manual override**: `classification_confidence` is set to `null`, `classified_at` is left unchanged, and a `manual_override` entry is appended to the audit log with the previous values in its reasoning string.
- Setting a field to its current value is *not* counted as an override and produces no log entry.

**Success — `200 OK`** — the updated ticket.

**Errors**

- `400` — `id` is not a UUID v4, body is empty (`No fields to update`), or any field fails Joi validation.
- `404` — ticket not found.

**cURL**

```bash
# Resolve a ticket
curl -i -X PUT http://localhost:3000/tickets/550e8400-e29b-41d4-a716-446655440000 \
  -H 'Content-Type: application/json' \
  -d '{ "status": "resolved" }'

# Reassign and re-prioritize
curl -i -X PUT http://localhost:3000/tickets/550e8400-e29b-41d4-a716-446655440000 \
  -H 'Content-Type: application/json' \
  -d '{ "assigned_to": "agent-7", "priority": "high" }'
```

---

### DELETE /tickets/:id

Remove a ticket.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `id` | UUID v4 | The ticket id |

**Success — `204 No Content`** — empty body.

**Errors**

- `400` — `id` is not a UUID v4.
- `404` — ticket not found.

**cURL**

```bash
curl -i -X DELETE http://localhost:3000/tickets/550e8400-e29b-41d4-a716-446655440000
```

---

## Quick reference

| Method | Path | Status (success) | Notes |
|---|---|---|---|
| `POST` | `/tickets` | `201` | `?auto_classify=true` runs classifier |
| `POST` | `/tickets/import` | `200` / `400` (all-fail) | multipart `file` field, ≤10 MB |
| `POST` | `/tickets/:id/auto-classify` | `200` | logs `auto_classify_endpoint` |
| `GET` | `/tickets` | `200` | filters + pagination |
| `GET` | `/tickets/:id` | `200` | |
| `PUT` | `/tickets/:id` | `200` | category/priority change → `manual_override` log |
| `DELETE` | `/tickets/:id` | `204` | empty body on success |

## Classification audit log

Every classification decision (auto on create, the explicit endpoint, or a manual override on update) is appended to an in-memory log capped at 10,000 entries with FIFO eviction. Log entries are not exposed via HTTP — they are accessible from inside the test suite (`tests/test_categorization.test.js` exercises this). Each entry includes:

| Field | Description |
|---|---|
| `ticket_id` | The id of the affected ticket |
| `category` / `priority` | What the classifier *suggested* (not necessarily what was stored — manual overrides preserve the suggestion here) |
| `confidence` | Aggregate confidence at the time of decision; `null` for `manual_override` |
| `keywords` | Per-axis matched-keyword arrays |
| `reasoning` | Human-readable explanation |
| `source` | `"auto_create"` \| `"auto_classify_endpoint"` \| `"manual_override"` |
| `timestamp` | ISO 8601 |
