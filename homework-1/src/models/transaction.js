const { v4: uuidv4 } = require('uuid');

const transactions = [];

function create({ fromAccount, toAccount, amount, currency, type }) {
  const transaction = {
    id: uuidv4(),
    fromAccount,
    toAccount,
    amount,
    currency,
    type,
    status: 'completed',
    timestamp: new Date().toISOString(),
  };
  transactions.push(transaction);
  return transaction;
}

function findAll() {
  return transactions;
}

function findById(id) {
  return transactions.find((t) => t.id === id);
}

function getBalance(accountId) {
  let balance = 0;
  for (const t of transactions) {
    if (t.toAccount === accountId) {
      balance += t.amount;
    }
    if (t.fromAccount === accountId) {
      balance -= t.amount;
    }
  }
  return Math.round(balance * 100) / 100;
}

module.exports = { create, findAll, findById, getBalance };
