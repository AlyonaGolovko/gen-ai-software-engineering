const { ParseError } = require('../errors');

function parseJson(buffer) {
  let data;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch (err) {
    throw new ParseError(`Malformed JSON: ${err.message}`);
  }
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return [data];
  throw new ParseError('Malformed JSON: expected object or array of tickets');
}

module.exports = { parseJson };
