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
const { classifyCategory } = require('../classification/categoryClassifier');
const { classifyPriority } = require('../classification/priorityClassifier');
const { computeConfidence, aggregateConfidence } = require('../classification/confidence');
const { buildReasoning } = require('../classification/reasoning');
const classificationLog = require('../classification/classificationLog');

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

// Runs both classifiers, computes aggregate confidence, and applies
// per-axis manual-override precedence. Returns the patched payload to persist
// and the log entry to record. Used by POST /tickets (single create) and
// POST /tickets/import (per-row, when ?auto_classify=true).
function buildAutoClassifyResult(validated) {
  const categoryResult = classifyCategory({
    subject: validated.subject,
    description: validated.description,
  });
  const priorityResult = classifyPriority({
    subject: validated.subject,
    description: validated.description,
  });
  const catConf = computeConfidence(categoryResult.matchedKeywords);
  const priConf = computeConfidence(priorityResult.matchedKeywords);
  const confidence = Number(aggregateConfidence(catConf, priConf).toFixed(2));
  const reasoning = buildReasoning(categoryResult, priorityResult);

  const manualCategory = validated.category !== undefined;
  const manualPriority = validated.priority !== undefined;
  const isOverride = manualCategory || manualPriority;

  const patch = {};
  if (!manualCategory) patch.category = categoryResult.category;
  if (!manualPriority) patch.priority = priorityResult.priority;
  patch.classification_confidence = isOverride ? null : confidence;
  patch.classified_at = new Date().toISOString();

  const logEntry = {
    category: categoryResult.category,
    priority: priorityResult.priority,
    confidence,
    keywords: {
      category: categoryResult.matchedKeywords,
      priority: priorityResult.matchedKeywords,
    },
    reasoning,
    source: isOverride ? 'manual_override' : 'auto_create',
  };

  return { patch, logEntry };
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

  const autoClassify = isTruthyFlag(req.query.auto_classify);
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

      let pendingLogEntry = null;
      if (autoClassify) {
        const { patch, logEntry } = buildAutoClassifyResult(value);
        Object.assign(payload, patch);
        pendingLogEntry = logEntry;
      } else if (!payload.priority) {
        payload.priority = 'medium';
      }

      const ticket = repo.create(payload);
      successfulIds.push(ticket.id);

      if (pendingLogEntry) {
        classificationLog.record({ ...pendingLogEntry, ticket_id: ticket.id });
      }
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

  let pendingLogEntry = null;

  if (autoClassify) {
    const { patch, logEntry } = buildAutoClassifyResult(value);
    Object.assign(payload, patch);
    pendingLogEntry = logEntry;
  } else if (!payload.priority) {
    payload.priority = 'medium';
  }

  const ticket = repo.create(payload);

  if (pendingLogEntry) {
    classificationLog.record({ ...pendingLogEntry, ticket_id: ticket.id });
  }

  res.status(201).location(`/tickets/${ticket.id}`).json(ticket);
});

router.put('/:id', (req, res) => {
  assertUuid(req.params.id);

  const { value, error } = validate(req.body ?? {}, updateTicketSchema);
  if (error) {
    throw new ValidationError('Validation failed', error.details.map((d) => d.message));
  }

  const existing = repo.findById(req.params.id);
  if (!existing) throw new NotFoundError('Ticket not found');

  const overridingCategory =
    value.category !== undefined && value.category !== existing.category;
  const overridingPriority =
    value.priority !== undefined && value.priority !== existing.priority;
  const isOverride = overridingCategory || overridingPriority;

  const patch = { ...value };
  if (isOverride) patch.classification_confidence = null;

  const updated = repo.update(req.params.id, patch);
  if (!updated) throw new NotFoundError('Ticket not found');

  if (isOverride) {
    const parts = [];
    if (overridingCategory) {
      parts.push(`category '${existing.category ?? 'null'}' → '${updated.category}'`);
    }
    if (overridingPriority) {
      parts.push(`priority '${existing.priority ?? 'null'}' → '${updated.priority}'`);
    }
    const prevConf = existing.classification_confidence ?? null;
    const reasoning =
      `Manual override on update: ${parts.join('; ')}. ` +
      `Previous classification_confidence: ${prevConf === null ? 'null' : prevConf}.`;

    classificationLog.record({
      ticket_id: req.params.id,
      category: updated.category,
      priority: updated.priority,
      confidence: null,
      keywords: null,
      reasoning,
      source: 'manual_override',
    });
  }

  res.status(200).json(updated);
});

router.post('/:id/auto-classify', (req, res) => {
  assertUuid(req.params.id);

  const ticket = repo.findById(req.params.id);
  if (!ticket) throw new NotFoundError('Ticket not found');

  const categoryResult = classifyCategory({
    subject: ticket.subject,
    description: ticket.description,
  });
  const priorityResult = classifyPriority({
    subject: ticket.subject,
    description: ticket.description,
  });

  const categoryConfidence = computeConfidence(categoryResult.matchedKeywords);
  const priorityConfidence = computeConfidence(priorityResult.matchedKeywords);
  const confidence = Number(
    aggregateConfidence(categoryConfidence, priorityConfidence).toFixed(2),
  );

  const reasoning = buildReasoning(categoryResult, priorityResult);
  const classifiedAt = new Date().toISOString();

  repo.update(req.params.id, {
    category: categoryResult.category,
    priority: priorityResult.priority,
    classification_confidence: confidence,
    classified_at: classifiedAt,
  });

  const matchedKeywords = {
    category: categoryResult.matchedKeywords,
    priority: priorityResult.matchedKeywords,
  };

  classificationLog.record({
    ticket_id: req.params.id,
    category: categoryResult.category,
    priority: priorityResult.priority,
    confidence,
    keywords: matchedKeywords,
    reasoning,
    source: 'auto_classify_endpoint',
  });

  res.status(200).json({
    ticket_id: req.params.id,
    category: categoryResult.category,
    priority: priorityResult.priority,
    confidence,
    reasoning,
    matched_keywords: matchedKeywords,
  });
});

router.delete('/:id', (req, res) => {
  assertUuid(req.params.id);
  const removed = repo.delete(req.params.id);
  if (!removed) throw new NotFoundError('Ticket not found');
  res.status(204).send();
});

module.exports = router;
