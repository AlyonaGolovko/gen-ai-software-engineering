const CATEGORY_KEYWORDS = {
  account_access: [
    'login',
    'log in',
    'password',
    'reset password',
    '2fa',
    'two-factor',
    'locked out',
    'sign in',
    'authentication',
  ],
  technical_issue: [
    'error',
    'crash',
    'broken',
    'not working',
    'fails',
    'exception',
    'timeout',
  ],
  billing_question: [
    'invoice',
    'payment',
    'refund',
    'charge',
    'subscription',
    'billing',
    'card declined',
  ],
  feature_request: [
    'feature request',
    'enhancement',
    'suggestion',
    'would be nice',
    'please add',
    'wish',
  ],
  bug_report: [
    'bug',
    'reproduction steps',
    'steps to reproduce',
    'defect',
    'regression',
  ],
};

const PRIORITY_KEYWORDS = {
  urgent: [
    "can't access",
    'cannot access',
    'critical',
    'production down',
    'security',
    'breach',
  ],
  high: ['important', 'blocking', 'asap', 'urgent for me'],
  low: ['minor', 'cosmetic', 'suggestion', 'nice to have'],
  medium: [],
};

module.exports = {
  CATEGORY_KEYWORDS,
  PRIORITY_KEYWORDS,
};
