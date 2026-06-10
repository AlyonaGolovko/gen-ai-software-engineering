const MAX_ENTRIES = 10_000;
const VALID_SOURCES = new Set([
  'auto_create',
  'auto_classify_endpoint',
  'manual_override',
]);

const entries = [];

function record({
  ticket_id,
  category,
  priority,
  confidence,
  keywords,
  reasoning,
  source,
}) {
  if (!VALID_SOURCES.has(source)) {
    throw new Error(`Invalid classification log source: ${source}`);
  }
  const entry = {
    ticket_id,
    category: category ?? null,
    priority: priority ?? null,
    confidence: confidence ?? null,
    keywords: keywords ?? null,
    reasoning: reasoning ?? null,
    source,
    timestamp: new Date().toISOString(),
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  return entry;
}

function getAll() {
  return entries.map((e) => ({ ...e }));
}

function getByTicketId(ticket_id) {
  return entries.filter((e) => e.ticket_id === ticket_id).map((e) => ({ ...e }));
}

function clear() {
  entries.length = 0;
}

module.exports = {
  record,
  getAll,
  getByTicketId,
  clear,
  MAX_ENTRIES,
};
