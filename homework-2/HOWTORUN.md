# How to Run

Step-by-step guide for running, testing, and verifying the Intelligent Customer Support Ticket System on a fresh machine. For project overview see `README.md`. For endpoint details see `API_REFERENCE.md`.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | **18 or newer** | Required by Express 5 and Jest 30 |
| npm | **9+** | Comes bundled with Node 18+ |
| `curl` or Postman | any | For verifying endpoints (Postman is what the screenshots use) |

Verify your versions:

```bash
node --version    # should print v18.x or higher
npm --version     # should print 9.x or higher
```

If you don't have Node 18+, install it via:
- macOS: `brew install node` (or use [nvm](https://github.com/nvm-sh/nvm) for version management)
- Linux: follow [nodejs.org/en/download](https://nodejs.org/en/download)
- Windows: download the LTS installer from [nodejs.org](https://nodejs.org)

## 1. Get the code

```bash
git clone https://github.com/<your-username>/ai-assisted-dev-homework.git
cd ai-assisted-dev-homework/homework-2
```

If you're already in the repo, just `cd homework-2`.

## 2. Install dependencies

```bash
npm install
```

This pulls runtime dependencies (express, multer, joi, csv-parse, xml2js, uuid, helmet, cors, morgan) and dev dependencies (jest, supertest, nodemon, cross-env). Expect ~300 MB in `node_modules/`. Takes 20–60 seconds depending on network.

## 3. Run the server

Two options:

```bash
npm run dev          # nodemon — auto-reloads on src/ changes (recommended for development)
# or
npm start            # plain node src/server.js (production-style)
```

Expected output:

```
Server listening on port 3000
```

The server is now reachable at `http://localhost:3000`. Override the port:

```bash
PORT=4000 npm start
```

To stop: `Ctrl + C` in the terminal running the server.

## 4. Verify it works

In a **second terminal** (leave the server running in the first):

### Health check via 404 fallthrough

```bash
curl -i http://localhost:3000/
```

Expected:

```
HTTP/1.1 404 Not Found
Content-Type: application/json
{"error":"Not Found"}
```

That's the correct response — the API has no root route by design; the 404 confirms the error middleware is wired.

### Create a ticket

```bash
curl -i -X POST http://localhost:3000/tickets \
  -H 'Content-Type: application/json' \
  -d '{
    "customer_id": "cust-1",
    "customer_email": "ana@example.com",
    "customer_name": "Ana",
    "subject": "Cannot log in",
    "description": "Locked out since this morning, password reset failed."
  }'
```

Expected: `201 Created` with a JSON body that includes `id` (UUID), `status: "new"`, `priority: "medium"`, and a `Location` header pointing at `/tickets/<id>`.

### Auto-classify a ticket

Save the returned `id` from the previous step, then:

```bash
curl -i -X POST http://localhost:3000/tickets/<paste-id-here>/auto-classify
```

Expected: `200 OK` with `category`, `priority`, `confidence`, `reasoning`, and `matched_keywords` populated based on the ticket's text.

### Bulk import the 50-row sample

```bash
curl -i -X POST http://localhost:3000/tickets/import \
  -F 'file=@tests/fixtures/valid_tickets.csv;type=text/csv'
```

Expected: `200 OK` with `{ "total": 50, "successful": 50, "failed": 0, ... }`.

For the full Postman walkthrough see `docs/screenshots/postman-*.png`.

## 5. Run the tests

In a **separate terminal** (server can keep running — tests use Supertest, which doesn't bind a real port):

```bash
npm test                                       # full suite, no coverage (~3.5 s)
npm run test:coverage                          # full suite + coverage gate (≥85% required)
npx jest tests/test_ticket_api.test.js         # one file
npx jest -t "T7"                               # one test by name fragment
npx jest --watch                               # auto-rerun the relevant tests on file save
```

Expected output for `npm test`:

```
Test Suites: 9 passed, 9 total
Tests:       90 passed, 90 total
Time:        ~3.5 s
```

After `npm run test:coverage`, open the HTML report:

```bash
open coverage/lcov-report/index.html       # macOS
xdg-open coverage/lcov-report/index.html   # Linux
start coverage/lcov-report/index.html      # Windows
```

The summary at the top should show **97 / 89 / 100 / 98** for statements / branches / functions / lines (all above the 85% gate).

## 6. Project layout (where things live)

```
homework-2/
├── src/                # production code
│   ├── app.js          # Express wiring
│   ├── server.js       # listen() — only file that binds a port
│   ├── models/         # Joi schemas + enums
│   ├── repositories/   # in-memory ticket store
│   ├── routes/         # /tickets endpoints
│   ├── parsers/        # csv / json / xml parsers (pure functions)
│   ├── classification/ # keyword scoring + audit log
│   └── errors/         # typed errors mapped to HTTP codes
├── tests/              # 9 test files, 90 tests
│   ├── fixtures/       # sample CSV/JSON/XML files (also serve as deliverable sample data)
│   └── setup.js        # global afterEach: clears repo + classification log
├── docs/screenshots/   # required + supporting screenshots
├── coverage/           # generated by npm run test:coverage (gitignored)
└── jest.config.js      # 85% coverage threshold gate
```

## Troubleshooting

### `Error: listen EADDRINUSE: address already in use :::3000`

Another process is using port 3000. Either kill it:

```bash
lsof -ti:3000 | xargs kill -9
```

…or run on a different port:

```bash
PORT=4000 npm run dev
```

### `Cannot find module 'jest'` or similar

You skipped `npm install`, or it failed midway. Re-run from the `homework-2/` directory:

```bash
rm -rf node_modules package-lock.json
npm install
```

### Tests fail with `SyntaxError: Unexpected token 'export'` from `uuid`

You're on a version of `uuid` that ships ESM-only. Make sure `package.json` lists `"uuid": "^9.0.0"` (CJS-compatible). Reinstall if needed:

```bash
npm install uuid@9
npm test
```

### Coverage threshold fails

If `npm run test:coverage` reports a drop below 85% on any axis, the failing axis prints in the terminal output (`Jest: Coverage for branches (X%) does not meet "global" threshold (85%)`). Investigate which file contributed the regression by opening `coverage/lcov-report/index.html` and looking at the per-file row colors — yellow/red rows are the ones to add tests for.

### A specific test fails non-deterministically

Almost always means a test forgot to use the global `afterEach` cleanup and is leaking state. Run:

```bash
npx jest --runInBand
```

If that makes it pass, you have a state-isolation issue in one of the tests. The fix is to ensure the failing test starts from a clean repo (which `tests/setup.js` already does globally — don't override it).

## Where to go next

| If you want to... | Read |
|---|---|
| Understand the system design | `ARCHITECTURE.md` |
| Use the API as a client | `API_REFERENCE.md` |
| Run more thorough manual checks | `TESTING_GUIDE.md` (31-row checklist) |
| See what was implemented and why | `PLAN.md` (step-by-step ticked) |
| See the assignment spec | `TASKS.md` |
