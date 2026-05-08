const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const ticketsRouter = require('./routes/tickets');

const app = express();

app.use(helmet());
app.use(cors());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use(express.json({ limit: '10mb' }));

app.use('/tickets', ticketsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (err && typeof err.statusCode === 'number') {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
