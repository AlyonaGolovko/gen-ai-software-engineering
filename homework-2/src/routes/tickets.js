const express = require('express');
const Joi = require('joi');

const repo = require('../repositories/ticketRepository');
const {
  createTicketSchema,
  updateTicketSchema,
  validate,
} = require('../models/ticketSchema');
const {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  SOURCES,
} = require('../models/enums');

const router = express.Router();

const idParamSchema = Joi.string().uuid({ version: 'uuidv4' });

const listQuerySchema = Joi.object({
  category: Joi.string().valid(...CATEGORIES),
  priority: Joi.string().valid(...PRIORITIES),
  status: Joi.string().valid(...STATUSES),
  customer_id: Joi.string(),
  source: Joi.string().valid(...SOURCES),
  limit: Joi.number().integer().min(1).max(500).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

function isTruthyFlag(value) {
  if (value === true) return true;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

router.get('/', (req, res) => {
  const { value, error } = validate(req.query, listQuerySchema);
  if (error) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details.map((d) => d.message),
    });
  }

  const { data, total } = repo.findAll(value);
  res.status(200).json({
    data,
    total,
    limit: value.limit,
    offset: value.offset,
  });
});

router.get('/:id', (req, res) => {
  const { error } = idParamSchema.validate(req.params.id);
  if (error) {
    return res.status(400).json({
      error: 'Validation failed',
      details: ['"id" must be a valid UUID'],
    });
  }

  const ticket = repo.findById(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  res.status(200).json(ticket);
});

router.post('/', (req, res) => {
  const autoClassify = isTruthyFlag(req.query.auto_classify) || isTruthyFlag(req.body?.auto_classify);

  const body = { ...req.body };
  delete body.auto_classify;

  const { value, error } = validate(body, createTicketSchema);
  if (error) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details.map((d) => d.message),
    });
  }

  const payload = {
    assigned_to: null,
    tags: [],
    resolved_at: null,
    ...value,
  };

  if (!payload.priority && !autoClassify) {
    payload.priority = 'medium';
  }

  // Auto-classify hook wired in Step 2.8 — placeholder, no-op for now.
  // if (autoClassify) { ...run classifier, merge with manual-override precedence... }

  const ticket = repo.create(payload);

  res.status(201).location(`/tickets/${ticket.id}`).json(ticket);
});

router.put('/:id', (req, res) => {
  const { error: idError } = idParamSchema.validate(req.params.id);
  if (idError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: ['"id" must be a valid UUID'],
    });
  }

  const { value, error } = validate(req.body ?? {}, updateTicketSchema);
  if (error) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details.map((d) => d.message),
    });
  }

  const updated = repo.update(req.params.id, value);
  if (!updated) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  res.status(200).json(updated);
});

router.delete('/:id', (req, res) => {
  const { error } = idParamSchema.validate(req.params.id);
  if (error) {
    return res.status(400).json({
      error: 'Validation failed',
      details: ['"id" must be a valid UUID'],
    });
  }

  const removed = repo.delete(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  res.status(204).send();
});

module.exports = router;
