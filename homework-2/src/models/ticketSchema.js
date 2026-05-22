const Joi = require('joi');
const {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  SOURCES,
  DEVICE_TYPES,
} = require('./enums');

const metadataSchema = Joi.object({
  source: Joi.string().valid(...SOURCES),
  browser: Joi.string(),
  device_type: Joi.string().valid(...DEVICE_TYPES),
});

// Server-managed: silently dropped from incoming payloads. Defined here so
// the schema documents the field exists and is owned by the server (Step 2.10).
const SERVER_MANAGED = {
  classification_confidence: Joi.any().strip(),
  classified_at: Joi.any().strip(),
};

const createTicketSchema = Joi.object({
  customer_id: Joi.string().min(1).required(),
  customer_email: Joi.string().email().required(),
  customer_name: Joi.string().min(1).max(100).required(),
  subject: Joi.string().min(1).max(200).required(),
  description: Joi.string().min(10).max(2000).required(),
  category: Joi.string().valid(...CATEGORIES),
  priority: Joi.string().valid(...PRIORITIES),
  status: Joi.string().valid(...STATUSES).default('new'),
  assigned_to: Joi.string().allow(null),
  tags: Joi.array().items(Joi.string()).default([]),
  metadata: metadataSchema,
  ...SERVER_MANAGED,
});

const updateTicketSchema = Joi.object({
  customer_id: Joi.string().min(1),
  customer_email: Joi.string().email(),
  customer_name: Joi.string().min(1).max(100),
  subject: Joi.string().min(1).max(200),
  description: Joi.string().min(10).max(2000),
  category: Joi.string().valid(...CATEGORIES),
  priority: Joi.string().valid(...PRIORITIES),
  status: Joi.string().valid(...STATUSES),
  assigned_to: Joi.string().allow(null),
  tags: Joi.array().items(Joi.string()),
  metadata: metadataSchema,
  resolved_at: Joi.date().iso().allow(null),
  ...SERVER_MANAGED,
})
  .min(1)
  .messages({ 'object.min': 'No fields to update' });

function validate(payload, schema) {
  const { value, error } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
  return { value, error };
}

module.exports = {
  createTicketSchema,
  updateTicketSchema,
  validate,
};
