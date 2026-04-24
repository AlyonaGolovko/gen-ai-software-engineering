const express = require('express');
const router = express.Router();
const Transaction = require('../models/transaction');

// POST /transactions — create a new transaction
router.post('/transactions', (req, res) => {
  const { fromAccount, toAccount, amount, currency, type } = req.body;

  // Minimal validation: required fields + amount must be a positive number
  if (!fromAccount || !toAccount || amount == null || !currency || !type) {
    return res.status(400).json({ error: 'Missing required fields: fromAccount, toAccount, amount, currency, type' });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
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
