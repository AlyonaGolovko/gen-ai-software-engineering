class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
    this.statusCode = 400;
  }
}

module.exports = {
  ParseError,
};
