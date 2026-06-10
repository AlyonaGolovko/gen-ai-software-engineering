# Sample data

Deliverable sample files for the homework-2 submission (TASKS.md §Deliverables).

| File | Tickets | Source |
| --- | --- | --- |
| `sample_tickets.csv` | 50 | copy of `tests/fixtures/valid_tickets.csv` |
| `sample_tickets.json` | 20 | copy of `tests/fixtures/valid_tickets.json` |
| `sample_tickets.xml` | 30 | copy of `tests/fixtures/valid_tickets.xml` |
| `invalid_tickets.csv` | 10 (one defect per row) | copy of `tests/fixtures/invalid_tickets.csv` |

**Single source of truth lives in `tests/fixtures/`.** If the schema changes, regenerate there and re-copy here — don't edit these files directly.

## Trying them out

With the server running (`npm run dev`):

```bash
# 50 valid CSV tickets
curl -X POST http://localhost:3000/tickets/import \
  -F 'file=@sample_data/sample_tickets.csv;type=text/csv'

# Same with auto-classification
curl -X POST 'http://localhost:3000/tickets/import?auto_classify=true' \
  -F 'file=@sample_data/sample_tickets.json;type=application/json'

# Negative path: every row should fail validation
curl -X POST http://localhost:3000/tickets/import \
  -F 'file=@sample_data/invalid_tickets.csv;type=text/csv'
```

See `API_REFERENCE.md` for the full bulk-import contract.
