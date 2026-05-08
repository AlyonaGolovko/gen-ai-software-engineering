const express = require('express');
const Joi = require('joi');
const multer = require('multer');

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
const { parseCsv } = require('../parsers/csvParser');
const { parseJson } = require('../parsers/jsonParser');
const { parseXml } = require('../parsers/xmlParser');
const {
  ValidationError,
  NotFoundError,
  UnsupportedMediaTypeError,
} = require('../errors');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadSingleFile = upload.single('file');

function detectFormat(file) {
  const mime = (file.mimetype || '').toLowerCase();
  if (mime === 'text/csv' || mime === 'application/csv') return 'csv';
  if (mime === 'application/json') return 'json';
  if (mime === 'application/xml' || mime === 'text/xml') return 'xml';

  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.xml')) return 'xml';
  return null;
}

async function runParser(format, buffer) {
  if (format === 'csv') return parseCsv(buffer);
  if (format === 'json') return parseJson(buffer);
  return parseXml(buffer);
}

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

function assertUuid(id) {
  const { error } = idParamSchema.validate(id);
  if (error) {
    throw new ValidationError('Validation failed', ['"id" must be a valid UUID']);
  }
}

router.get('/', (req, res) => {
  const { value, error } = validate(req.query, listQuerySchema);
  if (error) {
    throw new ValidationError('Validation failed', error.details.map((d) => d.message));
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
  assertUuid(req.params.id);
  const ticket = repo.findById(req.params.id);
  if (!ticket) throw new NotFoundError('Ticket not found');
  res.status(200).json(ticket);
});

router.post('/import', uploadSingleFile, async (req, res) => {
  if (!req.file) {
    throw new ValidationError('Missing file field');
  }

  const format = detectFormat(req.file);
  if (!format) {
    throw new UnsupportedMediaTypeError();
  }

  const records = await runParser(format, req.file.buffer);

  const successfulIds = [];
  const errors = [];

  records.forEach((record, index) => {
    try {
      const { value, error } = validate(record, createTicketSchema);
      if (error) {
        errors.push({
          index,
          errors: error.details.map((d) => d.message),
          record,
        });
        return;
      }
      const payload = {
        assigned_to: null,
        tags: [],
        resolved_at: null,
        ...value,
      };
      if (!payload.priority) payload.priority = 'medium';
      const ticket = repo.create(payload);
      successfulIds.push(ticket.id);
    } catch (err) {
      errors.push({ index, errors: [err.message], record });
    }
  });

  const summary = {
    total: records.length,
    successful: successfulIds.length,
    failed: errors.length,
    successful_ids: successfulIds,
    errors,
  };

  const status = records.length > 0 && summary.successful === 0 ? 400 : 200;
  res.status(status).json(summary);
});

router.post('/', (req, res) => {
  const autoClassify =
    isTruthyFlag(req.query.auto_classify) || isTruthyFlag(req.body?.auto_classify);

  const body = { ...req.body };
  delete body.auto_classify;

  const { value, error } = validate(body, createTicketSchema);
  if (error) {
    throw new ValidationError('Validation failed', error.details.map((d) => d.message));
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
  assertUuid(req.params.id);

  const { value, error } = validate(req.body ?? {}, updateTicketSchema);
  if (error) {
    throw new ValidationError('Validation failed', error.details.map((d) => d.message));
  }

  const updated = repo.update(req.params.id, value);
  if (!updated) throw new NotFoundError('Ticket not found');
  res.status(200).json(updated);
});

router.delete('/:id', (req, res) => {
  assertUuid(req.params.id);
  const removed = repo.delete(req.params.id);
  if (!removed) throw new NotFoundError('Ticket not found');
  res.status(204).send();
});

module.exports = router;
