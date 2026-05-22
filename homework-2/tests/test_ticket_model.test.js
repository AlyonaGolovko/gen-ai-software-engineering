const { createTicketSchema, validate } = require('../src/models/ticketSchema');

function payload(overrides = {}) {
  return {
    customer_id: 'c1',
    customer_email: 'ana@example.com',
    customer_name: 'Ana',
    subject: 'Cannot log in',
    description: 'Locked out since this morning, password reset failed.',
    ...overrides,
  };
}

function messagesOf(error) {
  return (error?.details || []).map((d) => d.message);
}

describe('Ticket model (Joi schema)', () => {
  test('M1: fully valid payload produces no error', () => {
    const { error, value } = validate(payload(), createTicketSchema);

    expect(error).toBeUndefined();
    expect(value.status).toBe('new'); // default applied
    expect(value.tags).toEqual([]); // default applied
  });

  test('M2: subject empty string produces a subject error', () => {
    const { error } = validate(payload({ subject: '' }), createTicketSchema);

    expect(error).toBeDefined();
    expect(messagesOf(error).some((m) => m.includes('subject'))).toBe(true);
  });

  test('M3: subject 201 chars produces a length error', () => {
    const { error } = validate(
      payload({ subject: 'x'.repeat(201) }),
      createTicketSchema,
    );

    expect(error).toBeDefined();
    const msgs = messagesOf(error);
    expect(msgs.some((m) => m.includes('subject') && /length|200/.test(m))).toBe(true);
  });

  test('M4: description 5 chars produces a length error', () => {
    const { error } = validate(
      payload({ description: 'short' }),
      createTicketSchema,
    );

    expect(error).toBeDefined();
    expect(messagesOf(error).some((m) => m.includes('description'))).toBe(true);
  });

  test('M5: description 2001 chars produces a length error', () => {
    const { error } = validate(
      payload({ description: 'x'.repeat(2001) }),
      createTicketSchema,
    );

    expect(error).toBeDefined();
    const msgs = messagesOf(error);
    expect(msgs.some((m) => m.includes('description') && /length|2000/.test(m))).toBe(
      true,
    );
  });

  test('M6: customer_email "not-an-email" produces an email error', () => {
    const { error } = validate(
      payload({ customer_email: 'not-an-email' }),
      createTicketSchema,
    );

    expect(error).toBeDefined();
    expect(
      messagesOf(error).some((m) => m.includes('customer_email') && /email/i.test(m)),
    ).toBe(true);
  });

  test('M7: category "invalid_category" lists allowed enum values', () => {
    const { error } = validate(
      payload({ category: 'invalid_category' }),
      createTicketSchema,
    );

    expect(error).toBeDefined();
    const msgs = messagesOf(error);
    expect(msgs.some((m) => m.includes('account_access'))).toBe(true);
    expect(msgs.some((m) => m.includes('billing_question'))).toBe(true);
  });

  test('M8: priority "super_urgent" produces a priority enum error', () => {
    const { error } = validate(
      payload({ priority: 'super_urgent' }),
      createTicketSchema,
    );

    expect(error).toBeDefined();
    const msgs = messagesOf(error);
    expect(msgs.some((m) => m.includes('priority'))).toBe(true);
    expect(msgs.some((m) => m.includes('urgent') && m.includes('low'))).toBe(true);
  });

  test('M9: status "deleted" produces a status enum error', () => {
    const { error } = validate(
      payload({ status: 'deleted' }),
      createTicketSchema,
    );

    expect(error).toBeDefined();
    const msgs = messagesOf(error);
    expect(msgs.some((m) => m.includes('status'))).toBe(true);
    expect(msgs.some((m) => m.includes('new') && m.includes('closed'))).toBe(true);
  });
});
