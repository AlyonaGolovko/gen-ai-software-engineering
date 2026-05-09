// Targeted tests for branches the main suite doesn't naturally hit:
// parser fallbacks, repo edge cases, error middleware paths, and the
// classification log's defensive checks. These don't add new behavior —
// they pin down branches we already wrote, raising branch coverage past 85%.

const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../src/app');
const repo = require('../src/repositories/ticketRepository');
const classificationLog = require('../src/classification/classificationLog');
const { parseJson } = require('../src/parsers/jsonParser');
const { parseXml } = require('../src/parsers/xmlParser');
const { computeConfidence } = require('../src/classification/confidence');
const {
  ValidationError,
  NotFoundError,
  ParseError,
  UnsupportedMediaTypeError,
  PayloadTooLargeError,
} = require('../src/errors');

describe('Coverage gap fillers', () => {
  describe('Parsers — defensive paths', () => {
    test('parseJson throws on a primitive (number) — not object, not array', () => {
      expect(() => parseJson(Buffer.from('42'))).toThrow(ParseError);
    });

    test('parseJson throws on null', () => {
      expect(() => parseJson(Buffer.from('null'))).toThrow(ParseError);
    });

    test('parseXml throws when <tickets> root is missing', async () => {
      await expect(
        parseXml(Buffer.from('<other><ticket></ticket></other>')),
      ).rejects.toThrow(ParseError);
    });
  });

  describe('Repository — edge cases', () => {
    test('update on missing id returns null', () => {
      const result = repo.update('00000000-0000-4000-8000-000000000000', {
        status: 'closed',
      });
      expect(result).toBeNull();
    });

    test('delete on missing id returns false', () => {
      const removed = repo.delete('00000000-0000-4000-8000-000000000000');
      expect(removed).toBe(false);
    });

    test('status transition from resolved → in_progress clears resolved_at', () => {
      const created = repo.create({
        customer_id: 'c1',
        subject: 'X',
        description: 'long enough description here',
        status: 'resolved',
      });
      expect(created.resolved_at).not.toBeNull();

      const reopened = repo.update(created.id, { status: 'in_progress' });
      expect(reopened.resolved_at).toBeNull();
    });
  });

  describe('Confidence — numeric input and zero-floor', () => {
    test('computeConfidence accepts a numeric hits count', () => {
      expect(computeConfidence(2)).toBeCloseTo(0.67, 2);
    });

    test('computeConfidence floors negative input to 0', () => {
      expect(computeConfidence(-5)).toBe(0);
    });

    test('computeConfidence handles non-numeric, non-array input as 0', () => {
      expect(computeConfidence('not a number')).toBe(0);
    });
  });

  describe('Classification log — defensive checks', () => {
    test('record() throws on an invalid source value', () => {
      expect(() =>
        classificationLog.record({ ticket_id: 'x', source: 'bogus' }),
      ).toThrow(/Invalid classification log source/);
    });

    test('getByTicketId returns empty array when no entries match', () => {
      expect(classificationLog.getByTicketId('no-such-id')).toEqual([]);
    });

    test('record() defaults nullable fields when not provided', () => {
      const entry = classificationLog.record({
        ticket_id: 'partial',
        source: 'auto_create',
      });
      expect(entry.category).toBeNull();
      expect(entry.priority).toBeNull();
      expect(entry.confidence).toBeNull();
      expect(entry.keywords).toBeNull();
      expect(entry.reasoning).toBeNull();
      expect(entry.timestamp).toEqual(expect.stringMatching(/^\d{4}/));
    });
  });

  describe('Error classes — default messages and statusCode shapes', () => {
    test('NotFoundError default message and 404', () => {
      const e = new NotFoundError();
      expect(e.message).toBe('Not Found');
      expect(e.statusCode).toBe(404);
    });

    test('UnsupportedMediaTypeError default message and 415', () => {
      const e = new UnsupportedMediaTypeError();
      expect(e.statusCode).toBe(415);
    });

    test('PayloadTooLargeError default message and 413', () => {
      const e = new PayloadTooLargeError();
      expect(e.statusCode).toBe(413);
    });

    test('ValidationError carries details', () => {
      const e = new ValidationError('bad', ['x is required']);
      expect(e.statusCode).toBe(400);
      expect(e.details).toEqual(['x is required']);
    });
  });

  describe('App-level error middleware', () => {
    test('malformed JSON request body returns 400 with Malformed JSON body', async () => {
      const res = await request(app)
        .post('/tickets')
        .set('Content-Type', 'application/json')
        .send('{bad json');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Malformed JSON body');
    });

    test('upload exceeding 10 MB returns 413 from centralized middleware', async () => {
      const big = Buffer.alloc(11 * 1024 * 1024, 'a');
      const res = await request(app)
        .post('/tickets/import')
        .attach('file', big, { filename: 'big.csv', contentType: 'text/csv' });
      expect(res.status).toBe(413);
      expect(res.body.error).toMatch(/10 MB/);
    });

    test('unknown route returns 404 fallthrough', async () => {
      const res = await request(app).get('/no-such-thing');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });
  });

  describe('Routes — error & fallback branches', () => {
    test('GET /tickets/:id with malformed UUID returns 400', async () => {
      const res = await request(app).get('/tickets/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.details).toEqual(['"id" must be a valid UUID']);
    });

    test('PUT /tickets/:id with malformed UUID returns 400', async () => {
      const res = await request(app).put('/tickets/nope').send({ status: 'closed' });
      expect(res.status).toBe(400);
    });

    test('DELETE /tickets/:id with malformed UUID returns 400', async () => {
      const res = await request(app).delete('/tickets/nope');
      expect(res.status).toBe(400);
    });

    test('GET /tickets with invalid priority enum returns 400', async () => {
      const res = await request(app).get('/tickets?priority=super_urgent');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('GET /tickets with limit > 500 returns 400', async () => {
      const res = await request(app).get('/tickets?limit=9999');
      expect(res.status).toBe(400);
    });

    test('PUT /tickets/:id with invalid category enum returns 400', async () => {
      const created = await request(app)
        .post('/tickets')
        .send({
          customer_id: 'c1',
          customer_email: 'a@b.co',
          customer_name: 'Ana',
          subject: 'Hi',
          description: 'long enough description here',
        });
      const res = await request(app)
        .put(`/tickets/${created.body.id}`)
        .send({ category: 'invalid_category' });
      expect(res.status).toBe(400);
    });

    test('Import detects format via filename extension when mimetype is generic', async () => {
      const csv = 'customer_id,customer_email,customer_name,subject,description\nc1,a@b.co,Ana,Hi,long enough description here\n';
      const res = await request(app)
        .post('/tickets/import')
        .attach('file', Buffer.from(csv), {
          filename: 'fallback.csv',
          contentType: 'application/octet-stream',
        });
      expect(res.status).toBe(200);
      expect(res.body.successful).toBe(1);
    });
  });

  describe('Classification log — FIFO overflow', () => {
    test('record() evicts oldest entries beyond MAX_ENTRIES cap', () => {
      const { MAX_ENTRIES } = classificationLog;
      // record MAX_ENTRIES + 5 entries, oldest 5 should be evicted
      for (let i = 0; i < MAX_ENTRIES + 5; i += 1) {
        classificationLog.record({
          ticket_id: `t${i}`,
          source: 'auto_create',
        });
      }
      const all = classificationLog.getAll();
      expect(all).toHaveLength(MAX_ENTRIES);
      expect(all[0].ticket_id).toBe('t5'); // oldest 5 evicted
      expect(all[all.length - 1].ticket_id).toBe(`t${MAX_ENTRIES + 4}`);
    });
  });

  describe('Repository — filter coverage', () => {
    test('findAll filters by customer_id, status, and metadata.source', () => {
      repo.create({
        customer_id: 'A',
        subject: 's',
        description: 'long enough description here',
        status: 'in_progress',
        metadata: { source: 'email' },
      });
      repo.create({
        customer_id: 'B',
        subject: 's',
        description: 'long enough description here',
        status: 'closed',
        metadata: { source: 'web_form' },
      });

      expect(repo.findAll({ customer_id: 'A' }).total).toBe(1);
      expect(repo.findAll({ status: 'closed' }).total).toBe(1);
      expect(repo.findAll({ source: 'email' }).total).toBe(1);
      expect(repo.findAll({ source: 'phone' }).total).toBe(0);
    });
  });

  describe('Routes — additional fallback paths', () => {
    test('Import detects JSON via extension when mimetype is generic', async () => {
      const body = JSON.stringify([
        {
          customer_id: 'c1',
          customer_email: 'a@b.co',
          customer_name: 'Ana',
          subject: 'Hi',
          description: 'long enough description here',
        },
      ]);
      const res = await request(app)
        .post('/tickets/import')
        .attach('file', Buffer.from(body), {
          filename: 'fb.json',
          contentType: 'application/octet-stream',
        });
      expect(res.status).toBe(200);
      expect(res.body.successful).toBe(1);
    });

    test('Import detects XML via extension when mimetype is generic', async () => {
      const xml =
        '<tickets><ticket>' +
        '<customer_id>c1</customer_id>' +
        '<customer_email>a@b.co</customer_email>' +
        '<customer_name>Ana</customer_name>' +
        '<subject>Hi</subject>' +
        '<description>long enough description here</description>' +
        '</ticket></tickets>';
      const res = await request(app)
        .post('/tickets/import')
        .attach('file', Buffer.from(xml), {
          filename: 'fb.xml',
          contentType: 'application/octet-stream',
        });
      expect(res.status).toBe(200);
      expect(res.body.successful).toBe(1);
    });
  });

  describe('PUT /tickets/:id — manual-override branch', () => {
    test('PUT changing category logs a manual_override entry and nulls confidence', async () => {
      // Seed via auto_classify so confidence starts non-null
      const created = await request(app)
        .post('/tickets?auto_classify=true')
        .send({
          customer_id: 'c1',
          customer_email: 'a@b.co',
          customer_name: 'Ana',
          subject: "I can't access my account",
          description: 'login fails, password reset broken, locked out, security incident',
        });
      const { id } = created.body;
      expect(created.body.classification_confidence).toBeGreaterThan(0);

      classificationLog.clear();

      const res = await request(app)
        .put(`/tickets/${id}`)
        .send({ category: 'feature_request' });

      expect(res.status).toBe(200);
      expect(res.body.category).toBe('feature_request');
      expect(res.body.classification_confidence).toBeNull();

      const entries = classificationLog.getByTicketId(id);
      expect(entries).toHaveLength(1);
      expect(entries[0].source).toBe('manual_override');
      expect(entries[0].reasoning).toMatch(/category.*account_access.*feature_request/);
    });

    test('PUT changing priority alone logs a manual_override mentioning only priority', async () => {
      const created = await request(app)
        .post('/tickets')
        .send({
          customer_id: 'c1',
          customer_email: 'a@b.co',
          customer_name: 'Ana',
          subject: 'Hi',
          description: 'long enough description here',
          priority: 'medium',
        });
      const { id } = created.body;
      classificationLog.clear();

      await request(app).put(`/tickets/${id}`).send({ priority: 'urgent' });

      const entries = classificationLog.getByTicketId(id);
      expect(entries).toHaveLength(1);
      expect(entries[0].reasoning).toMatch(/priority.*medium.*urgent/);
      expect(entries[0].reasoning).not.toMatch(/category/);
    });
  });

  describe('PUT /tickets/:id — non-override branches', () => {
    test('PUT with same category as current is not flagged as an override', async () => {
      const created = await request(app)
        .post('/tickets')
        .send({
          customer_id: 'c1',
          customer_email: 'a@b.co',
          customer_name: 'Ana',
          subject: 'Hi',
          description: 'long enough description here',
          category: 'feature_request',
        });
      const { id } = created.body;
      classificationLog.clear();

      const res = await request(app)
        .put(`/tickets/${id}`)
        .send({ category: 'feature_request' });

      expect(res.status).toBe(200);
      expect(classificationLog.getByTicketId(id)).toHaveLength(0);
    });

    test('PUT with only non-classification fields does not log an override', async () => {
      const created = await request(app)
        .post('/tickets')
        .send({
          customer_id: 'c1',
          customer_email: 'a@b.co',
          customer_name: 'Ana',
          subject: 'Hi',
          description: 'long enough description here',
        });
      const { id } = created.body;
      classificationLog.clear();

      const res = await request(app)
        .put(`/tickets/${id}`)
        .send({ assigned_to: 'agent-9' });

      expect(res.status).toBe(200);
      expect(classificationLog.getByTicketId(id)).toHaveLength(0);
    });
  });
});
