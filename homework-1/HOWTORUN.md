# How to Run the application

## What this API does

A REST API for banking transactions. You can create transactions between accounts, list them, look up a specific one, and check account balances. Data is stored in memory (no database) — it resets when the server stops.

## Endpoints summary

| # | Method | Endpoint | What it does |
|---|--------|----------|-------------|
| 1 | POST | `/transactions` | Create a new transaction |
| 2 | GET | `/transactions` | List all transactions |
| 3 | GET | `/transactions/:id` | Get a single transaction by ID |
| 4 | GET | `/accounts/:accountId/balance` | Get the balance for an account |

## Prerequisites

- Node.js 18 or higher

## Setup and start

```bash
cd homework-1
npm install
npm start
```

The server runs on `http://localhost:3000`. Keep this terminal open and use a second terminal for the test commands below.

## Test cases

### 1. Create a transfer (POST)

**What:** Sends 100.50 USD from ACC-12345 to ACC-67890.
**Request type:** POST with JSON body.

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100.50,"currency":"USD","type":"transfer"}'
```

**Expected:** 201 status. Returns the transaction with auto-generated `id`, `timestamp`, and `status: "completed"`.

### 2. Create a second transaction (POST)

**What:** Sends 50.00 EUR from ACC-67890 to ACC-11111.

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-67890","toAccount":"ACC-11111","amount":50.00,"currency":"EUR","type":"transfer"}'
```

**Expected:** 201 status. A second transaction is created.

### 3. List all transactions (GET)

**What:** Returns all transactions created so far.

```bash
curl http://localhost:3000/transactions
```

**Expected:** An array with 2 transactions (from tests 1 and 2).

### 4. Get a transaction by ID (GET)

**What:** Looks up a single transaction. Replace `<id>` with the `id` from test 1.

```bash
curl http://localhost:3000/transactions/<id>
```

**Expected:** The single transaction object.

### 5. Get balance for ACC-12345 (GET)

**What:** ACC-12345 sent 100.50 in test 1 and received nothing.

```bash
curl http://localhost:3000/accounts/ACC-12345/balance
```

**Expected:** `{"accountId":"ACC-12345","balance":-100.5}`

### 6. Get balance for ACC-67890 (GET)

**What:** ACC-67890 received 100.50 in test 1, then sent 50.00 in test 2.

```bash
curl http://localhost:3000/accounts/ACC-67890/balance
```

**Expected:** `{"accountId":"ACC-67890","balance":50.5}`

### 7. Error: missing fields (POST)

**What:** Try to create a transaction with missing required fields.

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345"}'
```

**Expected:** 400 status. `{"errors":["Missing required fields: fromAccount, toAccount, amount, currency, type"]}`

### 8. Error: invalid amount (POST)

**What:** Try to create a transaction with a negative amount.

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":-10,"currency":"USD","type":"transfer"}'
```

**Expected:** 400 status. `{"errors":["amount must be a positive number"]}`

### 9. Error: too many decimal places (POST)

**What:** Try to create a transaction with 3 decimal places.

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100.123,"currency":"USD","type":"transfer"}'
```

**Expected:** 400 status. `{"errors":["amount must have at most 2 decimal places"]}`

### 10. Error: invalid fromAccount format (POST)

**What:** Try to create a transaction with an invalid fromAccount.

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"INVALID","toAccount":"ACC-67890","amount":100.50,"currency":"USD","type":"transfer"}'
```

**Expected:** 400 status. `{"errors":["fromAccount must follow format ACC-XXXXX (X is alphanumeric)"]}`

### 11. Error: both accounts invalid (POST)

**What:** Both accounts have wrong format. Multiple errors returned at once.

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"123","toAccount":"456","amount":100.50,"currency":"USD","type":"transfer"}'
```

**Expected:** 400 status. `{"errors":["fromAccount must follow format ACC-XXXXX (X is alphanumeric)","toAccount must follow format ACC-XXXXX (X is alphanumeric)"]}`

### 12. Error: invalid currency (POST)

**What:** Try to create a transaction with a fake currency code.

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100.50,"currency":"FAKE","type":"transfer"}'
```

**Expected:** 400 status. `{"errors":["currency must be a valid ISO 4217 code (e.g. USD, EUR, GBP)"]}`

### 13. Filter by accountId (GET)

**What:** First create two transactions with different accounts, then filter by one.

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-11111","toAccount":"ACC-22222","amount":50.00,"currency":"EUR","type":"transfer"}'
```

```bash
curl "http://localhost:3000/transactions?accountId=ACC-12345"
```

**Expected:** Only transactions where ACC-12345 is the sender or receiver. Does not include the ACC-11111/ACC-22222 transaction.

### 14. Filter by type (GET)

**What:** Create a deposit, then filter by type to see only transfers.

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":25.00,"currency":"USD","type":"deposit"}'
```

```bash
curl "http://localhost:3000/transactions?type=transfer"
```

**Expected:** Only transactions with `"type":"transfer"`. The deposit is excluded.

### 15. Filter by date range (GET)

**What:** Filter transactions created today only.

```bash
curl "http://localhost:3000/transactions?from=2026-04-24&to=2026-04-24"
```

**Expected:** Only transactions with timestamps on 2026-04-24. Adjust the dates to match when you're testing.

### 16. Filter with only `from` (GET)

**What:** Get all transactions from a date onwards.

```bash
curl "http://localhost:3000/transactions?from=2026-04-24"
```

**Expected:** All transactions on or after 2026-04-24.

### 17. Combine multiple filters (GET)

**What:** Filter by accountId, type, and date range at the same time.

```bash
curl "http://localhost:3000/transactions?accountId=ACC-12345&type=transfer&from=2026-04-24&to=2026-04-24"
```

**Expected:** Only transfers involving ACC-12345 on 2026-04-24.

### 18. Error: transaction not found (GET)

**What:** Try to get a transaction with a fake ID.

```bash
curl http://localhost:3000/transactions/nonexistent
```

**Expected:** 404 status. `{"error":"Transaction not found"}`

## Stop the server

Press `Ctrl+C` in the terminal where the server is running.
