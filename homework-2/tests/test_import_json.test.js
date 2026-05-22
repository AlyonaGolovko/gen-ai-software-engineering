const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../src/app');
const { parseJson } = require('../src/parsers/jsonParser');
const { ParseError } = require('../src/errors');

const FIXTURES = path.join(__dirname, 'fixtures');

function ticketBody(overrides = {}) {
  return {
    customer_id: 'c1',
    customer_email: 'ana@example.com',
    customer_name: 'Ana',
    subject: 'Cannot log in',
    description: 'Locked out since this morning, password reset failed.',
    ...overrides,
  };
}

describe('JSON import', () => {
  test('J1: parseJson(valid_tickets.json) returns 20 objects', () => {
    const buffer = fs.readFileSync(path.join(FIXTURES, 'valid_tickets.json'));

    const records = parseJson(buffer);

    expect(records).toHaveLength(20);
    expect(records[0]).toEqual(
      expect.objectContaining({
        customer_id: expect.any(String),
        customer_email: expect.stringMatching(/@/),
      }),
    );
  });

  test('J2: parseJson(single_ticket.json) wraps a single object into a 1-element array', () => {
    const buffer = fs.readFileSync(path.join(FIXTURES, 'single_ticket.json'));

    const records = parseJson(buffer);

    expect(Array.isArray(records)).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0].customer_id).toBe('solo1');
  });

  test('J3: parseJson on malformed.json throws a ParseError', () => {
    const buffer = fs.readFileSync(path.join(FIXTURES, 'malformed.json'));

    expect(() => parseJson(buffer)).toThrow(ParseError);
  });

  test('J4: JSON array with one invalid email reports successful=N-1, failed=1 at the right index', async () => {
    const records = [
      ticketBody({ customer_id: 'c1' }),
      ticketBody({ customer_id: 'c2', customer_email: 'not-an-email' }),
      ticketBody({ customer_id: 'c3' }),
    ];
    const buffer = Buffer.from(JSON.stringify(records));

    const res = await request(app)
      .post('/tickets/import')
      .attach('file', buffer, { filename: 'mixed.json', contentType: 'application/json' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.successful).toBe(2);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].index).toBe(1);
    expect(res.body.errors[0].errors.some((m) => m.includes('customer_email'))).toBe(true);
  });

  test('J5: empty JSON array returns all-zero summary', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', Buffer.from('[]'), {
        filename: 'empty.json',
        contentType: 'application/json',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 0,
      successful: 0,
      failed: 0,
      successful_ids: [],
      errors: [],
    });
  });
});
