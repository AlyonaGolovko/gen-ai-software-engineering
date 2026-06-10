class HttpError extends Error {
  constructor(message, statusCode, details) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    if (details !== undefined) this.details = details;
  }
}

class ValidationError extends HttpError {
  constructor(message = 'Validation failed', details) {
    super(message, 400, details);
  }
}

class NotFoundError extends HttpError {
  constructor(message = 'Not Found') {
    super(message, 404);
  }
}

class ParseError extends HttpError {
  constructor(message) {
    super(message, 400);
  }
}

class UnsupportedMediaTypeError extends HttpError {
  constructor(message = 'Unsupported file type') {
    super(message, 415);
  }
}

class PayloadTooLargeError extends HttpError {
  constructor(message = 'File exceeds 10 MB limit') {
    super(message, 413);
  }
}

module.exports = {
  HttpError,
  ValidationError,
  NotFoundError,
  ParseError,
  UnsupportedMediaTypeError,
  PayloadTooLargeError,
};
