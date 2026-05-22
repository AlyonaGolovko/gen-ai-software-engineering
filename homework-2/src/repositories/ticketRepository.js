const { v4: uuidv4 } = require('uuid');

const store = new Map();

function nowIso() {
  return new Date().toISOString();
}

function clone(ticket) {
  return JSON.parse(JSON.stringify(ticket));
}

function create(ticketData) {
  const ts = nowIso();
  const ticket = {
    id: uuidv4(),
    created_at: ts,
    updated_at: ts,
    status: 'new',
    priority: null,
    category: null,
    assigned_to: null,
    tags: [],
    metadata: null,
    resolved_at: null,
    classification_confidence: null,
    classified_at: null,
    ...ticketData,
  };
  if (ticket.status === 'resolved' && !ticket.resolved_at) {
    ticket.resolved_at = ts;
  }
  store.set(ticket.id, ticket);
  return clone(ticket);
}

function matchesFilters(ticket, filters) {
  if (filters.category && ticket.category !== filters.category) return false;
  if (filters.priority && ticket.priority !== filters.priority) return false;
  if (filters.status && ticket.status !== filters.status) return false;
  if (filters.customer_id && ticket.customer_id !== filters.customer_id) return false;
  if (filters.source && ticket.metadata?.source !== filters.source) return false;
  return true;
}

function findAll(filters = {}) {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const all = Array.from(store.values()).filter((t) => matchesFilters(t, filters));
  all.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const total = all.length;
  const data = all.slice(offset, offset + limit).map(clone);
  return { data, total };
}

function findById(id) {
  const ticket = store.get(id);
  return ticket ? clone(ticket) : null;
}

function update(id, patch) {
  const existing = store.get(id);
  if (!existing) return null;

  const prevStatus = existing.status;
  const merged = { ...existing, ...patch, updated_at: nowIso() };

  if (patch.status === 'resolved' && prevStatus !== 'resolved') {
    merged.resolved_at = nowIso();
  } else if (patch.status && patch.status !== 'resolved' && prevStatus === 'resolved') {
    merged.resolved_at = null;
  }

  store.set(id, merged);
  return clone(merged);
}

function remove(id) {
  return store.delete(id);
}

function clear() {
  store.clear();
}

module.exports = {
  create,
  findAll,
  findById,
  update,
  delete: remove,
  clear,
};
