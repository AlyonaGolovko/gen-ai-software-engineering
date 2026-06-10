const request = require('supertest');

const app = require('../src/app');
const { classifyCategory } = require('../src/classification/categoryClassifier');
const { classifyPriority } = require('../src/classification/priorityClassifier');
const { computeConfidence } = require('../src/classification/confidence');
const classificationLog = require('../src/classification/classificationLog');

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

describe('Classification', () => {
  test("K1: \"can't access my account, password reset failed\" → account_access + urgent", () => {
    // Plan's K1 parenthetical notes that "can't access" is what triggers urgent —
    // we use that phrase verbatim rather than "can't login" (not in the dictionary).
    const input = {
      subject: "I can't access my account",
      description: 'login fails, password reset failed, locked out',
    };

    expect(classifyCategory(input).category).toBe('account_access');
    expect(classifyPriority(input).priority).toBe('urgent');
  });

  test('K2: "Question about my last invoice and refund" → billing_question + medium', () => {
    const input = {
      subject: 'Question about my last invoice',
      description: 'wondering about a refund please',
    };

    expect(classifyCategory(input).category).toBe('billing_question');
    expect(classifyPriority(input).priority).toBe('medium');
  });

  test('K3: "Production down — critical security incident" → urgent priority, confidence ≥ 0.66', () => {
    const input = {
      subject: 'Production down',
      description: 'critical security incident, breach in progress',
    };

    const priorityResult = classifyPriority(input);
    const confidence = computeConfidence(priorityResult.matchedKeywords);

    expect(priorityResult.priority).toBe('urgent');
    expect(confidence).toBeGreaterThanOrEqual(0.66);
  });

  test('K4: "Minor cosmetic suggestion for the dashboard" → low priority', () => {
    const input = {
      subject: 'Minor cosmetic suggestion for the dashboard',
      description: 'just a small visual tweak request',
    };

    expect(classifyPriority(input).priority).toBe('low');
  });

  test('K5: "Please add a dark mode feature" → feature_request category', () => {
    const input = {
      subject: 'Please add a dark mode feature',
      description: 'would be nice to have dark mode in settings',
    };

    expect(classifyCategory(input).category).toBe('feature_request');
  });

  test('K6: "Bug: app crashes. Steps to reproduce..." → bug_report (outranks technical_issue)', () => {
    const input = {
      subject: 'Bug: app crashes',
      description: 'steps to reproduce: 1) open app, 2) click export. Bug confirmed.',
    };

    const result = classifyCategory(input);

    expect(result.category).toBe('bug_report');
    expect(result.scoresByCategory.bug_report).toBeGreaterThan(
      result.scoresByCategory.technical_issue,
    );
  });

  test('K7: "Just saying hi" → other / medium / confidence 0', () => {
    const input = {
      subject: 'Just saying hi',
      description: 'how are things going today',
    };

    const cat = classifyCategory(input);
    const pri = classifyPriority(input);

    expect(cat.category).toBe('other');
    expect(pri.priority).toBe('medium');
    expect(computeConfidence(cat.matchedKeywords)).toBe(0);
    expect(computeConfidence(pri.matchedKeywords)).toBe(0);
  });

  test('K8: POST /tickets/:id/auto-classify persists category, priority, confidence, classified_at', async () => {
    const created = await request(app).post('/tickets').send(
      ticketBody({
        subject: "I can't access my account",
        description: 'login fails, password reset broken, locked out — security issue',
      }),
    );
    const { id } = created.body;

    const res = await request(app).post(`/tickets/${id}/auto-classify`);
    expect(res.status).toBe(200);

    const fetched = await request(app).get(`/tickets/${id}`);
    expect(fetched.body.category).toBe('account_access');
    expect(fetched.body.priority).toBe('urgent');
    expect(fetched.body.classification_confidence).toBeGreaterThan(0);
    expect(fetched.body.classified_at).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });

  test('K9: classification log records an auto_classify_endpoint entry after the endpoint call', async () => {
    const created = await request(app).post('/tickets').send(
      ticketBody({
        subject: 'login fail',
        description: 'password reset broken, locked out',
      }),
    );
    const { id } = created.body;

    await request(app).post(`/tickets/${id}/auto-classify`);

    const entries = classificationLog.getByTicketId(id);
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('auto_classify_endpoint');
    expect(entries[0].category).toBe('account_access');
    expect(entries[0].timestamp).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });

  test('K10: POST /tickets?auto_classify=true with body priority="low" keeps low and logs the auto suggestion', async () => {
    const res = await request(app)
      .post('/tickets?auto_classify=true')
      .send(
        ticketBody({
          subject: 'critical security incident',
          description: 'production down, breach in progress',
          priority: 'low',
        }),
      );
    expect(res.status).toBe(201);
    expect(res.body.priority).toBe('low'); // manual override wins
    expect(res.body.classification_confidence).toBeNull();

    const entries = classificationLog.getByTicketId(res.body.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('manual_override');
    expect(entries[0].priority).toBe('urgent'); // auto-suggested value still logged
  });
});
