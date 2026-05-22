const CATEGORIES = [
  'account_access',
  'technical_issue',
  'billing_question',
  'feature_request',
  'bug_report',
  'other',
];

const PRIORITIES = ['urgent', 'high', 'medium', 'low'];

const STATUSES = ['new', 'in_progress', 'waiting_customer', 'resolved', 'closed'];

const SOURCES = ['web_form', 'email', 'api', 'chat', 'phone'];

const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'];

module.exports = {
  CATEGORIES,
  PRIORITIES,
  STATUSES,
  SOURCES,
  DEVICE_TYPES,
};
