const cc = require('currency-codes');

function validate({ fromAccount, toAccount, amount, currency, type }) {
  const errors = [];

  if (!fromAccount || !toAccount || amount == null || !currency || !type) {
    errors.push('Missing required fields: fromAccount, toAccount, amount, currency, type');
    return errors;
  }

  if (typeof amount !== 'number' || amount <= 0) {
    errors.push('amount must be a positive number');
  } else {
    const decimals = amount.toString().split('.')[1];
    if (decimals && decimals.length > 2) {
      errors.push('amount must have at most 2 decimal places');
    }
  }

  const ACCOUNT_FORMAT = /^ACC-[A-Za-z0-9]{5}$/;

  if (!ACCOUNT_FORMAT.test(fromAccount)) {
    errors.push('fromAccount must follow format ACC-XXXXX (X is alphanumeric)');
  }

  if (!ACCOUNT_FORMAT.test(toAccount)) {
    errors.push('toAccount must follow format ACC-XXXXX (X is alphanumeric)');
  }

  if (!cc.code(currency)) {
    errors.push('currency must be a valid ISO 4217 code (e.g. USD, EUR, GBP)');
  }

  return errors;
}

module.exports = { validate };
