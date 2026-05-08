const { parse } = require('csv-parse/sync');

const { ParseError } = require('../errors');

function normalizeRow(row) {
  const ticket = {};
  const metadata = {};

  for (const [key, raw] of Object.entries(row)) {
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (key.startsWith('metadata.')) {
      const subKey = key.slice('metadata.'.length);
      if (value !== '') metadata[subKey] = value;
      continue;
    }
    if (key === 'tags') {
      ticket.tags = value === '' ? [] : value.split('|').map((t) => t.trim()).filter(Boolean);
      continue;
    }
    if (value === '') continue;
    ticket[key] = value;
  }

  if (Object.keys(metadata).length > 0) ticket.metadata = metadata;
  return ticket;
}

function parseCsv(buffer) {
  let rows;
  try {
    rows = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    throw new ParseError(`Malformed CSV: ${err.message}`);
  }
  return rows.map(normalizeRow);
}

module.exports = { parseCsv };
