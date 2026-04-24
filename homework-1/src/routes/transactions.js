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

// GET /transactions — list all transactions
router.get('/transactions', (req, res) => {
  res.json(Transaction.findAll());
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

module.exports = router;
