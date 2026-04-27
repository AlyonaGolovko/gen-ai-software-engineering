const express = require('express');
const router = express.Router();
const Transaction = require('../models/transaction');
const { validate } = require('../validators/transaction');

// POST /transactions — create a new transaction
router.post('/transactions', (req, res) => {
  const { fromAccount, toAccount, amount, currency, type } = req.body;

  const errors = validate({ fromAccount, toAccount, amount, currency, type });
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const transaction = Transaction.create({ fromAccount, toAccount, amount, currency, type });
  res.status(201).json(transaction);
});

// GET /transactions — list all transactions (with optional filters)
router.get('/transactions', (req, res) => {
  let results = Transaction.findAll();

  const { accountId, type, from, to } = req.query;

  if (accountId) {
    results = results.filter(
      (t) => t.fromAccount === accountId || t.toAccount === accountId
    );
  }

  if (type) {
    results = results.filter((t) => t.type === type);
  }

  if (from) {
    results = results.filter((t) => t.timestamp >= new Date(from).toISOString());
  }

  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1);
    results = results.filter((t) => t.timestamp < toDate.toISOString());
  }

  res.json(results);
});

// GET /transactions/:id — get a single transaction
router.get('/transactions/:id', (req, res) => {
  const transaction = Transaction.findById(req.params.id);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  res.json(transaction);
});

// GET /accounts/:accountId/balance — get account balance
router.get('/accounts/:accountId/balance', (req, res) => {
  const balance = Transaction.getBalance(req.params.accountId);
  res.json({ accountId: req.params.accountId, balance });
});

// GET /accounts/:accountId/summary — get account summary
router.get('/accounts/:accountId/summary', (req, res) => {
  const summary = Transaction.getSummary(req.params.accountId);
  res.json(summary);
});

module.exports = router;
