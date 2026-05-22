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

function getSummary(accountId) {
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let transactionCount = 0;
  let mostRecentTransaction = null;
  for (const t of transactions) {
    if (t.toAccount === accountId || t.fromAccount === accountId) {
      transactionCount++;
      if (!mostRecentTransaction || t.timestamp > mostRecentTransaction) {
        mostRecentTransaction = t.timestamp;
      }
    }
    if (t.toAccount === accountId) {
      totalDeposits += t.amount;
    }
    if (t.fromAccount === accountId) {
      totalWithdrawals += t.amount;
    }
  }
  return {
    accountId,
    totalDeposits: Math.round(totalDeposits * 100) / 100,
    totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
    transactionCount,
    mostRecentTransaction,
  };
}

module.exports = { create, findAll, findById, getBalance, getSummary };
