const request = require('supertest');

const app = require('../src/app');

jest.setTimeout(30_000);

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

function generateCsv(rowCount) {
  const header =
    'customer_id,customer_email,customer_name,subject,description,category,priority,status';
  const rows = [];
  for (let i = 0; i < rowCount; i += 1) {
    rows.push(
      [
        `cust${i}`,
        `user${i}@example.com`,
        `User ${i}`,
        `Subject ${i}`,
        'Long enough description for the validator',
        'technical_issue',
        'medium',
        'new',
      ].join(','),
    );
  }
  return `${header}\n${rows.join('\n')}\n`;
}

describe('Performance budgets', () => {
  test('P1: 1,000-row CSV import completes in <5,000 ms with successful === 1000', async () => {
    const csv = generateCsv(1000);

    const start = Date.now();
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', Buffer.from(csv), {
        filename: 'big.csv',
        contentType: 'text/csv',
      });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.successful).toBe(1000);
    expect(elapsed).toBeLessThan(5000);
  });

  test('P2: 100 sequential POST /tickets average <50 ms each', async () => {
    const N = 100;
    const start = Date.now();
    for (let i = 0; i < N; i += 1) {
      const res = await request(app)
        .post('/tickets')
        .send(ticketBody({ customer_id: `c${i}` }));
      expect(res.status).toBe(201);
    }
    const avg = (Date.now() - start) / N;
    expect(avg).toBeLessThan(50);
  });

  test('P3: 100 sequential GET /tickets/:id average <20 ms each', async () => {
    const created = await request(app).post('/tickets').send(ticketBody());
    const { id } = created.body;

    const N = 100;
    const start = Date.now();
    for (let i = 0; i < N; i += 1) {
      const res = await request(app).get(`/tickets/${id}`);
      expect(res.status).toBe(200);
    }
    const avg = (Date.now() - start) / N;
    expect(avg).toBeLessThan(20);
  });

  test('P4: 100 concurrent mixed reads/writes complete in <10,000 ms with zero errors', async () => {
    // Seed one ticket so reads have a real target
    const seed = await request(app).post('/tickets').send(ticketBody());
    const seedId = seed.body.id;

    const N = 100;
    const ops = Array.from({ length: N }, (_, i) =>
      i % 2 === 0
        ? request(app).post('/tickets').send(ticketBody({ customer_id: `mix${i}` }))
        : request(app).get(`/tickets/${seedId}`),
    );

    const start = Date.now();
    const responses = await Promise.all(ops);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10_000);
    const errors = responses.filter((r) => r.status >= 400);
    expect(errors).toHaveLength(0);
  });

  test('P5: 100 sequential POST /tickets/:id/auto-classify average <100 ms each', async () => {
    const created = await request(app).post('/tickets').send(
      ticketBody({
        subject: "I can't access my account",
        description: 'login fails, password reset broken, locked out',
      }),
    );
    const { id } = created.body;

    const N = 100;
    const start = Date.now();
    for (let i = 0; i < N; i += 1) {
      const res = await request(app).post(`/tickets/${id}/auto-classify`);
      expect(res.status).toBe(200);
    }
    const avg = (Date.now() - start) / N;
    expect(avg).toBeLessThan(100);
  });
});
