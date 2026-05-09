const request = require('supertest');

const app = require('../src/app');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

describe('Ticket API', () => {
  test('T1: POST /tickets with valid body returns 201 and default status', async () => {
    const res = await request(app).post('/tickets').send(ticketBody());

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(UUID_RE);
    expect(res.body.created_at).toEqual(expect.any(String));
    expect(res.body.status).toBe('new');
  });

  test('T2: POST /tickets with invalid email returns 400 referencing customer_email', async () => {
    const res = await request(app)
      .post('/tickets')
      .send(ticketBody({ customer_email: 'not-an-email' }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.some((d) => d.includes('customer_email'))).toBe(true);
  });

  test('T3: POST /tickets missing subject returns 400', async () => {
    const body = ticketBody();
    delete body.subject;

    const res = await request(app).post('/tickets').send(body);

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => d.includes('subject'))).toBe(true);
  });

  test('T4: GET /tickets after seeding 3 returns all three', async () => {
    await request(app).post('/tickets').send(ticketBody({ customer_id: 'c1' }));
    await request(app).post('/tickets').send(ticketBody({ customer_id: 'c2' }));
    await request(app).post('/tickets').send(ticketBody({ customer_id: 'c3' }));

    const res = await request(app).get('/tickets');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.data).toHaveLength(3);
  });

  test('T5: GET /tickets?category=billing_question returns only billing tickets', async () => {
    await request(app).post('/tickets').send(ticketBody({ category: 'billing_question' }));
    await request(app).post('/tickets').send(ticketBody({ category: 'technical_issue' }));
    await request(app).post('/tickets').send(ticketBody({ category: 'billing_question' }));

    const res = await request(app).get('/tickets?category=billing_question');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data.every((t) => t.category === 'billing_question')).toBe(true);
  });

  test('T6: GET /tickets?priority=urgent returns only urgent tickets', async () => {
    await request(app).post('/tickets').send(ticketBody({ priority: 'urgent' }));
    await request(app).post('/tickets').send(ticketBody({ priority: 'low' }));
    await request(app).post('/tickets').send(ticketBody({ priority: 'urgent' }));

    const res = await request(app).get('/tickets?priority=urgent');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data.every((t) => t.priority === 'urgent')).toBe(true);
  });

  test('T7: GET /tickets/:id returns the ticket when it exists', async () => {
    const created = await request(app).post('/tickets').send(ticketBody({ subject: 'Specific subject' }));
    const { id } = created.body;

    const res = await request(app).get(`/tickets/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.subject).toBe('Specific subject');
    expect(res.body.customer_email).toBe('ana@example.com');
  });

  test('T8: GET /tickets/:id with non-existent UUID returns 404', async () => {
    const res = await request(app).get('/tickets/00000000-0000-4000-8000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Ticket not found');
  });

  test('T9: PUT /tickets/:id updating status to resolved sets resolved_at and bumps updated_at', async () => {
    const created = await request(app).post('/tickets').send(ticketBody());
    const { id, updated_at: createdUpdatedAt } = created.body;

    // ensure the timestamp can change at millisecond resolution
    await new Promise((r) => setTimeout(r, 5));

    const res = await request(app).put(`/tickets/${id}`).send({ status: 'resolved' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(res.body.resolved_at).not.toBeNull();
    expect(res.body.updated_at).not.toBe(createdUpdatedAt);
  });

  test('T10: PUT /tickets/:id for missing ticket returns 404', async () => {
    const res = await request(app)
      .put('/tickets/00000000-0000-4000-8000-000000000000')
      .send({ status: 'closed' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Ticket not found');
  });

  test('T11: DELETE /tickets/:id returns 204 and a subsequent GET returns 404', async () => {
    const created = await request(app).post('/tickets').send(ticketBody());
    const { id } = created.body;

    const del = await request(app).delete(`/tickets/${id}`);
    expect(del.status).toBe(204);

    const after = await request(app).get(`/tickets/${id}`);
    expect(after.status).toBe(404);
  });
});
