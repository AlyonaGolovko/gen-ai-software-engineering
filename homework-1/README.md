# Homework 1: Banking Transactions API

> **Student Name**: Alona Holovko
> **Date Submitted**: 2026-04-27
> **AI Tools Used**: Claude Code (Claude Opus 4.6)

---

## Project Overview

A REST API for managing banking transactions, built with Node.js and Express. The API supports creating transactions, listing and filtering them, checking account balances and summaries, exporting to CSV, and rate limiting.

## Features Implemented

| Task | Feature             | Description                                                                        |
| ---- | ------------------- | ---------------------------------------------------------------------------------- |
| 1    | Core API            | 4 endpoints: create transaction, list all, get by ID, get balance                  |
| 2    | Validation          | Amount (positive, max 2 decimals), account format (ACC-XXXXX), currency (ISO 4217) |
| 3    | Transaction History | Filter by accountId, type, and date range. Filters can be combined                 |
| 4    | Account Summary     | Total deposits, withdrawals, transaction count, most recent transaction date       |
| 5    | CSV Export          | Export transactions as CSV with same filtering support                             |
| 6    | Rate Limiting       | 100 requests per minute per IP, returns 429 when exceeded                          |

## API Endpoints

| Method | Endpoint                       | Description                                   |
| ------ | ------------------------------ | --------------------------------------------- |
| POST   | `/transactions`                | Create a new transaction                      |
| GET    | `/transactions`                | List all transactions (with optional filters) |
| GET    | `/transactions/:id`            | Get a transaction by ID                       |
| GET    | `/transactions/export`         | Export transactions as CSV                    |
| GET    | `/accounts/:accountId/balance` | Get account balance                           |
| GET    | `/accounts/:accountId/summary` | Get account summary                           |

## Architecture Decisions

- **In-memory storage** — transactions are stored in a plain JavaScript array. No database setup required. Data resets when the server restarts.
- **Express.js** — standard Node.js web framework for REST APIs.
- **uuid** — generates unique transaction IDs.
- **currency-codes** — validates ISO 4217 currency codes instead of maintaining a hardcoded list.
- **express-rate-limit** — handles rate limiting per IP address.

## Project Structure

```
homework-1/
├── README.md
├── HOWTORUN.md
├── package.json
├── src/
│   ├── index.js              # Express app setup, rate limiter
│   ├── routes/
│   │   └── transactions.js   # All route handlers + filtering logic
│   ├── models/
│   │   └── transaction.js    # In-memory store + helper functions
│   └── validators/
│       └── transaction.js    # Validation rules
├── demo/
│   ├── run.sh                # Script to start the app
│   ├── sample-requests.http  # Sample API calls
│   └── sample-data.json      # Example transaction data
└── docs/
    └── screenshots/
```

## AI Tools Used

**Claude Code (CLI)** was used throughout the entire development process:

- **Project setup** — initialized the project with a `CLAUDE.md` file containing repository structure, coding conventions, and homework requirements so Claude has context for tasks
- **Planning** — before each task, Claude prepared a plan divided into steps by logic (e.g. one validation rule per step, one filter per step) rather than by files, making it easier to review and test each change

**Examples of correcting Claude:**

- **Validation structure** — Claude's initial plan placed all validation logic inline in the route handler. After reviewing the plan, I asked Claude to extract it into a separate `validators/` module.
- **Currency validation** — Claude initially hardcoded a list of currencies as a constant. After reverting the change and refining the prompt to specify using an npm package, Claude used the `currency-codes` library instead — a more robust and maintainable solution.

All generated code was reviewed, tested manually with curl before moving on.

## How to Run

See [HOWTORUN.md](./HOWTORUN.md) for detailed setup instructions and test cases.

Quick start:

```bash
cd homework-1
npm install
npm start
```

---

<div align="center">

_This project was completed as part of the AI-Assisted Development course._

</div>
