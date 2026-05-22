const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../src/app');
const { parseXml } = require('../src/parsers/xmlParser');
const { ParseError } = require('../src/errors');

const FIXTURES = path.join(__dirname, 'fixtures');

function ticketXml(fields) {
  const f = {
    customer_id: 'c1',
    customer_email: 'ana@example.com',
    customer_name: 'Ana',
    subject: 'Cannot log in',
    description: 'Locked out since this morning, password reset failed.',
    ...fields,
  };
  const lines = ['  <ticket>'];
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined) continue;
    lines.push(`    <${k}>${v}</${k}>`);
  }
  lines.push('  </ticket>');
  return lines.join('\n');
}

describe('XML import', () => {
  test('X1: parseXml(valid_tickets.xml) returns 30 tickets with nested metadata', async () => {
    const buffer = fs.readFileSync(path.join(FIXTURES, 'valid_tickets.xml'));

    const records = await parseXml(buffer);

    expect(records).toHaveLength(30);
    expect(records[0].metadata).toEqual(
      expect.objectContaining({
        source: expect.any(String),
        device_type: expect.any(String),
      }),
    );
    expect(typeof records[0].metadata).toBe('object');
  });

  test('X2: parseXml on malformed.xml throws a ParseError', async () => {
    const buffer = fs.readFileSync(path.join(FIXTURES, 'malformed.xml'));

    await expect(parseXml(buffer)).rejects.toThrow(ParseError);
  });

  test('X3: single <ticket> element is wrapped into a 1-element array', async () => {
    const xml = `<tickets>${ticketXml({ customer_id: 'solo' })}</tickets>`;

    const records = await parseXml(Buffer.from(xml));

    expect(Array.isArray(records)).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0].customer_id).toBe('solo');
  });

  test('X4: a ticket missing <customer_email> is reported as failed=1 with a descriptive error', async () => {
    const xml =
      '<tickets>\n' +
      ticketXml({ customer_id: 'good' }) +
      '\n' +
      ticketXml({ customer_id: 'bad', customer_email: undefined }) +
      '\n</tickets>';

    const res = await request(app)
      .post('/tickets/import')
      .attach('file', Buffer.from(xml), {
        filename: 'mixed.xml',
        contentType: 'application/xml',
      });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.successful).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors[0].index).toBe(1);
    expect(res.body.errors[0].errors.some((m) => m.includes('customer_email'))).toBe(true);
  });

  test('X5: multiple <tag> elements produce a string array of the same values', async () => {
    const xml =
      '<tickets><ticket>' +
      '<customer_id>c1</customer_id>' +
      '<customer_email>a@b.co</customer_email>' +
      '<customer_name>Ana</customer_name>' +
      '<subject>Tags</subject>' +
      '<description>Long enough description for the validator</description>' +
      '<tags><tag>login</tag><tag>2fa</tag><tag>password</tag></tags>' +
      '</ticket></tickets>';

    const records = await parseXml(Buffer.from(xml));

    expect(records).toHaveLength(1);
    expect(records[0].tags).toEqual(['login', '2fa', 'password']);
  });
});
