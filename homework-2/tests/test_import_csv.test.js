const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../src/app');
const { parseCsv } = require('../src/parsers/csvParser');
const { ParseError } = require('../src/errors');

const FIXTURES = path.join(__dirname, 'fixtures');

describe('CSV import', () => {
  test('C1: parseCsv(valid_tickets.csv) returns 50 normalized objects with nested metadata', () => {
    const buffer = fs.readFileSync(path.join(FIXTURES, 'valid_tickets.csv'));

    const records = parseCsv(buffer);

    expect(records).toHaveLength(50);
    expect(records[0].metadata).toEqual(expect.objectContaining({
      source: expect.any(String),
      browser: expect.any(String),
      device_type: expect.any(String),
    }));
    // The flat 'metadata.source' column should be folded into nested metadata,
    // not survive as a literal key. Array form prevents Jest's dot-path traversal.
    expect(records[0]).not.toHaveProperty(['metadata.source']);
  });

  test('C2: a quoted description containing a comma is preserved verbatim', () => {
    const csv =
      'customer_id,customer_email,customer_name,subject,description\n' +
      'c1,a@b.co,Ana,Issue,"Hello, world — comma inside quotes"\n';

    const records = parseCsv(Buffer.from(csv));

    expect(records).toHaveLength(1);
    expect(records[0].description).toBe('Hello, world — comma inside quotes');
  });

  test('C3: parseCsv on malformed.csv throws a ParseError', () => {
    const buffer = fs.readFileSync(path.join(FIXTURES, 'malformed.csv'));

    expect(() => parseCsv(buffer)).toThrow(ParseError);
  });

  test('C4: POST /tickets/import with invalid_tickets.csv reports failed=10 and successful=0', async () => {
    const buffer = fs.readFileSync(path.join(FIXTURES, 'invalid_tickets.csv'));

    const res = await request(app)
      .post('/tickets/import')
      .attach('file', buffer, { filename: 'invalid.csv', contentType: 'text/csv' });

    expect(res.status).toBe(400); // all-fail signals total rejection
    expect(res.body.total).toBe(10);
    expect(res.body.failed).toBe(10);
    expect(res.body.successful).toBe(0);
    expect(res.body.successful_ids).toEqual([]);
    expect(res.body.errors).toHaveLength(10);
    expect(res.body.errors[0]).toEqual(
      expect.objectContaining({
        index: expect.any(Number),
        errors: expect.arrayContaining([expect.any(String)]),
      }),
    );
  });

  test('C5: empty CSV (header only) returns total/successful/failed all zero', async () => {
    const headerOnly = 'customer_id,customer_email,customer_name,subject,description\n';

    const res = await request(app)
      .post('/tickets/import')
      .attach('file', Buffer.from(headerOnly), {
        filename: 'empty.csv',
        contentType: 'text/csv',
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

  test('C6: extra unknown columns are ignored; valid columns parse normally', async () => {
    const csv =
      'customer_id,customer_email,customer_name,subject,description,extra_unknown,another_unknown\n' +
      'c1,a@b.co,Ana,Hi,Long enough description for the validator,foo,bar\n' +
      'c2,b@b.co,Ben,Hello,Another long enough description string here,baz,qux\n';

    const res = await request(app)
      .post('/tickets/import')
      .attach('file', Buffer.from(csv), { filename: 'extra.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.successful).toBe(2);
    expect(res.body.failed).toBe(0);
  });
});
