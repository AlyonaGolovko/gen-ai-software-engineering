# How to Run the Application

## Prerequisites

- Node.js 18 or higher

## Setup and Start

```bash
cd homework-1
npm install
npm start
```

The server runs on `http://localhost:3000`. Keep this terminal open and use a **second terminal** for the test commands below.

---

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/transactions` | Create a new transaction |
| GET | `/transactions` | List all transactions (with optional filters) |
| GET | `/transactions/:id` | Get a single transaction by ID |
| GET | `/transactions/export` | Export transactions as CSV |
| GET | `/accounts/:accountId/balance` | Get the balance for an account |
| GET | `/accounts/:accountId/summary` | Get account summary |

---

## Test Cases

### Task 1: Core API

#### 1.1 Create a transfer

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100.50,"currency":"USD","type":"transfer"}'
```

**Expected:** 201 status. Returns the transaction with auto-generated `id`, `timestamp`, and `status: "completed"`.

#### 1.2 Create a second transaction

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-67890","toAccount":"ACC-11111","amount":50.00,"currency":"EUR","type":"transfer"}'
```

**Expected:** 201 status.

#### 1.3 List all transactions

```bash
curl http://localhost:3000/transactions
```

**Expected:** An array with 2 transactions.

#### 1.4 Get a transaction by ID

Replace `<id>` with the `id` from test 1.1.

```bash
curl http://localhost:3000/transactions/<id>
```

**Expected:** The single transaction object.

#### 1.5 Get balance for ACC-12345

ACC-12345 sent 100.50 and received nothing.

```bash
curl http://localhost:3000/accounts/ACC-12345/balance
```

**Expected:** `{"accountId":"ACC-12345","balance":-100.5}`

#### 1.6 Get balance for ACC-67890

ACC-67890 received 100.50, then sent 50.00.

```bash
curl http://localhost:3000/accounts/ACC-67890/balance
```

**Expected:** `{"accountId":"ACC-67890","balance":50.5}`

#### 1.7 Transaction not found

```bash
curl http://localhost:3000/transactions/nonexistent
```

**Expected:** 404. `{"error":"Transaction not found"}`

---

### Task 2: Validation

#### 2.1 Missing required fields

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345"}'
```

**Expected:** 400. `{"errors":["Missing required fields: fromAccount, toAccount, amount, currency, type"]}`

#### 2.2 Negative amount

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":-10,"currency":"USD","type":"transfer"}'
```

**Expected:** 400. `{"errors":["amount must be a positive number"]}`

#### 2.3 Too many decimal places

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100.123,"currency":"USD","type":"transfer"}'
```

**Expected:** 400. `{"errors":["amount must have at most 2 decimal places"]}`

#### 2.4 Invalid account format

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"INVALID","toAccount":"ACC-67890","amount":100.50,"currency":"USD","type":"transfer"}'
```

**Expected:** 400. `{"errors":["fromAccount must follow format ACC-XXXXX (X is alphanumeric)"]}`

#### 2.5 Both accounts invalid (multiple errors)

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"123","toAccount":"456","amount":100.50,"currency":"USD","type":"transfer"}'
```

**Expected:** 400. `{"errors":["fromAccount must follow format ACC-XXXXX (X is alphanumeric)","toAccount must follow format ACC-XXXXX (X is alphanumeric)"]}`

#### 2.6 Invalid currency

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100.50,"currency":"FAKE","type":"transfer"}'
```

**Expected:** 400. `{"errors":["currency must be a valid ISO 4217 code (e.g. USD, EUR, GBP)"]}`

---

### Task 3: Transaction History (Filters)

#### 3.1 Filter by accountId

First create a transaction with different accounts:

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-11111","toAccount":"ACC-22222","amount":50.00,"currency":"EUR","type":"transfer"}'
```

Then filter:

```bash
curl "http://localhost:3000/transactions?accountId=ACC-12345"
```

**Expected:** Only transactions where ACC-12345 is the sender or receiver.

#### 3.2 Filter by type

Create a deposit:

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":25.00,"currency":"USD","type":"deposit"}'
```

Then filter:

```bash
curl "http://localhost:3000/transactions?type=transfer"
```

**Expected:** Only transactions with `"type":"transfer"`. The deposit is excluded.

#### 3.3 Filter by date range

```bash
curl "http://localhost:3000/transactions?from=2026-04-27&to=2026-04-27"
```

**Expected:** Only transactions created on 2026-04-27. Adjust dates to match when you're testing.

#### 3.4 Filter with only `from`

```bash
curl "http://localhost:3000/transactions?from=2026-04-27"
```

**Expected:** All transactions on or after 2026-04-27.

#### 3.5 Combine multiple filters

```bash
curl "http://localhost:3000/transactions?accountId=ACC-12345&type=transfer&from=2026-04-27&to=2026-04-27"
```

**Expected:** Only transfers involving ACC-12345 on 2026-04-27.

---

### Task 4: Account Summary

#### 4.1 Create test data and check summary for ACC-12345

ACC-12345 sends 100 twice, receives 50 once.

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100,"currency":"USD","type":"transfer"}'

curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100,"currency":"USD","type":"transfer"}'

curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-67890","toAccount":"ACC-12345","amount":50,"currency":"USD","type":"transfer"}'

curl http://localhost:3000/accounts/ACC-12345/summary
```

**Expected:** `{"accountId":"ACC-12345","totalDeposits":50,"totalWithdrawals":200,"transactionCount":3,"mostRecentTransaction":"2026-04-27T..."}`

#### 4.2 Check summary for ACC-67890

ACC-67890 receives 100 twice, sends 50 once.

```bash
curl http://localhost:3000/accounts/ACC-67890/summary
```

**Expected:** `{"accountId":"ACC-67890","totalDeposits":200,"totalWithdrawals":50,"transactionCount":3,"mostRecentTransaction":"2026-04-27T..."}`

---

### Task 5: CSV Export

#### 5.1 Export all transactions as CSV

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100.50,"currency":"USD","type":"transfer"}'

curl http://localhost:3000/transactions/export
```

**Expected:**
```
id,fromAccount,toAccount,amount,currency,type,status,timestamp
<uuid>,ACC-12345,ACC-67890,100.5,USD,transfer,completed,2026-04-27T...
```

#### 5.2 Export filtered transactions

```bash
curl "http://localhost:3000/transactions/export?accountId=ACC-12345"
```

**Expected:** CSV with only rows where ACC-12345 is sender or receiver.

#### 5.3 Download CSV as a file

```bash
curl http://localhost:3000/transactions/export -o transactions.csv
```

**Expected:** A `transactions.csv` file is created in your current folder.

---

### Task 6: Rate Limiting

#### 6.1 Trigger 429 Too Many Requests

```bash
for i in $(seq 1 101); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/transactions; done
```

**Expected:** The first 100 requests return `200`. The 101st returns `429`.

---

## Stop the Server

Press `Ctrl+C` in the terminal where the server is running.
